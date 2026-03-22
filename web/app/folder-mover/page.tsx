"use client";

/**
 * folder-mover/page.tsx — Move or create a Dropbox folder for a Monday.com task.
 *
 * Workflow:
 *  1. User pastes a Monday.com task URL
 *  2. If task has NO folder: shows proposed path + Create button (same as home page)
 *  3. If task HAS a folder: shows current location, proposed new location,
 *     and a cascading dropdown to pick a custom destination manually
 *
 * Depends on: /api/folder-mover (GET + POST), /api/run (for new folder creation),
 *             FolderMoverCascade component
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, FolderOpen, ExternalLink, ArrowRight } from "lucide-react";
import FolderMoverCascade from "@/components/FolderMoverCascade";

// Parse a Monday.com task URL into boardId + itemId
function parseUrl(url: string): { boardId: string; itemId: string } | null {
  const match = url.match(/\/boards\/(\d+)\/pulses\/(\d+)/);
  return match ? { boardId: match[1], itemId: match[2] } : null;
}

interface TaskInfo {
  success: boolean; error?: string;
  taskName?: string; boardId?: string; itemId?: string;
  hasFolder?: boolean; proposedPath?: string; dropboxRoot?: string;
  currentLink?: string; currentPath?: string; currentFolderName?: string;
}

export default function FolderMoverPage() {
  const [urlInput, setUrlInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [taskInfo, setTaskInfo] = useState<TaskInfo | null>(null);
  const [showCascade, setShowCascade] = useState(false);
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; link?: string; error?: string } | null>(null);

  async function lookupTask() {
    const parsed = parseUrl(urlInput.trim());
    if (!parsed) { setTaskInfo({ success: false, error: "Paste a valid Monday.com task URL (must contain /boards/.../pulses/...)" }); return; }
    setLookingUp(true); setTaskInfo(null); setResult(null); setShowCascade(false);
    const res = await fetch(`/api/folder-mover?boardId=${parsed.boardId}&itemId=${parsed.itemId}`);
    setTaskInfo(await res.json());
    setLookingUp(false);
  }

  // Create a brand-new folder (task has no folder yet)
  async function handleCreate() {
    if (!taskInfo?.boardId || !taskInfo?.itemId) return;
    setActing(true);
    const res = await fetch("/api/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "selected", items: [{ boardId: taskInfo.boardId, itemId: taskInfo.itemId }] }),
    });
    const data = await res.json();
    const linkMatch = (data.output ?? "").match(/Link:\s*(https:\/\/[^\s]+)/);
    setResult({ success: data.success, link: linkMatch?.[1] });
    setActing(false);
  }

  // Move the folder — either to the proposed path or a custom path from the cascade
  async function handleMove(newPath: string) {
    if (!taskInfo?.boardId || !taskInfo?.itemId || !taskInfo?.currentFolderName) return;
    setActing(true); setShowCascade(false);
    // The cascade gives the parent; append the folder's own name to get the full destination
    const destination = newPath.endsWith(taskInfo.currentFolderName)
      ? newPath : newPath + "/" + taskInfo.currentFolderName;
    const res = await fetch("/api/folder-mover", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId: taskInfo.boardId, itemId: taskInfo.itemId, newPath: destination }),
    });
    const data = await res.json();
    setResult({ success: data.success, link: data.newLink, error: data.error });
    setActing(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-semibold">Folder Mover</h1>

        {/* URL input */}
        <Card className="border border-border/60">
          <CardContent className="pt-5 pb-5 space-y-3">
            <p className="text-sm text-muted-foreground">Paste a Monday.com task URL to check its Dropbox folder.</p>
            <div className="flex gap-2">
              <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupTask()}
                placeholder="https://particle-for-men.monday.com/boards/…/pulses/…"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <Button size="sm" onClick={lookupTask} disabled={lookingUp || !urlInput.trim()}>
                {lookingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Look Up"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Error from lookup */}
        {taskInfo && !taskInfo.success && (
          <Alert variant="destructive" className="py-2 px-3">
            <XCircle className="h-4 w-4" /><AlertDescription className="text-xs ml-2">{taskInfo.error}</AlertDescription>
          </Alert>
        )}

        {/* Task found — no folder yet */}
        {taskInfo?.success && !taskInfo.hasFolder && !result && (
          <Card className="border border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Task found — no Dropbox folder yet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">{taskInfo.taskName}</p>
              <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs font-mono text-muted-foreground break-words">{taskInfo.proposedPath}</div>
              <Button size="sm" onClick={handleCreate} disabled={acting}>
                {acting ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Creating…</> : "Create Folder"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Task found — has existing folder */}
        {taskInfo?.success && taskInfo.hasFolder && !result && (
          <Card className="border border-border/60">
            <CardHeader className="pb-2"><CardDescription className="text-xs">Task found — folder exists</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-medium">{taskInfo.taskName}</p>

              {/* Current folder */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Current Location</p>
                <div className="flex items-center gap-2 rounded-md bg-muted/40 border border-border/60 px-3 py-2">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-mono text-muted-foreground flex-1 break-words">{taskInfo.currentPath ?? "Path unavailable"}</span>
                  {taskInfo.currentLink && <a href={taskInfo.currentLink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-500 hover:text-blue-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </div>
              </div>

              {/* Proposed new location */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Proposed New Location</p>
                <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
                  <ArrowRight className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <span className="text-xs font-mono text-blue-700 flex-1 break-words">{taskInfo.proposedPath}</span>
                </div>
                <Button size="sm" onClick={() => handleMove(taskInfo.proposedPath!)} disabled={acting}>
                  {acting ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Moving…</> : "Move to Proposed Location"}
                </Button>
              </div>

              {/* Manual cascade */}
              <div className="space-y-2 border-t border-border/60 pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Choose Location Manually</p>
                {!showCascade
                  ? <Button size="sm" variant="outline" onClick={() => setShowCascade(true)}>Browse Folders…</Button>
                  : <FolderMoverCascade dropboxRoot={taskInfo.dropboxRoot!} currentFolderName={taskInfo.currentFolderName!}
                      onConfirm={(parentPath) => handleMove(parentPath)} onCancel={() => setShowCascade(false)} />}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result after action */}
        {result && (
          <Alert variant={result.success ? "default" : "destructive"} className="py-2 px-3">
            <div className="flex items-center gap-2">
              {result.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4" />}
              <AlertDescription className="text-xs font-medium flex-1">
                {result.success ? (taskInfo?.hasFolder ? "Folder moved successfully" : "Folder created successfully") : result.error}
              </AlertDescription>
              {result.link && <a href={result.link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-500 hover:text-blue-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
          </Alert>
        )}
      </main>
    </div>
  );
}
