/**
 * app/api/status/route.ts — Returns current app state
 *
 * GET /api/status
 * Returns board names, last-checked timestamps per board, and auto-enabled flag.
 *
 * Depends on: lib/storage.ts
 */

import { NextResponse } from "next/server";
import { loadConfig, loadState } from "@/lib/storage";
import { BoardConfig } from "@/lib/board";

export async function GET() {
  try {
    const [config, state] = await Promise.all([loadConfig(), loadState()]);
    const boards = config.boards as Record<string, BoardConfig>;

    const boardList = Object.entries(boards).map(([id, board]) => ({
      id,
      name: board.name,
      lastChecked: (state[id] as string) ?? null,
    }));

    return NextResponse.json({ boards: boardList, log: "" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
