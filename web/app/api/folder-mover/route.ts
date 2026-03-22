/**
 * api/folder-mover/route.ts — API for checking and moving Dropbox folders.
 *
 * GET  /api/folder-mover?boardId=X&itemId=Y
 *   Returns task info, current Dropbox folder (if any), and proposed new path.
 *
 * POST /api/folder-mover
 *   Body: { boardId, itemId, newPath }
 *   Moves the existing folder to newPath and updates the Monday.com link.
 *
 * Depends on: web_folder_mover.py (Python backend)
 */

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

/**
 * Runs a Python one-liner and returns the parsed JSON output.
 * Returns { success: false, error } if execution fails.
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
 * GET /api/folder-mover?boardId=X&itemId=Y
 * Checks the task and returns current folder info + proposed path.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("boardId");
  const itemId = searchParams.get("itemId");

  if (!boardId || !itemId || !/^\d+$/.test(boardId) || !/^\d+$/.test(itemId)) {
    return NextResponse.json({ error: "boardId and itemId must be numeric" }, { status: 400 });
  }

  const escaped = PROJECT_ROOT.replace(/"/g, '\\"');
  const { ok, data } = await runPython(
    `import json,sys; sys.path.insert(0,'${escaped}'); from web_folder_mover import check_task_folder; print(json.dumps(check_task_folder('${boardId}','${itemId}')))`
  );

  if (!ok) return NextResponse.json(data, { status: 500 });
  return NextResponse.json(data);
}

/**
 * POST /api/folder-mover
 * Executes the folder move and updates the Monday.com link.
 */
export async function POST(req: NextRequest) {
  const { boardId, itemId, newPath } = await req.json();

  if (!boardId || !itemId || !newPath) {
    return NextResponse.json({ error: "boardId, itemId, and newPath are required" }, { status: 400 });
  }

  // Escape single quotes in path to avoid breaking the Python string literal
  const safePath = String(newPath).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escaped = PROJECT_ROOT.replace(/"/g, '\\"');

  const { ok, data } = await runPython(
    `import json,sys; sys.path.insert(0,'${escaped}'); from web_folder_mover import move_task_folder; print(json.dumps(move_task_folder('${boardId}','${itemId}','${safePath}')))`
  );

  if (!ok) return NextResponse.json(data, { status: 500 });
  return NextResponse.json(data);
}
