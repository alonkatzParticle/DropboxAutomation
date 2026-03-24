/**
 * app/api/cron/poll/route.ts — Vercel Cron Job endpoint for background polling
 *
 * Vercel calls this route on a schedule (configured in vercel.json).
 * It runs the same polling logic as the manual "Poll" button in the UI,
 * checking all boards for new tasks and auto-creating Dropbox folders.
 *
 * The route is protected by the CRON_SECRET environment variable so only
 * Vercel (not the public) can trigger it.
 *
 * Depends on: lib/core.ts, lib/storage.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { runPolling } from "@/lib/core";
import { loadConfig } from "@/lib/storage";

export async function GET(req: NextRequest) {
  // Verify the request comes from Vercel's cron system
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Only enforce secret check if CRON_SECRET is configured
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await loadConfig();
    const output = await runPolling(config);
    console.log("[Cron Poll]", output);
    return NextResponse.json({ ok: true, output });
  } catch (e) {
    console.error("[Cron Poll] Error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
