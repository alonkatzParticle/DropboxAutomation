/**
 * app/api/auto/route.ts — Read and write the auto_enabled flag
 *
 * GET  /api/auto  — returns { enabled: boolean }
 * POST /api/auto  — body: { enabled: boolean }, persists to state
 *
 * When auto_enabled is false, polling mode skips creating folders.
 * This lets you pause automation from the web UI.
 *
 * Depends on: lib/storage.ts
 */

import { NextResponse } from "next/server";
import { loadState, saveState } from "@/lib/storage";

// GET — return the current auto_enabled value (defaults to true if not set)
export async function GET() {
  const state = await loadState();
  const enabled = state.auto_enabled !== false; // treat missing as true
  return NextResponse.json({ enabled });
}

// POST — update auto_enabled in state
export async function POST(request: Request) {
  const body = await request.json();
  const enabled = Boolean(body.enabled);
  const state = await loadState();
  state.auto_enabled = enabled;
  await saveState(state);
  return NextResponse.json({ enabled });
}
