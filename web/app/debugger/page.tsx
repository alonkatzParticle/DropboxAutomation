"use client";

/**
 * debugger/page.tsx — Debugger page showing activity logs and server output.
 *
 * Sections:
 *  1. Activity Log — structured log entries from lib/logger.ts (errors, warnings, info)
 *  2. Cron Log     — last-run output from /api/status
 *  3. Console Logs — pm2 server stdout/stderr from /api/debug-logs
 *
 * Depends on: /api/logs, /api/status, /api/debug-logs
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2 } from "lucide-react";
import type { LogEntry, LogLevel } from "@/lib/logger";

interface DebugLogs {
  stdout: string;
  stderr: string;
}

// Badge styles per log level
const LEVEL_STYLE: Record<LogLevel, string> = {
  info:  "bg-blue-100 text-blue-700",
  warn:  "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

export default function DebuggerPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");
  const [cronLog, setCronLog] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<DebugLogs | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Fetch all data sources in parallel
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [logsRes, statusRes, debugRes] = await Promise.all([
        fetch("/api/logs"),
        fetch("/api/status"),
        fetch("/api/debug-logs"),
      ]);
      if (logsRes.ok) {
        const data = await logsRes.json();
        // Show newest entries first
        setEntries((data.entries as LogEntry[]).reverse());
      }
      if (statusRes.ok) { const data = await statusRes.json(); setCronLog(data.log ?? ""); }
      if (debugRes.ok) { setConsoleLogs(await debugRes.json()); }
    } catch {
      // Silently continue — logs are informational, not critical
    }
    setRefreshing(false);
  }, []);

  // Clear the structured activity log
  const handleClear = async () => {
    setClearing(true);
    await fetch("/api/logs", { method: "DELETE" });
    setEntries([]);
    setClearing(false);
  };

  useEffect(() => { refresh(); }, [refresh]);

  // Filter entries by the selected level
  const visible = levelFilter === "all" ? entries : entries.filter((e) => e.level === levelFilter);

  // Count errors for badge
  const errorCount = entries.filter((e) => e.level === "error").length;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Debugger</h1>
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Activity Log — structured log entries */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Activity Log</h2>
              {/* Error count badge */}
              {errorCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                  {errorCount} error{errorCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Level filter buttons */}
              {(["all", "error", "warn", "info"] as const).map((l) => (
                <Button
                  key={l}
                  size="sm"
                  variant={levelFilter === l ? "default" : "outline"}
                  onClick={() => setLevelFilter(l)}
                  className="h-7 text-xs capitalize"
                >
                  {l}
                </Button>
              ))}
              {/* Clear button */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleClear}
                disabled={clearing || entries.length === 0}
                className="h-7 text-xs text-muted-foreground"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          <Card className="border border-border/60">
            <CardContent className="pt-4">
              {visible.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  {entries.length === 0 ? "No activity logged yet." : "No entries match this filter."}
                </p>
              ) : (
                <ScrollArea className="h-72 w-full rounded-md border border-border/60 bg-muted/40">
                  <div className="divide-y divide-border/40">
                    {visible.map((entry) => (
                      <div key={entry.id} className="flex gap-3 px-4 py-2 text-xs font-mono">
                        {/* Timestamp */}
                        <span className="text-muted-foreground shrink-0 w-44">
                          {new Date(entry.ts).toLocaleString()}
                        </span>
                        {/* Level badge */}
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${LEVEL_STYLE[entry.level]}`}>
                          {entry.level}
                        </span>
                        {/* Source + message */}
                        <span className="text-muted-foreground shrink-0">[{entry.source}]</span>
                        <span className="text-foreground break-all">{entry.message}</span>
                        {/* Context details on hover / inline */}
                        {entry.context && (
                          <span className="text-muted-foreground/70 break-all">
                            {Object.entries(entry.context)
                              .filter(([k]) => k !== "error")
                              .map(([k, v]) => `${k}=${v}`)
                              .join(" ")}
                            {Boolean(entry.context.error) && (
                              <span className="text-red-500 ml-1">— {String(entry.context.error)}</span>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Cron Log */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cron Log</h2>
          <Card className="border border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Last polling run output</CardDescription>
            </CardHeader>
            <CardContent>
              {cronLog ? (
                <ScrollArea className="h-56 w-full rounded-md border border-border/60 bg-muted/40">
                  <pre className="text-xs font-mono leading-relaxed p-4 whitespace-pre-wrap">{cronLog}</pre>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No cron log yet — automation will write here when it runs.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Console Logs */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Console Logs</h2>
          <Card className="border border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Last 100 lines of server output (stdout)</CardDescription>
            </CardHeader>
            <CardContent>
              {consoleLogs?.stdout ? (
                <ScrollArea className="h-56 w-full rounded-md border border-border/60 bg-muted/40">
                  <pre className="text-xs font-mono leading-relaxed p-4 whitespace-pre-wrap">{consoleLogs.stdout}</pre>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">No server output yet.</p>
              )}
            </CardContent>
          </Card>

          {consoleLogs?.stderr && (
            <Card className="border border-destructive/40">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs text-destructive">
                  Last 100 lines of server errors (stderr)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-40 w-full rounded-md border border-border/60 bg-muted/40">
                  <pre className="text-xs font-mono leading-relaxed p-4 whitespace-pre-wrap text-destructive">
                    {consoleLogs.stderr}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </section>

      </main>
    </div>
  );
}
