/**
 * instrumentation.node.ts — Node.js-only startup logic for the poller.
 *
 * This file is ONLY imported from instrumentation.ts when NEXT_RUNTIME === "nodejs".
 * Keeping it separate prevents Turbopack's Edge bundler from tracing Node.js-only
 * modules (fs, path, process.cwd) into the Edge instrumentation bundle.
 *
 * Depends on: lib/core.ts, lib/storage.ts
 */

import { runPolling } from "./lib/core";
import { loadConfig } from "./lib/storage";

/**
 * Starts the background polling loop.
 * Runs once immediately, then repeats on the given interval.
 */
export function startPoller() {
  const intervalMinutes = parseInt(process.env.POLL_INTERVAL_MINUTES ?? "60", 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  async function runPoll() {
    console.log("[Poller] Running scheduled poll...");
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
