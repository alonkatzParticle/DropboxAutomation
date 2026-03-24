/**
 * instrumentation.ts — Next.js server startup hook (local dev only)
 *
 * When running locally, this starts a background polling loop that checks
 * Monday.com for new tasks on a configurable interval.
 *
 * On Vercel, this is skipped — polling is handled by the Vercel Cron Job
 * at /api/cron/poll (configured in vercel.json), which runs every hour.
 *
 * Polling interval is controlled by POLL_INTERVAL_MINUTES env var (default 60).
 *
 * Depends on: lib/core.ts, lib/storage.ts
 */

export async function register() {
  // Only run in the Node.js server runtime, not the Edge runtime
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // On Vercel, polling is handled by the cron job at /api/cron/poll — skip here
  if (process.env.VERCEL) return;

  const { runPolling } = await import("./lib/core");
  const { loadConfig } = await import("./lib/storage");

  const intervalMinutes = parseInt(process.env.POLL_INTERVAL_MINUTES ?? "60", 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  async function runPoll() {
    console.log(`[Poller] Running scheduled poll...`);
    try {
      const config = await loadConfig();
      const output = await runPolling(config);
      console.log("[Poller]", output);
    } catch (e) {
      console.error("[Poller] Error:", e);
    }
  }

  // Run once immediately on server start, then on the configured schedule
  runPoll();
  setInterval(runPoll, intervalMs);

  console.log(`[Poller] Background polling started — runs every ${intervalMinutes} minute(s).`);
}
