"use client";

/**
 * page.tsx — Home dashboard for the Dropbox Automation app.
 *
 * Sections:
 *  1. Actions — quick buttons to run a poll or full backfill, plus auto-create toggle
 *  2. Missing Links — task list with toggles and checkboxes (TaskList component)
 *  3. Output — shows created folders + raw log after any action runs
 *
 * Depends on: /api/run, /api/tasks (via TaskList), /api/auto
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, RefreshCw, Layers, FolderOpen, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import TaskList, { type Task } from "@/components/TaskList";
import LinkVerifier from "@/components/LinkVerifier";

/**
 * Parse Python output to extract { name, url } pairs for every successfully created folder.
 * The output contains lines like "→ Processing: {name}" followed by "  Link: {url}".
 */
function parseCreatedFolders(output: string): { name: string; url: string }[] {
  const results: { name: string; url: string }[] = [];
  let currentName = "";
  for (const line of output.split("\n")) {
    const nameMatch = line.match(/^→ Processing: (.+)$/);
    if (nameMatch) { currentName = nameMatch[1].trim(); continue; }
    const linkMatch = line.match(/^\s+Link: (https:\/\/\S+)$/);
    if (linkMatch && currentName) {
      results.push({ name: currentName, url: linkMatch[1] });
      currentName = "";
    }
  }
  return results;
}

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string>("");
  const [outputSuccess, setOutputSuccess] = useState<boolean | null>(null);
  // Tasks that were processed in the last TaskList run — used to look up Monday URLs
  const [processedTasks, setProcessedTasks] = useState<Task[]>([]);
  // Whether automatic polling (cron) is enabled
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);

  // Fetch the auto-enabled flag on mount
  useEffect(() => {
    fetch("/api/auto").then((r) => r.json()).then((d) => setAutoEnabled(d.enabled ?? true));
  }, []);

  // Toggle the auto-enabled flag and persist it via the API
  async function toggleAuto(enabled: boolean) {
    setAutoEnabled(enabled);
    await fetch("/api/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  // Run a poll or full backfill and display the output
  async function runMode(mode: "poll" | "all") {
    setIsRunning(true);
    setOutput("");
    setOutputSuccess(null);
    setProcessedTasks([]);
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    setOutput(data.output ?? "");
    setOutputSuccess(data.success);
    setIsRunning(false);
  }

  // Called by TaskList after it finishes processing selected tasks
  function handleTaskRunComplete(taskOutput: string, success: boolean, tasks: Task[]) {
    setOutput(taskOutput);
    setOutputSuccess(success);
    setProcessedTasks(tasks);
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Link Verifier — add Dropbox links for individual tasks */}
        <LinkVerifier />

        {/* Quick actions — poll, backfill, and auto-create toggle */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Actions</h2>
            {/* Toggle to enable/disable automatic folder creation via cron polling */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              Auto-create
              <Switch
                checked={autoEnabled ?? false}
                onCheckedChange={toggleAuto}
                disabled={autoEnabled === null}
                className="scale-75"
              />
              <span className={autoEnabled ? "text-green-600 font-medium" : "text-muted-foreground"}>
                {autoEnabled ? "On" : "Off"}
              </span>
            </label>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Poll card — only checks tasks created since last run */}
            <Card className="flex-1 border border-border/60">
              <CardContent className="pt-5 pb-5 space-y-3">
                <div>
                  <p className="text-sm font-medium">Check for New Tasks</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Polls all boards for tasks created since the last run.
                  </p>
                </div>
                <Button size="sm" onClick={() => runMode("poll")} disabled={isRunning}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isRunning ? "animate-spin" : ""}`} />
                  {isRunning ? "Checking…" : "Run Poll"}
                </Button>
              </CardContent>
            </Card>
            {/* Backfill card — scans every task on all boards */}
            <Card className="flex-1 border border-border/60">
              <CardContent className="pt-5 pb-5 space-y-3">
                <div>
                  <p className="text-sm font-medium">Add All Missing Links</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Scans every task on all boards and creates folders for any missing a link.
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => runMode("all")} disabled={isRunning}>
                  <Layers className={`h-3.5 w-3.5 mr-2 ${isRunning ? "animate-pulse" : ""}`} />
                  {isRunning ? "Running…" : "Run Backfill"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Task list with checkboxes and URL input */}
        <TaskList onRunComplete={handleTaskRunComplete} />

        {/* Output section — only shown after an action runs */}
        {output && (() => {
          const created = parseCreatedFolders(output);
          return (
            <section className="space-y-3">
              {/* Success or error banner */}
              <Alert variant={outputSuccess ? "default" : "destructive"} className="py-2 px-3">
                <div className="flex items-center gap-2">
                  {outputSuccess
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <XCircle className="h-4 w-4" />}
                  <AlertDescription className="text-xs font-medium">
                    {outputSuccess ? "Completed successfully" : "Finished with errors"}
                  </AlertDescription>
                </div>
              </Alert>

              {/* Created folders list — one row per task with Dropbox + Monday links */}
              {created.length > 0 && (
                <Card className="border border-border/60">
                  <CardContent className="p-0">
                    <div className="px-4 py-2.5 border-b border-border/60 bg-muted/40">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        Created Folders
                      </p>
                    </div>
                    {created.map(({ name, url }) => {
                      // Look up the Monday URL for this task by matching the task name
                      const mondayUrl = processedTasks.find((t) => t.name === name)?.mondayUrl;
                      return (
                        <div
                          key={url}
                          className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0"
                        >
                          <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium flex-1 truncate">{name}</span>
                          {/* Monday.com task link — only shown when we know the URL */}
                          {mondayUrl && (
                            <a
                              href={mondayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Monday.com"
                              className="shrink-0 text-blue-500 hover:text-blue-600"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {/* Dropbox folder link */}
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open Dropbox folder"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Raw Python log output */}
              <ScrollArea className="h-48 w-full rounded-md border border-border/60 bg-muted/40">
                <pre className="text-xs font-mono leading-relaxed p-4 whitespace-pre-wrap">{output}</pre>
              </ScrollArea>
            </section>
          );
        })()}

      </main>
    </div>
  );
}
