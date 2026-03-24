/**
 * app/api/config/route.ts — Read and write app configuration
 *
 * GET  /api/config  — Returns the current config (without _comment keys)
 * POST /api/config  — Merges updated fields into config and saves
 *
 * Uses lib/storage.ts so config persists on both local filesystem and Vercel KV.
 *
 * Depends on: lib/storage.ts
 */

import { NextResponse } from "next/server";
import { loadConfig, storageSet } from "@/lib/storage";

/** Remove all keys starting with "_" — these are internal comment fields */
function stripComments(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("_")) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripComments(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// GET — return current config without comment fields
export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json(stripComments(config));
  } catch (e) {
    return NextResponse.json({ error: `Failed to read config: ${e}` }, { status: 500 });
  }
}

// POST — merge updated fields into config and persist
export async function POST(req: Request) {
  try {
    const config = await loadConfig();
    const body = await req.json();

    // Deep-merge boards (preserve existing _comment fields per board)
    if (body.boards && typeof body.boards === "object") {
      config.boards = (config.boards as Record<string, unknown>) ?? {};
      for (const [boardId, updates] of Object.entries(body.boards as Record<string, unknown>)) {
        (config.boards as Record<string, unknown>)[boardId] = {
          ...((config.boards as Record<string, unknown>)[boardId] as object ?? {}),
          ...(updates as object),
        };
      }
    }

    await storageSet("config", config);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Failed to write config: ${e}` }, { status: 500 });
  }
}
