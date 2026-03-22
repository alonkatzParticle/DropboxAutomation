/**
 * api/verify-link/route.ts — Verify a Monday.com task and preview folder path
 *
 * GET /api/verify-link?boardId=X&itemId=Y
 * Fetches task data from Monday.com and computes the folder path that would be created.
 * Returns: { success: boolean, taskName?: string, previewPath?: string, error?: string }
 *
 * No side effects — verification only, no folder creation.
 */

import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

const PROJECT_ROOT = path.resolve(process.cwd(), "..");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  const itemId = url.searchParams.get("itemId");

  // Validate parameters
  if (!boardId || !itemId) {
    return NextResponse.json(
      { success: false, error: "Missing boardId or itemId" },
      { status: 400 }
    );
  }

  if (!/^\d+$/.test(boardId) || !/^\d+$/.test(itemId)) {
    return NextResponse.json(
      { success: false, error: "boardId and itemId must be numeric" },
      { status: 400 }
    );
  }

  // Call Python backend to verify and compute path
  const result = await new Promise<{
    output: string;
    success: boolean;
  }>((resolve) => {
    exec(
      `python3 -c "import sys; sys.path.insert(0, '.'); from web import verify_link; import json; print(json.dumps(verify_link('${boardId}', '${itemId}')))"`,
      { cwd: PROJECT_ROOT, timeout: 30 * 1000 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ output: stderr || error.message, success: false });
        } else {
          resolve({ output: stdout.trim(), success: true });
        }
      }
    );
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.output },
      { status: 500 }
    );
  }

  try {
    const verification = JSON.parse(result.output);
    return NextResponse.json(verification);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to parse verification response from Python",
        raw: result.output,
      },
      { status: 500 }
    );
  }
}
