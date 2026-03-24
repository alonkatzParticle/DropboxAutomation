/**
 * app/api/logs/route.ts — Activity log API
 *
 * GET    /api/logs             — return all log entries (oldest first)
 * GET    /api/logs?level=error — return only entries at the given level
 * DELETE /api/logs             — clear all log entries
 *
 * Depends on: lib/logger.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { getLogs, clearLogs } from "@/lib/logger";
import type { LogLevel } from "@/lib/logger";

/** Return log entries, optionally filtered by level. */
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get("level") as LogLevel | null;
  try {
    const entries = await getLogs(level ?? undefined);
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ entries: [], error: String(e) });
  }
}

/** Clear all log entries. */
export async function DELETE() {
  try {
    await clearLogs();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
