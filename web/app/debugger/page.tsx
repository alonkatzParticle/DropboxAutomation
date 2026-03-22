"use client";

/**
 * debugger/page.tsx — Debugger page showing server and cron logs.
 *
 * Sections:
 *  1. Cron Log — last 100 lines of cron.log (from automatic polling runs)
 *  2. Console Logs — last 100 lines of pm2 server stdout and stderr
 *
 * Depends on: /api/status (cron log), /api/debug-logs (server console output)
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

// Shape of the logs returned by /api/debug-logs (pm2 server output)
interface DebugLogs {
  stdout: string;  // Server stdout (requests, startup messages)
  stderr: string;  // Server stderr (errors only)
}

export default function DebuggerPage() {
  const [cronLog, setCronLog] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<DebugLogs | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch both cron log and server console logs in parallel
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [statusRes, debugRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/debug-logs"),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setCronLog(data.log ?? "");
      }
      if (debugRes.ok) {
        setConsoleLogs(await debugRes.json());
      }
    } catch {
      // Silently continue — logs are informational, not critical
    }
    setRefreshing(false);
  }, []);

  // Load logs on first render
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Page header with refresh button */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Debugger</h1>
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Cron Log — output from the Python polling script run on a schedule */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cron Log</h2>
          <Card className="border border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Last 100 lines of cron.log</CardDescription>
            </CardHeader>
            <CardContent>
              {cronLog ? (
                <ScrollArea className="h-56 w-full rounded-md border border-border/60 bg-muted/40">
                  <pre className="text-xs font-mono leading-relaxed p-4 whitespace-pre-wrap">{cronLog}</pre>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No cron log yet — cron will write here when it runs.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Console Logs — pm2 server stdout (Next.js requests, API calls, startup) */}
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

          {/* Only show the error log card when there are actual errors */}
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
