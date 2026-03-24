/**
 * app/api/verify-link/route.ts — Verify a Monday.com task and preview folder path
 *
 * GET /api/verify-link?boardId=X&itemId=Y
 * Fetches the task and computes what folder path would be created.
 * Returns: { success, taskName, previewPath } or { success: false, error }
 *
 * No side effects — preview only, no folder creation.
 *
 * Depends on: lib/folder-mover.ts (verifyLink)
 */

import { NextResponse } from "next/server";
import { verifyLink } from "@/lib/folder-mover";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  const itemId = url.searchParams.get("itemId");

  if (!boardId || !itemId) {
    return NextResponse.json({ success: false, error: "Missing boardId or itemId" }, { status: 400 });
  }
  if (!/^\d+$/.test(boardId) || !/^\d+$/.test(itemId)) {
    return NextResponse.json({ success: false, error: "boardId and itemId must be numeric" }, { status: 400 });
  }

  const result = await verifyLink(boardId, itemId);
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
