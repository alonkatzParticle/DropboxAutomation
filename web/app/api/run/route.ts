/**
 * app/api/run/route.ts — Trigger automation runs from the web UI
 *
 * POST /api/run
 * Body: { mode: "poll" | "all" | "manual" | "selected", url?, force?, items? }
 *
 * Runs the requested automation mode and returns the log output as JSON.
 * All logic lives in lib/core.ts — this route is just the HTTP entry point.
 *
 * Depends on: lib/core.ts, lib/storage.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { runPolling, runAll, runManual, runSelected } from "@/lib/core";
import { loadConfig } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { mode, url, force, items } = body as {
    mode?: string;
    url?: string;
    force?: boolean;
    items?: { boardId: string; itemId: string }[];
  };

  try {
    const config = await loadConfig();
    let output = "";

    if (mode === "manual") {
      if (!url) return NextResponse.json({ error: "url is required for manual mode" }, { status: 400 });
      // Extract boardId and itemId from the Monday.com URL
      const match = url.match(/\/boards\/(\d+)\/pulses\/(\d+)/);
      if (!match) return NextResponse.json({ error: "Invalid Monday.com URL format" }, { status: 400 });
      output = await runManual(match[1], match[2], config, force ?? false);
    } else if (mode === "all") {
      output = await runAll(config);
    } else if (mode === "selected") {
      if (!items?.length) return NextResponse.json({ error: "items required for selected mode" }, { status: 400 });
      output = await runSelected(items, config, force ?? false);
    } else {
      // Default: poll mode
      output = await runPolling(config);
    }

    return NextResponse.json({ output, success: true });
  } catch (e) {
    return NextResponse.json({ output: String(e), success: false }, { status: 500 });
  }
}
