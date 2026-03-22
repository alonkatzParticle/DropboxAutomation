/**
 * api/webhook/route.ts — Monday.com webhook receiver
 *
 * Monday.com calls this endpoint when a new item is created on any configured board.
 * We store the new item's ID in state.json so the Auto-Creator page can highlight it
 * the next time it polls.
 *
 * Monday.com webhook setup:
 *   1. Expose this server publicly (e.g. ngrok http 3000)
 *   2. In Monday.com: Admin → Integrations → Webhooks → Add webhook
 *      URL: https://<your-public-url>/api/webhook
 *      Event: create_item (or item_created)
 *
 * Monday sends a challenge request first (to verify the URL). We echo it back.
 * After verification, Monday sends real events with this shape:
 *   { event: { boardId, pulseId, pulseName, ... } }
 *
 * Depends on: state.json (auto-created if missing)
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Path to state.json (one level above the web/ directory)
const STATE_PATH = path.resolve(process.cwd(), "..", "state.json");

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
 * POST /api/webhook
 * Monday.com sends all webhook events here:
 *  - Challenge: { challenge: "abc123" } → echo back to verify the URL
 *  - Item created: { event: { boardId, pulseId, pulseName, ... } }
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

  // Extract the item ID from the event payload
  const event = body.event as Record<string, unknown> | undefined;
  if (!event) {
    return NextResponse.json({ ok: true }); // Ignore unknown payloads
  }

  // pulseId is Monday's internal name for item ID
  const itemId = String(event.pulseId ?? "");
  if (!itemId || itemId === "undefined") {
    return NextResponse.json({ ok: true });
  }

  // Append the new item ID to the pending list in state.json
  const state = readState();
  const existing = (state.new_item_ids as string[] | undefined) ?? [];
  // Avoid duplicates — only add if not already in the list
  if (!existing.includes(itemId)) {
    state.new_item_ids = [...existing, itemId];
    writeState(state);
  }

  return NextResponse.json({ ok: true });
}
