/**
 * app/api/auto-create/route.ts — Auto-Creator API
 *
 * GET  /api/auto-create
 *   Returns all pending tasks classified as { ready: [...], ambiguous: [...] }
 *
 * POST /api/auto-create
 *   Body: { boardId, itemId, customPath? }
 *   Creates a Dropbox folder (at a computed or manually-chosen path),
 *   then writes the shared link back to Monday.com.
 *
 * Depends on: lib/auto-creator.ts, lib/storage.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { getPendingTasksWithStatus, autoCreateReadyTask, createFolderAtPath } from "@/lib/auto-creator";
import { loadState, saveState } from "@/lib/storage";

// GET — fetch and classify all pending tasks, also return any new item IDs from the webhook
export async function GET() {
  try {
    const [result, state] = await Promise.all([getPendingTasksWithStatus(), loadState()]);

    // Collect new item IDs stored by the webhook, then clear them
    const newItemIds = (state.new_item_ids as string[] | undefined) ?? [];
    if (newItemIds.length > 0) {
      state.new_item_ids = [];
      await saveState(state);
    }

    return NextResponse.json({ ...result, newItemIds });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST — create a folder for a specific task (ready or ambiguous)
export async function POST(req: NextRequest) {
  const { boardId, itemId, customPath } = await req.json();

  if (!boardId || !itemId) {
    return NextResponse.json({ error: "boardId and itemId are required" }, { status: 400 });
  }

  const result = customPath
    ? await createFolderAtPath(boardId, itemId, customPath)
    : await autoCreateReadyTask(boardId, itemId);

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
