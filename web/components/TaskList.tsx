"use client";

/**
 * TaskList.tsx — Displays all Monday.com tasks that are missing a Dropbox link.
 *
 * Features:
 * - Toggle switches to show/hide Video tasks and Image/Design tasks
 * - Select individual tasks with checkboxes, or select all at once
 * - "Process Selected" button runs the Dropbox folder creation for chosen tasks
 *
 * Depends on: /api/tasks (GET), /api/run (POST with mode "selected")
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, Layers, Film, Image, ExternalLink } from "lucide-react";

// Shape of one task returned by /api/tasks
export interface Task {
  id: string;
  boardId: string;
  boardName: string;
  mediaType: "Video" | "Image";
  name: string;
  mondayUrl: string;
  previewPath?: string; // Dropbox folder path preview — shown as a hover tooltip
}

interface TaskListProps {
  // Called when processing completes — passes output, success flag, and the tasks that were processed
  onRunComplete: (output: string, success: boolean, processedTasks: Task[]) => void;
}

export default function TaskList({ onRunComplete }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showVideo, setShowVideo] = useState(true);
  const [showImage, setShowImage] = useState(true);

  // Fetch the task list from the API
  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setSelectedIds(new Set()); // clear selection on refresh
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load tasks on mount
  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Tasks visible after applying the toggle filters
  const visibleTasks = tasks.filter((t) =>
    (t.mediaType === "Video" && showVideo) || (t.mediaType === "Image" && showImage)
  );

  // Whether all visible tasks are currently selected
  const allVisibleSelected =
    visibleTasks.length > 0 && visibleTasks.every((t) => selectedIds.has(t.id));

  // Toggle a single task's checkbox
  function toggleTask(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Select all or deselect all visible tasks
  function toggleAll() {
    if (allVisibleSelected) {
      // Deselect all visible
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleTasks.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleTasks.forEach((t) => next.add(t.id));
        return next;
      });
    }
  }

  // Process only the selected tasks
  async function processSelected() {
    const toProcess = tasks.filter((t) => selectedIds.has(t.id));
    if (!toProcess.length) return;
    setIsProcessing(true);
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "selected",
        items: toProcess.map((t) => ({ boardId: t.boardId, itemId: t.id })),
      }),
    });
    const data = await res.json();
    onRunComplete(data.output ?? "", data.success, toProcess);
    setIsProcessing(false);
    fetchTasks(); // refresh list after processing
  }

  const selectedCount = [...selectedIds].filter((id) =>
    visibleTasks.some((t) => t.id === id)
  ).length;

  return (
    <section className="space-y-3">
      {/* Section header with toggles */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Missing Links
        </h2>
        <div className="flex items-center gap-4">
          {/* Video toggle */}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Film className="h-3.5 w-3.5" />
            Video
            <Switch checked={showVideo} onCheckedChange={setShowVideo} className="scale-75" />
          </label>
          {/* Image/Design toggle */}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Image className="h-3.5 w-3.5" />
            Image
            <Switch checked={showImage} onCheckedChange={setShowImage} className="scale-75" />
          </label>
          {/* Refresh button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchTasks}
            disabled={isLoading}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Refresh task list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Card className="border border-border/60">
        <CardContent className="p-0">
          {/* Scrollable table with sticky header — fixed height so it doesn't push the page */}
          <div className="overflow-auto max-h-80 rounded-t-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                <tr className="border-b border-border/60">
                  <th className="w-10 px-4 py-3">
                    {/* Select-all checkbox */}
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleAll}
                      disabled={visibleTasks.length === 0}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-2 py-3 text-left font-medium text-muted-foreground">Task</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Board</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  // Skeleton rows while loading
                  [0, 1, 2].map((i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                      <td className="px-2 py-3"><Skeleton className="h-4 w-64" /></td>
                      <td className="px-4 py-3 text-right"><Skeleton className="h-5 w-24 ml-auto" /></td>
                    </tr>
                  ))
                ) : visibleTasks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {tasks.length === 0
                        ? "All tasks have Dropbox links — nothing to do."
                        : "No tasks match the current filters."}
                    </td>
                  </tr>
                ) : (
                  visibleTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-border/40 last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => toggleTask(task.id)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(task.id)}
                          onCheckedChange={() => toggleTask(task.id)}
                          aria-label={`Select ${task.name}`}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          {/* Task name with hover tooltip showing the Dropbox folder path */}
                          {task.previewPath ? (
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="font-medium truncate cursor-default">{task.name}</span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-sm text-xs font-mono">
                                  {/* Show the path as breadcrumb levels */}
                                  {task.previewPath.split("/").filter(Boolean).map((segment, i, arr) => (
                                    <span key={i}>
                                      {segment}
                                      {i < arr.length - 1 && <span className="text-muted-foreground mx-1">›</span>}
                                    </span>
                                  ))}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="font-medium truncate">{task.name}</span>
                          )}
                          {/* Link to the Monday.com task */}
                          <a
                            href={task.mondayUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 text-blue-500 hover:text-blue-600"
                            title="Open in Monday.com"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant={task.mediaType === "Video" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {task.boardName}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer: count + create button */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/20">
            <span className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `${visibleTasks.length} task${visibleTasks.length !== 1 ? "s" : ""} shown`}
            </span>
            <Button
              size="sm"
              disabled={selectedCount === 0 || isProcessing}
              onClick={processSelected}
            >
              {isProcessing ? (
                <><Layers className="h-3.5 w-3.5 mr-2 animate-pulse" />Creating…</>
              ) : (
                <><Layers className="h-3.5 w-3.5 mr-2" />
                  {selectedCount > 0
                    ? `Create Dropbox Folder${selectedCount > 1 ? "s" : ""} (${selectedCount})`
                    : "Create Dropbox Folders"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
