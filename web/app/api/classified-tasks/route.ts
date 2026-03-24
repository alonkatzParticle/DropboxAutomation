/**
 * app/api/classified-tasks/route.ts — Single fetch, all task buckets
 *
 * GET /api/classified-tasks
 *
 * Fetches all tasks from Monday.com once, then classifies each into:
 *   ready           — department matched, folder can be auto-created
 *   ambiguous       — no department rule, needs manual path
 *   skipped         — excluded by a skip rule or manually skipped
 *   approvedWithFolder — already has a folder, in Approved status
 *
 * This is the single source of truth used by both the Auto-Creator page
 * and the Skipped Tasks page. One API call, one Monday.com fetch.
 *
 * Depends on: lib/classifier.ts, lib/storage.ts, lib/monday-client.ts
 */

import { NextResponse } from "next/server";
import { getNewItems } from "@/lib/monday-client";
import { classifyAllItems, SkippedItem } from "@/lib/classifier";
import { loadConfig, loadState } from "@/lib/storage";
import { BoardConfig } from "@/lib/board";

export async function GET() {
  try {
    const [config, state] = await Promise.all([loadConfig(), loadState()]);
    const boards = config.boards as Record<string, BoardConfig>;
    const subdomain = (config.monday_subdomain as string) ?? "";
    const dropboxRoot = (config.dropbox_root as string) ?? "";
    const manualSkips = (state.skipped_items as SkippedItem[] | undefined) ?? [];

    // Fetch all items from all boards in parallel
    const itemsByBoard: Record<string, Awaited<ReturnType<typeof getNewItems>>> = {};
    await Promise.all(
      Object.keys(boards).map(async (boardId) => {
        try {
          itemsByBoard[boardId] = await getNewItems(boardId, "2000-01-01T00:00:00+00:00");
        } catch (e) {
          console.error(`[classified-tasks] Failed to fetch board ${boardId}:`, e);
          itemsByBoard[boardId] = [];
        }
      })
    );

    const result = classifyAllItems(boards, itemsByBoard, manualSkips, dropboxRoot, subdomain);

    // Also surface any new item IDs queued by the webhook, then clear them
    const newItemIds = (state.new_item_ids as string[] | undefined) ?? [];
    if (newItemIds.length > 0) {
      state.new_item_ids = [];
      const { saveState } = await import("@/lib/storage");
      await saveState(state);
    }

    return NextResponse.json({ ...result, newItemIds });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
