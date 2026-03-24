"use client";

/**
 * ReadyTasksList.tsx — Section showing tasks that can be auto-created.
 *
 * Renders a list of Monday.com tasks whose department matches a known
 * hierarchy rule. Each task shows its preview path and a Create button.
 * A "Create All" button creates all at once.
 *
 * Depends on: /api/run
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle2, ExternalLink, ChevronDown, ChevronRight, Ban } from "lucide-react";

// Shape of one ready task returned by GET /api/auto-create
export interface ReadyTask {
  id: string;
  boardId: string;
  boardName: string;
  taskName: string;
  mondayUrl: string;
  previewPath: string;
  status?: string;
  isApproved?: boolean;
  isNew?: boolean;
  createdAt?: string;
}

interface Props {
  tasks: ReadyTask[];
  onCreated: () => void;  // Called after creation(s) to trigger parent refresh
  highlightedIds?: Set<string>;  // IDs of tasks just detected via webhook — shown with "New" badge
  collapsed?: boolean;  // Whether the task list is hidden
  onToggleCollapse?: () => void;  // Called when the section header is clicked
  onSkipped?: () => void;  // Called after a task is manually skipped
}

export default function ReadyTasksList({ tasks, onCreated, highlightedIds, collapsed, onToggleCollapse, onSkipped }: Props) {
  const [running, setRunning] = useState(false);
  const [skipping, setSkipping] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  /**
   * POST to /api/run in "selected" mode with the given items.
   * Returns true on success.
   */
  async function runItems(items: { boardId: string; itemId: string }[]) {
    setRunning(true);
    setMsg("");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "selected", items }),
      });
      const data = await res.json();
      setMsg(data.success ? "Done!" : (data.error ?? "Some items may have failed."));
      onCreated();
    } catch {
      setMsg("Network error.");
    }
    setRunning(false);
  }

  // Manually skip a single task — sends it to Skipped Tasks page
  async function skipTask(task: ReadyTask) {
    setSkipping((prev) => new Set(prev).add(task.id));
    try {
      await fetch("/api/skipped-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", itemId: task.id, reason: "Manually skipped" }),
      });
      onSkipped?.();
    } finally {
      setSkipping((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
    }
  }

  return (
    <section className="space-y-3">
      {/* Section header with count badge + Create All button */}
      <div className="flex items-center justify-between">
        <button className="flex items-center gap-2 text-left" onClick={onToggleCollapse}>
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <h2 className="font-medium text-sm">Ready to Create</h2>
          <Badge variant="outline" className="text-green-600 border-green-300">{tasks.length}</Badge>
        </button>
        {!collapsed && tasks.length > 0 && (
          <Button size="sm" onClick={() => runItems(tasks.map(t => ({ boardId: t.boardId, itemId: t.id })))} disabled={running}>
            {running
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Running…</>
              : <><Play className="h-3.5 w-3.5 mr-1.5" />Create All</>
            }
          </Button>
        )}
      </div>

      {/* Status message after run */}
      {!collapsed && msg && <p className="text-xs text-muted-foreground">{msg}</p>}

      {/* Empty state and task list — hidden when collapsed */}
      {!collapsed && tasks.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">No tasks ready — all caught up!</p>
      )}
      {!collapsed && tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className={`flex items-center justify-between gap-3 bg-muted/30 rounded-lg px-4 py-3 ${highlightedIds?.has(task.id) ? "ring-2 ring-green-400" : ""}`}>
              <div className="min-w-0 flex-1">
                {/* Task name + Monday.com link + optional "New" badge */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium truncate">{task.taskName}</p>
                  {highlightedIds?.has(task.id) && (
                    <Badge className="bg-green-100 text-green-700 border-green-300 text-xs" variant="outline">New</Badge>
                  )}
                  <a href={task.mondayUrl} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {/* Proposed Dropbox path */}
                <p className="text-xs text-muted-foreground font-mono break-words leading-relaxed">{task.previewPath}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Skip button — moves task to Skipped Tasks page */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground h-8 px-2"
                  disabled={skipping.has(task.id)}
                  onClick={() => skipTask(task)}
                  title="Skip this task (no Dropbox folder needed)"
                >
                  {skipping.has(task.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                </Button>
                {/* Create button for just this task */}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={running}
                  onClick={() => runItems([{ boardId: task.boardId, itemId: task.id }])}
                >
                  Create
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
