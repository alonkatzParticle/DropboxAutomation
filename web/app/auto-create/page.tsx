"use client";

/**
 * auto-create/page.tsx — Auto-Creator page
 *
 * Fetches all Monday.com tasks missing a Dropbox folder and splits them into:
 *   - New Tasks: detected by the Python poller (queued via new_item_ids in state.json)
 *   - Needs Attention: department not recognized → user picks path manually
 *   - Ready to Create: department matched → one-click or "Create All" creation
 *
 * A toggle bar at the top enables live detection: when ON, the page polls
 * Monday.com every 30 seconds and surfaces any tasks queued by the Python poller.
 *
 * Side panel shows existing department hierarchy rules for reference while
 * the user is choosing a location for an ambiguous task.
 *
 * Depends on: /api/auto-create, /api/auto, /api/config,
 *             AmbiguousTaskCard.tsx, ReadyTasksList.tsx
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, AlertTriangle, Zap, CheckCircle2, ChevronDown, ChevronRight, Flag, ExternalLink, Bell, Ban } from "lucide-react";
import AmbiguousTaskCard, { AmbiguousTask } from "@/components/AmbiguousTaskCard";
import ReadyTasksList, { ReadyTask } from "@/components/ReadyTasksList";

// One department rule from config.json (also passed to PathBuilder for template selection)
interface DeptRule {
  dropbox_folder?: string;
  path_template?: string[];
}

// Board-level config (just what auto-create needs)
interface BoardInfo {
  name: string;
  department_rules: Record<string, DeptRule>;
}

export default function AutoCreatorPage() {
  const [ready, setReady] = useState<ReadyTask[]>([]);
  const [ambiguous, setAmbiguous] = useState<AmbiguousTask[]>([]);
  const [approvedWithFolder, setApprovedWithFolder] = useState<{ id: string; boardId: string; boardName: string; taskName: string; mondayUrl: string; dropboxLink: string }[]>([]);
  const [groupWarnings, setGroupWarnings] = useState<{ boardId: string; boardName: string; configured: string; foundGroups: string[] }[]>([]);
  // Per-board department rules: boardId → { name, department_rules }
  const [boardsInfo, setBoardsInfo] = useState<Record<string, BoardInfo>>({});
  const [dropboxRoot, setDropboxRoot] = useState("/Creative 2026");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Auto-detect toggle state (synced with /api/auto → state.json)
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);

  // IDs dismissed by the user — hides them from the "New Tasks" section
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // IDs of tasks currently being skipped (shows spinner on their skip button)
  const [skippingIds, setSkippingIds] = useState<Set<string>>(new Set());

  // "Last checked X seconds ago" counter — resets to 0 after each load
  const [secsSinceCheck, setSecsSinceCheck] = useState(0);
  const secsSinceCheckRef = useRef(0);

  // History of the last 50 auto-created folders
  const [history, setHistory] = useState<{ taskName: string; boardName: string; previewPath: string; createdAt: string }[]>([]);

  // Index of the history entry whose full path is currently expanded
  const [expandedHistoryIndex, setExpandedHistoryIndex] = useState<number | null>(null);

  // Collapsed state for each section (default all open)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Board filter — null means no board selected yet (user must pick)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  /** Send a task to Skipped Tasks, then reload the list. */
  async function skipTask(id: string) {
    setSkippingIds(prev => new Set(prev).add(id));
    try {
      await fetch("/api/skipped-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", itemId: id, reason: "Manually skipped" }),
      });
      await load();
    } finally {
      setSkippingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  /** Toggle a section open/closed by name */
  function toggleSection(name: string) {
    setCollapsedSections(prev => ({ ...prev, [name]: !prev[name] }));
  }

  /** Select a board and persist to localStorage */
  function selectBoard(id: string) {
    setSelectedBoardId(id);
    localStorage.setItem("auto-create-board", id);
  }

  /**
   * Full refresh — shows loading spinner, replaces the entire task list.
   * Seeds the seen-IDs set so the next silent poll can detect what's new.
   * Called on mount and when the user clicks Refresh.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tasksRes, cfgRes] = await Promise.all([
        fetch("/api/auto-create"),
        fetch("/api/config"),
      ]);
      const tasks = await tasksRes.json();
      const cfg = await cfgRes.json();

      const allReady: ReadyTask[] = tasks.ready ?? [];
      const allAmbiguous: AmbiguousTask[] = tasks.ambiguous ?? [];
      setReady(allReady);
      setAmbiguous(allAmbiguous);
      setApprovedWithFolder(tasks.approvedWithFolder ?? []);
      setGroupWarnings(tasks.groupWarnings ?? []);
      setDropboxRoot(cfg.dropbox_root ?? "/Creative 2026");

      // Build per-board info map from cfg.boards
      const info: Record<string, BoardInfo> = {};
      for (const [id, b] of Object.entries((cfg.boards ?? {}) as Record<string, Record<string, unknown>>)) {
        info[id] = {
          name: (b.name as string) ?? id,
          department_rules: (b.department_rules as Record<string, DeptRule>) ?? {},
        };
      }
      setBoardsInfo(info);

    } catch {
      setError("Failed to load tasks. Check that the server is running.");
    }

    secsSinceCheckRef.current = 0;
    setSecsSinceCheck(0);
    setLoading(false);
  }, []);

  /**
   * Silent background poll — no loading spinner, no page disruption.
   * Fetches all tasks, then auto-creates Dropbox folders for any ready tasks
   * that are in the Form Requests group (isNew) and not yet dismissed.
   * Ambiguous tasks are skipped and stay in Needs Attention.
   * Called automatically every 30 seconds when auto-detect is ON.
   */
  const silentPoll = useCallback(async () => {
    try {
      const res = await fetch("/api/auto-create");
      const tasks = await res.json();

      const readyTasks: ReadyTask[] = tasks.ready ?? [];

      // Auto-create folders for ready Form Request tasks
      const toCreate = readyTasks.filter(t => t.isNew);
      if (toCreate.length > 0) {
        const results = await Promise.all(
          toCreate.map(t =>
            fetch("/api/auto-create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ boardId: t.boardId, itemId: t.id }),
            })
              .then(r => r.json())
              .then(data => ({ task: t, data }))
              .catch(() => null)
          )
        );

        // Log successful creations to history
        const now = new Date().toISOString();
        const newEntries = results
          .filter((r): r is { task: ReadyTask; data: { success: boolean; path: string } } =>
            r !== null && r.data?.success === true
          )
          .map(({ task, data }) => ({
            taskName: task.taskName,
            boardName: task.boardName,
            previewPath: data.path,
            createdAt: now,
          }));

        if (newEntries.length > 0) {
          fetch("/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newEntries),
          })
            .then(r => r.json())
            .then(d => setHistory(d.entries ?? []))
            .catch(() => {});
        }

        // Refresh task list so newly linked tasks disappear
        const refreshRes = await fetch("/api/auto-create");
        const refreshed = await refreshRes.json();
        setReady(refreshed.ready ?? []);
        setAmbiguous(refreshed.ambiguous ?? []);
        setApprovedWithFolder(refreshed.approvedWithFolder ?? []);
        setGroupWarnings(refreshed.groupWarnings ?? []);
      } else {
        setReady(readyTasks);
        setAmbiguous(tasks.ambiguous ?? []);
        setApprovedWithFolder(tasks.approvedWithFolder ?? []);
        setGroupWarnings(tasks.groupWarnings ?? []);
      }
    } catch {
      // Silently ignore — don't disrupt the UI on a background poll failure
    }

    secsSinceCheckRef.current = 0;
    setSecsSinceCheck(0);
  }, []);

  /** Poll silently every 30 seconds when auto-detect is ON */
  useEffect(() => {
    if (!autoEnabled) return;
    const id = setInterval(silentPoll, 30_000);
    return () => clearInterval(id);
  }, [autoEnabled, silentPoll]);

  /** On mount: restore board selection from localStorage */
  useEffect(() => {
    const saved = localStorage.getItem("auto-create-board");
    if (saved) setSelectedBoardId(saved);
  }, []);

  /** On mount: load tasks, fetch auto_enabled flag, and load history */
  useEffect(() => {
    load();
    fetch("/api/auto")
      .then(r => r.json())
      .then(d => setAutoEnabled(d.enabled ?? false))
      .catch(() => {});
    fetch("/api/history")
      .then(r => r.json())
      .then(d => setHistory(d.entries ?? []))
      .catch(() => {});
  }, [load]);

  /** Tick the "last checked" counter every second */
  useEffect(() => {
    const id = setInterval(() => {
      secsSinceCheckRef.current += 1;
      setSecsSinceCheck(secsSinceCheckRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);


  /**
   * Toggle auto-detect on/off and persist the setting via /api/auto.
   */
  async function handleToggleAuto(value: boolean) {
    setTogglingAuto(true);
    try {
      await fetch("/api/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: value }),
      });
      setAutoEnabled(value);
    } catch {
      // Revert on failure
    }
    setTogglingAuto(false);
  }

  /** Human-readable "last checked" label */
  function lastCheckedLabel() {
    if (secsSinceCheck < 5) return "just now";
    if (secsSinceCheck < 60) return `${secsSinceCheck}s ago`;
    return `${Math.floor(secsSinceCheck / 60)}m ago`;
  }

  return (
    <div className="flex h-full min-h-screen">

      {/* ── Main panel ── */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">

        {/* Auto-detect toggle bar */}
        <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">Auto-detect</span>
            {/* Toggle switch — persists via /api/auto → state.json */}
            <Switch
              checked={autoEnabled}
              onCheckedChange={handleToggleAuto}
              disabled={togglingAuto}
            />
            <span className={`text-xs font-medium ${autoEnabled ? "text-green-600" : "text-muted-foreground"}`}>
              {autoEnabled ? "ON" : "OFF"}
            </span>
          </div>

          {/* "Last checked" counter — only shown when auto is ON */}
          {autoEnabled && (
            <span className="text-xs text-muted-foreground">
              Last checked: {lastCheckedLabel()}
            </span>
          )}

          {/* New tasks detected badge */}
          {(() => {
            const newCount = [...ready, ...ambiguous].filter(t => t.isNew && !dismissedIds.has(t.id) && (!selectedBoardId || t.boardId === selectedBoardId)).length;
            return newCount > 0 ? (
              <Badge className="bg-blue-100 text-blue-700 border-blue-300 gap-1" variant="outline">
                <Bell className="h-3 w-3" />
                {newCount} new task{newCount > 1 ? "s" : ""} in Form Requests
              </Badge>
            ) : null;
          })()}

          {/* Helper text when auto is OFF */}
          {!autoEnabled && (
            <span className="text-xs text-muted-foreground">
              Turn on to automatically detect new Monday.com tasks via webhook.
            </span>
          )}
        </div>

        {/* Group name mismatch warnings */}
        {groupWarnings.filter(w => !selectedBoardId || w.boardId === selectedBoardId).map(w => (
          <div key={w.boardId} className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">{w.boardName}:</span> Form Requests group not found.{" "}
              Config says <code className="bg-amber-100 px-1 rounded">{w.configured}</code> but groups on this board are:{" "}
              <span className="font-medium">{w.foundGroups.join(", ")}</span>.{" "}
              Update <code className="bg-amber-100 px-1 rounded">form_requests_group</code> in Settings.
            </div>
          </div>
        ))}

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Auto-Creator</h1>
            <p className="text-sm text-muted-foreground">Monday.com tasks missing a Dropbox folder</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Board selector — populated from config, not hardcoded */}
            <select
              value={selectedBoardId ?? ""}
              onChange={e => selectBoard(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="" disabled>Select a board…</option>
              {Object.entries(boardsInfo).map(([id, info]) => (
                <option key={id} value={id}>{info.name}</option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Task sections */}
        {!loading && !error && (
          <>
            {/* Empty state — no board selected */}
            {!selectedBoardId && (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                <p className="text-lg font-medium">Select a board to get started</p>
                <p className="text-sm mt-1">Use the dropdown above to choose a board</p>
              </div>
            )}

            {/* New Tasks — tasks in the "Form Requests" group with no Dropbox folder */}
            {selectedBoardId && (() => {
              const newAmbiguous = ambiguous.filter(t => t.isNew && !dismissedIds.has(t.id) && t.boardId === selectedBoardId);
              const newReady = ready.filter(t => t.isNew && !dismissedIds.has(t.id) && t.boardId === selectedBoardId);
              const total = newAmbiguous.length + newReady.length;
              if (total === 0) return null;
              return (
                <section className="space-y-3 border border-blue-200 rounded-lg p-4 bg-blue-50/40">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-blue-600" />
                    <h2 className="font-medium text-sm">New Tasks</h2>
                    <Badge variant="outline" className="text-blue-600 border-blue-300">{total}</Badge>
                    <span className="text-xs text-muted-foreground">detected by polling — no folder yet</span>
                    <button
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setDismissedIds(prev => new Set([...prev, ...newAmbiguous.map(t => t.id), ...newReady.map(t => t.id)]))}
                    >
                      Dismiss all
                    </button>
                  </div>
                  <div className="space-y-2">
                    {newAmbiguous.map(task => (
                      <AmbiguousTaskCard
                        key={task.id}
                        task={task}
                        dropboxRoot={dropboxRoot}
                        deptRules={boardsInfo[task.boardId]?.department_rules ?? {}}
                        onCreated={load}
                        onSkipped={load}
                        highlighted
                      />
                    ))}
                    {newReady.map(task => (
                      <div key={task.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-4 py-3 border border-blue-100">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{task.taskName}</p>
                            <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs" variant="outline">New</Badge>
                            <a href={task.mondayUrl} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">{task.previewPath}</p>
                          <p className="text-xs text-muted-foreground">{task.boardName}</p>
                        </div>
                        {/* Skip button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground h-8 px-2 shrink-0"
                          disabled={skippingIds.has(task.id)}
                          onClick={() => skipTask(task.id)}
                          title="Skip this task (no Dropbox folder needed)"
                        >
                          {skippingIds.has(task.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Needs Attention — tasks with unrecognized departments */}
            {selectedBoardId && (() => {
              const visibleAmbiguous = ambiguous.filter(t => t.boardId === selectedBoardId);
              if (visibleAmbiguous.length === 0) return null;
              return (
              <section className="space-y-3">
                <button
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => toggleSection("attention")}
                >
                  {collapsedSections["attention"] ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h2 className="font-medium text-sm">Needs Attention</h2>
                  <Badge variant="outline" className="text-amber-600 border-amber-300">{visibleAmbiguous.length}</Badge>
                </button>
                {!collapsedSections["attention"] && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      No Dropbox folder yet, and no matching hierarchy rule — choose a folder location for each task below.
                    </p>
                    <div className="space-y-3">
                      {visibleAmbiguous.map(task => (
                        <AmbiguousTaskCard
                          key={task.id}
                          task={task}
                          dropboxRoot={dropboxRoot}
                          deptRules={boardsInfo[task.boardId]?.department_rules ?? {}}
                          onCreated={load}
                          onSkipped={load}
                          highlighted={task.isNew && !dismissedIds.has(task.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>
              );
            })()}

            {/* Ready to Create */}
            {selectedBoardId && (
              <ReadyTasksList
                tasks={ready.filter(t => t.boardId === selectedBoardId)}
                onCreated={load}
                onSkipped={load}
                highlightedIds={new Set(ready.filter(t => t.isNew && !dismissedIds.has(t.id)).map(t => t.id))}
                collapsed={collapsedSections["ready"] ?? false}
                onToggleCollapse={() => toggleSection("ready")}
              />
            )}

            {/* Already Has a Folder — Approved tasks that already had a Dropbox link (no new folder created) */}
            {selectedBoardId && approvedWithFolder.filter(t => t.boardId === selectedBoardId).length > 0 && (
              <section className="space-y-3">
                <button
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => toggleSection("linked")}
                >
                  {collapsedSections["linked"] ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <Flag className="h-4 w-4 text-blue-500" />
                  <h2 className="font-medium text-sm">Already Has a Folder</h2>
                  <Badge variant="outline" className="text-blue-600 border-blue-300">{approvedWithFolder.filter(t => t.boardId === selectedBoardId).length}</Badge>
                </button>
                {!collapsedSections["linked"] && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      These tasks are Approved but already had a Dropbox folder — no new folder was created.
                    </p>
                    <div className="space-y-2">
                      {approvedWithFolder.filter(t => t.boardId === selectedBoardId).map(task => (
                        <div key={task.id} className="flex items-center gap-3 border border-blue-200 bg-blue-50/30 rounded-lg px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Flag className="h-3 w-3 text-blue-400 shrink-0" />
                              <p className="text-sm font-medium truncate">{task.taskName}</p>
                              <p className="text-xs text-muted-foreground">{task.boardName}</p>
                              <a href={task.mondayUrl} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            <a href={task.dropboxLink} target="_blank" rel="noreferrer"
                              className="text-xs text-blue-600 hover:underline font-mono break-all">
                              {task.dropboxLink}
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* ── Side panel: Past Hierarchies ── */}
      <aside className="w-64 shrink-0 border-l border-border/60 p-4 space-y-4 overflow-y-auto bg-muted/20">
        <div>
          <h2 className="font-medium text-sm">Past Hierarchies</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Reference for building new folder structures
          </p>
        </div>

        {/* One block per board showing that board's dept rules — filtered to selected board */}
        {Object.entries(boardsInfo).filter(([id]) => !selectedBoardId || id === selectedBoardId).map(([boardId, board]) => (
          <div key={boardId} className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">{board.name}</p>
            {Object.entries(board.department_rules).map(([name, rule]) => (
              <div key={name} className="space-y-1">
                <p className="text-xs font-semibold text-foreground">{name}</p>
                <div className="flex flex-wrap gap-1">
                  {(rule.path_template ?? []).map((seg, i) => (
                    <span key={i} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                      {seg}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(board.department_rules).length === 0 && (
              <p className="text-xs text-muted-foreground italic">No rules</p>
            )}
          </div>
        ))}

        {Object.keys(boardsInfo).length === 0 && !loading && (
          <p className="text-xs text-muted-foreground italic">No hierarchies configured</p>
        )}

        {/* ── Auto-Created History ── */}
        <div className="border-t border-border/60 pt-4">
          <h2 className="font-medium text-sm">Auto-Created</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-3">Last 50 folders created automatically</p>

          {/* Fixed-height scrollable list */}
          <div className="h-64 overflow-y-auto space-y-2 pr-1">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No folders created yet</p>
            ) : (
              history.map((entry, i) => {
                const expanded = expandedHistoryIndex === i;
                return (
                  <div
                    key={i}
                    className="rounded-md border border-green-200 bg-green-50/50 px-2.5 py-2 space-y-0.5 cursor-pointer hover:bg-green-50"
                    onClick={() => setExpandedHistoryIndex(expanded ? null : i)}
                  >
                    {/* Success indicator + task name */}
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      <p className="text-xs font-medium truncate">{entry.taskName}</p>
                    </div>
                    {/* Board name */}
                    <p className="text-xs text-muted-foreground truncate pl-4">{entry.boardName}</p>
                    {/* Dropbox path — truncated by default, full when expanded */}
                    <p className={`text-xs font-mono text-muted-foreground pl-4 ${expanded ? "break-all whitespace-normal" : "truncate"}`}>
                      {entry.previewPath}
                    </p>
                    {/* Time created */}
                    <p className="text-xs text-green-600/70 pl-4">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

    </div>
  );
}
