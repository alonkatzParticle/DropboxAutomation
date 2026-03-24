/**
 * instrumentation.ts — Next.js server startup hook (local dev only)
 *
 * When running locally, this starts a background polling loop that checks
 * Monday.com for new tasks on a configurable interval.
 *
 * On Vercel, this is skipped — polling is handled by the Vercel Cron Job
 * at /api/cron/poll (configured in vercel.json), which runs every hour.
 *
 * All Node.js-specific logic lives in instrumentation.node.ts so that
 * Turbopack's Edge bundler never traces fs/path/process.cwd into the
 * Edge instrumentation bundle.
 *
 * Depends on: instrumentation.node.ts (Node.js runtime only)
 */

export async function register() {
  // Only run in the Node.js server runtime, not the Edge runtime.
  // The dynamic import below is only traced by the Node.js bundler.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // On Vercel, polling is handled by the cron job at /api/cron/poll — skip here
  if (process.env.VERCEL) return;

  const { startPoller } = await import("./instrumentation.node");
  startPoller();
}
