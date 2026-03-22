/**
 * api/auto/route.ts — Read and write the auto_enabled flag in state.json.
 *
 * GET  /api/auto  — returns { enabled: boolean }
 * POST /api/auto  — body: { enabled: boolean }, saves to state.json
 *
 * When auto_enabled is false, main.py's polling mode exits early without
 * creating any folders. This lets you pause automation from the UI.
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const STATE_PATH = path.resolve(process.cwd(), "..", "state.json");

function readState(): Record<string, unknown> {
  if (!fs.existsSync(STATE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
}

// GET — return the current auto_enabled value (defaults to true if not set)
export async function GET() {
  const state = readState();
  const enabled = state.auto_enabled !== false; // treat missing as true
  return NextResponse.json({ enabled });
}

// POST — update auto_enabled in state.json
export async function POST(request: Request) {
  const body = await request.json();
  const enabled = Boolean(body.enabled);
  const state = readState();
  state.auto_enabled = enabled;
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  return NextResponse.json({ enabled });
}
