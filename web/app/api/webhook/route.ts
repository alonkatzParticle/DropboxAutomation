/**
 * app/api/webhook/route.ts — Monday.com webhook receiver
 *
 * Monday.com calls this endpoint when a new item is created on any configured board.
 * We store the new item's ID in state so the Auto-Creator page can highlight it
 * the next time it polls.
 *
 * Monday.com webhook setup:
 *   1. Deploy this app publicly (Vercel gives you a public URL automatically)
 *   2. In Monday.com: Admin → Integrations → Webhooks → Add webhook
 *      URL: https://<your-vercel-url>/api/webhook
 *      Event: create_item (or item_created)
 *
 * Monday sends a challenge request first (to verify the URL). We echo it back.
 *
 * Depends on: lib/storage.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { loadState, saveState } from "@/lib/storage";

/**
 * POST /api/webhook
 * Handles two event types from Monday.com:
 *   - Challenge: { challenge: "abc123" } → echo back to verify the URL
 *   - Item created: { event: { boardId, pulseId, pulseName, ... } }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Monday.com sends a challenge when registering the webhook — echo it back
  if (body.challenge) {
    return NextResponse.json({ challenge: body.challenge });
  }

  const event = body.event as Record<string, unknown> | undefined;
  if (!event) return NextResponse.json({ ok: true });

  // pulseId is Monday's internal name for item ID
  const itemId = String(event.pulseId ?? "");
  if (!itemId || itemId === "undefined") return NextResponse.json({ ok: true });

  // Append the new item ID to the pending list in state
  const state = await loadState();
  const existing = (state.new_item_ids as string[] | undefined) ?? [];
  if (!existing.includes(itemId)) {
    state.new_item_ids = [...existing, itemId];
    await saveState(state);
  }

  return NextResponse.json({ ok: true });
}
