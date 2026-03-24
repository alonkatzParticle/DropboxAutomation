/**
 * app/api/folder-mover/route.ts — API for checking and moving Dropbox folders
 *
 * GET  /api/folder-mover?boardId=X&itemId=Y
 *   Returns task info, current Dropbox folder (if any), and proposed new path.
 *
 * POST /api/folder-mover
 *   Body: { boardId, itemId, newPath }
 *   Moves the existing folder to newPath and updates the Monday.com link.
 *
 * Depends on: lib/folder-mover.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { checkTaskFolder, moveTaskFolder } from "@/lib/folder-mover";

// GET — return task info + current/proposed folder paths
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("boardId");
  const itemId = searchParams.get("itemId");

  if (!boardId || !itemId || !/^\d+$/.test(boardId) || !/^\d+$/.test(itemId)) {
    return NextResponse.json({ error: "boardId and itemId must be numeric" }, { status: 400 });
  }

  const result = await checkTaskFolder(boardId, itemId);
  return NextResponse.json(result, { status: (result as any).success ? 200 : 500 });
}

// POST — execute the folder move and update the Monday.com link
export async function POST(req: NextRequest) {
  const { boardId, itemId, newPath } = await req.json();

  if (!boardId || !itemId || !newPath) {
    return NextResponse.json({ error: "boardId, itemId, and newPath are required" }, { status: 400 });
  }

  const result = await moveTaskFolder(boardId, itemId, newPath);
  return NextResponse.json(result, { status: (result as any).success ? 200 : 500 });
}
