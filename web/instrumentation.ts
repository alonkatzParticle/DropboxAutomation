/**
 * instrumentation.ts — Next.js server startup hook
 *
 * This file runs once automatically when the Next.js server starts.
 * It kicks off the Python background poller on a configurable schedule
 * so polling works as long as the server is running — no cron job needed.
 *
 * Polling interval is controlled by the POLL_INTERVAL_MINUTES env var
 * (defaults to 60 minutes). Set to a lower value for testing.
 *
 * Depends on: main.py (Python entry point for polling)
 */

export async function register() {
  // Only run in the Node.js server runtime, not the Edge runtime
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { exec } = await import("child_process");
  const path = await import("path");

  // Project root is one level above the web/ folder
  const PROJECT_ROOT = path.default.resolve(process.cwd(), "..");

  // How often to poll — default 60 minutes, override with POLL_INTERVAL_MINUTES env var
  const intervalMinutes = parseInt(process.env.POLL_INTERVAL_MINUTES ?? "60", 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  function runPoll() {
    console.log(`[Poller] Running scheduled poll...`);
    exec(
      `cd "${PROJECT_ROOT}" && python3 main.py`,
      (err, stdout, stderr) => {
        if (stdout?.trim()) console.log("[Poller]", stdout.trim());
        if (stderr?.trim()) console.error("[Poller] Error:", stderr.trim());
      }
    );
  }

  // Run once immediately on server start, then on the configured schedule
  runPoll();
  setInterval(runPoll, intervalMs);

  console.log(
    `[Poller] Background polling started — runs every ${intervalMinutes} minute(s).`
  );
}
