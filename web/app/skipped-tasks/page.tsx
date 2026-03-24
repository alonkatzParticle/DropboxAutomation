"use client";

/**
 * skipped-tasks/page.tsx — Skipped Tasks page
 *
 * Shows all tasks that are excluded from the Auto-Creator because they either:
 *   - Match a skip rule defined in config.json for their board
 *   - Were manually marked as "Skip" by the user
 *
 * For each task, shows which rule caused the skip (or "Manually skipped").
 * Users can un-skip any task to return it to the Auto-Creator.
 *
 * Depends on: /api/classified-tasks (GET), /api/skipped-tasks (POST)
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ExternalLink, RotateCcw, Ban } from "lucide-react";

interface SkippedTask {
  id: string;
  boardId: string;
  boardName: string;
  taskName: string;
  mondayUrl: string;
  department: string;
  status: string;
  createdAt: string;
  skipReason: string; // e.g. "Rule: Upload B-Roll" or "Manually skipped"
}

export default function SkippedTasksPage() {
  const [tasks, setTasks] = useState<SkippedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unskipping, setUnskipping] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/classified-tasks");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks(data.skipped ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function unskip(task: SkippedTask) {
    setUnskipping((prev) => new Set(prev).add(task.id));
    try {
      await fetch("/api/skipped-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unskip", itemId: task.id }),
      });
      // Reload to reflect changes — rule-based skips may still apply
      await load();
    } finally {
      setUnskipping((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
    }
  }

  // Group tasks by board name for a cleaner visual layout
  const byBoard = tasks.reduce<Record<string, SkippedTask[]>>((acc, t) => {
    (acc[t.boardName] ??= []).push(t);
    return acc;
  }, {});

  const isManual = (reason: string) => reason === "Manually skipped";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Ban className="h-5 w-5 text-muted-foreground" />
            Skipped Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tasks excluded from the Auto-Creator by rules or manual skips.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading skipped tasks…
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No skipped tasks. Tasks that match skip rules or are manually skipped will appear here.
        </div>
      )}

      {/* Tasks grouped by board */}
      {!loading && Object.entries(byBoard).map(([boardName, boardTasks]) => (
        <section key={boardName} className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide px-1">
            {boardName} — {boardTasks.length} task{boardTasks.length !== 1 ? "s" : ""}
          </h2>

          <div className="rounded-lg border divide-y">
            {boardTasks.map((task) => (
              <div key={task.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{task.taskName}</span>
                    {/* Badge showing why this task was skipped */}
                    <Badge
                      variant="secondary"
                      className={`text-xs shrink-0 ${isManual(task.skipReason) ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}
                    >
                      {task.skipReason}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {task.department && <span>Dept: {task.department}</span>}
                    {task.status && <span>Status: {task.status}</span>}
                    {task.createdAt && (
                      <span>Created: {new Date(task.createdAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a href={task.mondayUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  {/* Only show Un-skip for manually skipped tasks (rule-based tasks
                      will re-appear as skipped unless the rule is removed) */}
                  {isManual(task.skipReason) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => unskip(task)}
                      disabled={unskipping.has(task.id)}
                    >
                      {unskipping.has(task.id)
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RotateCcw className="h-3 w-3 mr-1" />}
                      Un-skip
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground pt-2">
        To remove a rule-based skip, go to <a href="/skip-rules" className="underline">Skip Rules</a> and delete the matching rule.
        To un-skip a manually skipped task, click the Un-skip button above.
      </p>
    </div>
  );
}
