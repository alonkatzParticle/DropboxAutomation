/**
 * app/api/skipped-tasks/route.ts — Manual skip / unskip individual tasks
 *
 * POST /api/skipped-tasks
 *   Body: { action: "skip" | "unskip", itemId: string, reason?: string }
 *
 *   skip   — adds the item ID to the manual skip list in state
 *   unskip — removes it (task returns to Auto-Creator on next load)
 *
 * The manual skip list is stored in state under "skipped_items".
 * Rule-based skips are not managed here — they are evaluated automatically
 * from config.json each time tasks are classified.
 *
 * Depends on: lib/storage.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { loadState, saveState } from "@/lib/storage";
import { SkippedItem } from "@/lib/classifier";

export async function POST(req: NextRequest) {
  const { action, itemId, reason } = await req.json();

  if (!itemId || !["skip", "unskip"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'skip' or 'unskip', and itemId is required" },
      { status: 400 }
    );
  }

  const state = await loadState();
  const skippedItems = (state.skipped_items as SkippedItem[] | undefined) ?? [];

  if (action === "skip") {
    // Only add if not already in the list
    if (!skippedItems.find((s) => s.itemId === itemId)) {
      skippedItems.push({
        itemId,
        skippedAt: new Date().toISOString(),
        reason: reason ?? "Manually skipped",
      });
    }
  } else {
    // Remove from the list
    const index = skippedItems.findIndex((s) => s.itemId === itemId);
    if (index !== -1) skippedItems.splice(index, 1);
  }

  state.skipped_items = skippedItems;
  await saveState(state);

  return NextResponse.json({ ok: true, count: skippedItems.length });
}
