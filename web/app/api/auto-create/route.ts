/**
 * api/auto-create/route.ts — Auto-Creator API
 *
 * GET  /api/auto-create
 *   Returns all pending tasks classified as { ready: [...], ambiguous: [...] }
 *
 * POST /api/auto-create
 *   Body: { boardId, itemId, customPath }
 *   Creates a Dropbox folder at the manually-chosen path for an ambiguous task,
 *   then writes the shared link back to Monday.com.
 *
 * Depends on: web_auto_creator.py (Python backend)
 */

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);
const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const STATE_PATH = path.resolve(PROJECT_ROOT, "state.json");

/** Read state.json, returning an empty object if the file doesn't exist. */
function readState(): Record<string, unknown> {
  if (!fs.existsSync(STATE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
}

/** Write an updated state object back to state.json. */
function writeState(state: Record<string, unknown>) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Runs a Python one-liner and returns the parsed JSON output.
 * Returns { ok: false, data } if execution or JSON parsing fails.
 */
async function runPython(code: string): Promise<{ ok: boolean; data: unknown }> {
  try {
    const { stdout } = await execAsync(
      `cd "${PROJECT_ROOT}" && python3 -c "${code}"`,
      { timeout: 30000 }
    );
    return { ok: true, data: JSON.parse(stdout.trim()) };
  } catch (e: unknown) {
    return { ok: false, data: { success: false, error: String(e) } };
  }
}

/**
 * GET /api/auto-create
 * Calls web_auto_creator.get_pending_tasks_with_status() and returns the result.
 */
export async function GET() {
  const escaped = PROJECT_ROOT.replace(/"/g, '\\"');
  const { ok, data } = await runPython(
    `import json,sys; sys.path.insert(0,'${escaped}'); from web_auto_creator import get_pending_tasks_with_status; get_pending_tasks_with_status()`
  );

  if (!ok) return NextResponse.json(data, { status: 500 });

  // Read new item IDs stored by the webhook endpoint, then clear them
  const state = readState();
  const newItemIds = (state.new_item_ids as string[] | undefined) ?? [];
  if (newItemIds.length > 0) {
    state.new_item_ids = [];
    writeState(state);
  }

  // Merge newItemIds into the response so the page can highlight them
  const result = data as Record<string, unknown>;
  return NextResponse.json({ ...result, newItemIds });
}

/**
 * POST /api/auto-create
 * Calls web_auto_creator.create_folder_at_path() with the user-chosen path.
 */
export async function POST(req: NextRequest) {
  const { boardId, itemId, customPath } = await req.json();

  if (!boardId || !itemId || !customPath) {
    return NextResponse.json(
      { error: "boardId, itemId, and customPath are required" },
      { status: 400 }
    );
  }

  // Escape backslashes and single quotes in path to avoid breaking the Python string
  const safePath = String(customPath).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escaped = PROJECT_ROOT.replace(/"/g, '\\"');

  const { ok, data } = await runPython(
    `import json,sys; sys.path.insert(0,'${escaped}'); from web_auto_creator import create_folder_at_path; create_folder_at_path('${boardId}','${itemId}','${safePath}')`
  );

  if (!ok) return NextResponse.json(data, { status: 500 });
  return NextResponse.json(data);
}
