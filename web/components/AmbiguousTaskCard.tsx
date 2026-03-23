"use client";

/**
 * AmbiguousTaskCard.tsx — Card for a Monday.com task with no matching folder hierarchy.
 *
 * Displays the task's column values as context, then opens PathBuilder so the
 * user can choose a hierarchy template and build the folder path level by level,
 * pre-filled with the task's column values. Calls POST /api/auto-create on confirm.
 *
 * Depends on: PathBuilder.tsx, /api/auto-create
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FolderOpen, AlertTriangle, Loader2 } from "lucide-react";
import PathBuilder from "@/components/PathBuilder";

// Shape of one ambiguous task returned by GET /api/auto-create
export interface AmbiguousTask {
  id: string;
  boardId: string;
  boardName: string;
  taskName: string;
  mondayUrl: string;
  department: string;
  status?: string;
  isApproved?: boolean;
  isNew?: boolean;
  createdAt?: string;
  columnValues: {
    product?: string;
    platform?: string;
    category?: string;
    media_type?: string;
    date?: string;
  };
}

// Shape of one department rule from config.json (used by PathBuilder)
export interface DeptRule {
  dropbox_folder?: string;
  path_template?: string[];
}

interface Props {
  task: AmbiguousTask;
  dropboxRoot: string;
  deptRules: Record<string, DeptRule>;
  onCreated: () => void;  // Called after successful creation so parent can refresh
  highlighted?: boolean;  // True when this task was just detected via webhook
}

export default function AmbiguousTaskCard({ task, dropboxRoot, deptRules, onCreated, highlighted }: Props) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  /**
   * Called by PathBuilder when the user clicks "Create Folder".
   * PathBuilder provides the full path (including task_name), so we send it directly.
   *
   * fullPath — Complete Dropbox path (e.g. /Creative 2026/Social Media/Products/Face Cream/...)
   */
  async function handleConfirm(fullPath: string) {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/auto-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: task.boardId, itemId: task.id, customPath: fullPath }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated();
      } else {
        setError(data.error ?? "Unknown error occurred");
      }
    } catch {
      setError("Network error — could not reach the server");
    }
    setCreating(false);
  }

  return (
    <Card className={`border-amber-200 bg-amber-50/40 ${highlighted ? "ring-2 ring-green-400" : ""}`}>
      <CardContent className="p-4 space-y-3">

        {/* Task name + board name + Monday.com link */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{task.taskName}</p>
            {/* Green "New" badge shown when task was just detected via webhook */}
            {highlighted && (
              <Badge className="bg-green-100 text-green-700 border-green-300 text-xs" variant="outline">New</Badge>
            )}
            <p className="text-xs text-muted-foreground">{task.boardName}</p>
          </div>
          <a href={task.mondayUrl} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        </div>

        {/* Column value chips — shows context so the user knows what to expect */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {task.department || "No department"}
          </Badge>
          {task.columnValues.product && <Badge variant="secondary">{task.columnValues.product}</Badge>}
          {task.columnValues.platform && <Badge variant="secondary">{task.columnValues.platform}</Badge>}
          {task.columnValues.media_type && <Badge variant="secondary">{task.columnValues.media_type}</Badge>}
        </div>

        {/* Toggle: show PathBuilder or the button to open it */}
        {!showBuilder ? (
          <Button size="sm" variant="outline" onClick={() => setShowBuilder(true)} disabled={creating}>
            {creating
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</>
              : <><FolderOpen className="h-3.5 w-3.5 mr-1.5" />Choose folder location…</>
            }
          </Button>
        ) : (
          <PathBuilder
            task={task}
            deptRules={deptRules}
            dropboxRoot={dropboxRoot}
            onConfirm={handleConfirm}
            onCancel={() => setShowBuilder(false)}
          />
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

      </CardContent>
    </Card>
  );
}
