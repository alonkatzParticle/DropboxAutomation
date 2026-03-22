"use client";

/**
 * auto-create/page.tsx — Auto-Creator page
 *
 * Fetches all Monday.com tasks missing a Dropbox folder and splits them into:
 *   - Needs Attention: department not recognized → user picks path manually
 *   - Ready to Create: department matched → one-click or "Create All" creation
 *
 * A toggle bar at the top enables live detection: when ON, the page polls
 * Monday.com every 30 seconds and highlights any tasks that arrived via webhook.
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
import { Loader2, RefreshCw, AlertTriangle, Zap, Clock, CheckCircle2, ChevronDown, ChevronRight, Flag, ExternalLink } from "lucide-react";
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
  // Per-board department rules: boardId → { name, department_rules }
  const [boardsInfo, setBoardsInfo] = useState<Record<string, BoardInfo>>({});
  const [dropboxRoot, setDropboxRoot] = useState("/Creative 2026");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Auto-detect toggle state (synced with /api/auto → state.json)
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);

  // IDs of tasks that arrived via webhook — highlighted with a "New" badge
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // "Last checked X seconds ago" counter — resets to 0 after each load
  const [secsSinceCheck, setSecsSinceCheck] = useState(0);
  const secsSinceCheckRef = useRef(0);

  // Banner shown when new ambiguous tasks are detected
  const [newCount, setNewCount] = useState(0);

  // Count of folders auto-created in the background (shown briefly in the toggle bar)
  const [autoCreatedCount, setAutoCreatedCount] = useState(0);

  // History of the last 50 auto-created folders
  const [history, setHistory] = useState<{ taskName: string; boardName: string; previewPath: string; createdAt: string }[]>([]);

  // Index of the history entry whose full path is currently expanded
  const [expandedHistoryIndex, setExpandedHistoryIndex] = useState<number | null>(null);

  // Maps taskId → last known status, used to detect when a task becomes "Approved"
  const taskStatusesRef = useRef<Map<string, string> | null>(null);

  // Collapsed state for each section (default all open)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  /** Toggle a section open/closed by name */
  function toggleSection(name: string) {
    setCollapsedSections(prev => ({ ...prev, [name]: !prev[name] }));
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

      // Seed the status map so subsequent silent polls detect status changes to "Approved"
      const statusMap = new Map<string, string>();
      [...allReady, ...allAmbiguous].forEach(t => statusMap.set(t.id, t.status ?? ""));
      taskStatusesRef.current = statusMap;
    } catch {
      setError("Failed to load tasks. Check that the server is running.");
    }

    secsSinceCheckRef.current = 0;
    setSecsSinceCheck(0);
    setLoading(false);
  }, []);

  /**
   * Silent background poll — no loading spinner, no page disruption.
   * Detects tasks whose status just changed to "Approved" and auto-creates
   * their Dropbox folders. Also surfaces newly created ambiguous tasks.
   * Called automatically every 30 seconds when auto-detect is ON.
   */
  const silentPoll = useCallback(async () => {
    try {
      const res = await fetch("/api/auto-create");
      const tasks = await res.json();

      const allReady: ReadyTask[] = tasks.ready ?? [];
      const allAmbiguous: AmbiguousTask[] = tasks.ambiguous ?? [];

      // Detect tasks that just became "Approved" (status change since last poll)
      const newlyApprovedReady = allReady.filter(t => {
        const prevStatus = taskStatusesRef.current?.get(t.id);
        return t.isApproved && prevStatus !== undefined && prevStatus !== "approved";
      });
      // Also detect brand-new tasks (not seen before) that are already Approved
      const brandNewApproved = allReady.filter(t =>
        t.isApproved && !taskStatusesRef.current?.has(t.id)
      );
      const toAutoCreate = [...newlyApprovedReady, ...brandNewApproved];

      // Find brand-new ambiguous tasks to surface
      const newAmbiguous = allAmbiguous.filter(t => !taskStatusesRef.current?.has(t.id));

      // Update status map with latest statuses
      [...allReady, ...allAmbiguous].forEach(t =>
        taskStatusesRef.current?.set(t.id, t.status ?? "")
      );

      if (toAutoCreate.length > 0 || newAmbiguous.length > 0) {
        const newReady = toAutoCreate;

        // Auto-create Dropbox folders for newly-approved ready tasks in the background
        if (newReady.length > 0) {
          fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "selected",
              items: newReady.map(t => ({ boardId: t.boardId, itemId: t.id })),
            }),
          })
            .then(() => {
              // Save to history
              const now = new Date().toISOString();
              const historyEntries = newReady.map(t => ({
                taskName: t.taskName,
                boardName: t.boardName,
                previewPath: t.previewPath,
                createdAt: now,
              }));
              fetch("/api/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(historyEntries),
              })
                .then(r => r.json())
                .then(d => setHistory(d.entries ?? []))
                .catch(() => {});

              // Show "X folders created" notice for 10 seconds, then quietly remove from list
              setAutoCreatedCount(c => c + newReady.length);
              setTimeout(() => {
                setAutoCreatedCount(0);
                setReady(prev => prev.filter(t => !newReady.some(n => n.id === t.id)));
              }, 10_000);
            })
            .catch(() => {});
        }

        // Surface new ambiguous tasks at the top of the list with a highlight
        if (newAmbiguous.length > 0) {
          setAmbiguous(prev => [...newAmbiguous, ...prev]);
          setHighlightedIds(prev => new Set([...prev, ...newAmbiguous.map(t => t.id)]));
          setNewCount(c => c + newAmbiguous.length);

          setTimeout(() => {
            setHighlightedIds(prev => {
              const next = new Set(prev);
              newAmbiguous.forEach(t => next.delete(t.id));
              return next;
            });
            setNewCount(0);
          }, 60_000);
        }
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

          {/* Folders auto-created notice */}
          {autoCreatedCount > 0 && (
            <Badge className="bg-green-100 text-green-700 border-green-300 gap-1" variant="outline">
              ✓ {autoCreatedCount} folder{autoCreatedCount > 1 ? "s" : ""} created automatically
            </Badge>
          )}

          {/* New ambiguous tasks detected */}
          {newCount > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-300 gap-1" variant="outline">
              ⚠ {newCount} new task{newCount > 1 ? "s" : ""} need attention
            </Badge>
          )}

          {/* Helper text when auto is OFF */}
          {!autoEnabled && (
            <span className="text-xs text-muted-foreground">
              Turn on to automatically detect new Monday.com tasks via webhook.
            </span>
          )}
        </div>

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Auto-Creator</h1>
            <p className="text-sm text-muted-foreground">Monday.com tasks missing a Dropbox folder</p>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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
            {/* Recently Created — tasks created in the last 5 minutes */}
            {(() => {
              const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
              const recentAmbiguous = ambiguous.filter(t => t.createdAt && new Date(t.createdAt) >= fiveMinAgo);
              const recentReady = ready.filter(t => t.createdAt && new Date(t.createdAt) >= fiveMinAgo);
              const total = recentAmbiguous.length + recentReady.length;
              if (total === 0) return null;
              return (
                <section className="space-y-3 border border-green-200 rounded-lg p-4 bg-green-50/40">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-green-600" />
                    <h2 className="font-medium text-sm">Recently Created</h2>
                    <Badge variant="outline" className="text-green-600 border-green-300">{total}</Badge>
                    <span className="text-xs text-muted-foreground">in the last 5 minutes</span>
                  </div>
                  <div className="space-y-2">
                    {recentAmbiguous.map(task => (
                      <AmbiguousTaskCard
                        key={task.id}
                        task={task}
                        dropboxRoot={dropboxRoot}
                        deptRules={boardsInfo[task.boardId]?.department_rules ?? {}}
                        onCreated={load}
                        highlighted
                      />
                    ))}
                    {recentReady.map(task => (
                      <div key={task.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-4 py-3 border border-green-100">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{task.taskName}</p>
                            <Badge className="bg-green-100 text-green-700 border-green-300 text-xs" variant="outline">New</Badge>
                            <a href={task.mondayUrl} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                              <RefreshCw className="h-3 w-3" />
                            </a>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">{task.previewPath}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Needs Attention — tasks with unrecognized departments */}
            {ambiguous.length > 0 && (
              <section className="space-y-3">
                <button
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => toggleSection("attention")}
                >
                  {collapsedSections["attention"] ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h2 className="font-medium text-sm">Needs Attention</h2>
                  <Badge variant="outline" className="text-amber-600 border-amber-300">{ambiguous.length}</Badge>
                </button>
                {!collapsedSections["attention"] && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      No Dropbox folder yet, and no matching hierarchy rule — choose a folder location for each task below.
                    </p>
                    <div className="space-y-3">
                      {ambiguous.map(task => (
                        <AmbiguousTaskCard
                          key={task.id}
                          task={task}
                          dropboxRoot={dropboxRoot}
                          deptRules={boardsInfo[task.boardId]?.department_rules ?? {}}
                          onCreated={load}
                          highlighted={highlightedIds.has(task.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Ready to Create */}
            <ReadyTasksList
              tasks={ready}
              onCreated={load}
              highlightedIds={highlightedIds}
              collapsed={collapsedSections["ready"] ?? false}
              onToggleCollapse={() => toggleSection("ready")}
            />

            {/* Already Has a Folder — Approved tasks that already had a Dropbox link (no new folder created) */}
            {approvedWithFolder.length > 0 && (
              <section className="space-y-3">
                <button
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => toggleSection("linked")}
                >
                  {collapsedSections["linked"] ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <Flag className="h-4 w-4 text-blue-500" />
                  <h2 className="font-medium text-sm">Already Has a Folder</h2>
                  <Badge variant="outline" className="text-blue-600 border-blue-300">{approvedWithFolder.length}</Badge>
                </button>
                {!collapsedSections["linked"] && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      These tasks are Approved but already had a Dropbox folder — no new folder was created.
                    </p>
                    <div className="space-y-2">
                      {approvedWithFolder.map(task => (
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

        {/* One block per board showing that board's dept rules */}
        {Object.entries(boardsInfo).map(([boardId, board]) => (
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
