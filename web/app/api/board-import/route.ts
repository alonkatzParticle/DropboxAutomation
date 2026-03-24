/**
 * api/board-import/route.ts — Parse a Monday.com board URL and fetch its metadata.
 *
 * GET /api/board-import?url=https://company.monday.com/boards/12345678
 *
 * Extracts the board ID from the URL, then fetches:
 *   - Board name
 *   - All columns (id, title, type)
 *   - Existing config for that board (if any) from config.json
 *
 * Returns:
 *   { boardId, boardName, columns: [{id, title, type}], existingConfig: {...} | null }
 *
 * Reads MONDAY_API_TOKEN from the project root .env file.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/storage";

function readMondayToken(): string | null {
  return process.env.MONDAY_API_TOKEN ?? null;
}

/** Extract a numeric board ID from a Monday.com board URL. */
function extractBoardId(url: string): string | null {
  // Accepts formats like:
  //   https://company.monday.com/boards/12345678
  //   https://company.monday.com/boards/12345678/views/...
  const match = url.match(/\/boards\/(\d+)/);
  return match ? match[1] : null;
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "url query param required" }, { status: 400 });
  }

  const boardId = extractBoardId(rawUrl);
  if (!boardId) {
    return NextResponse.json(
      { error: "Could not extract a board ID from the URL. Make sure it contains /boards/<id>." },
      { status: 400 }
    );
  }

  const token = readMondayToken();
  if (!token) {
    return NextResponse.json(
      { error: "MONDAY_API_TOKEN not found in environment variables" },
      { status: 500 }
    );
  }

  const query = `
    query GetBoard($ids: [ID!]) {
      boards(ids: $ids) {
        id
        name
        columns {
          id
          title
          type
        }
      }
    }
  `;

  try {
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        "API-Version": "2023-10",
      },
      body: JSON.stringify({ query, variables: { ids: [boardId] } }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Monday.com API returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    if (data.errors) {
      return NextResponse.json(
        { error: `Monday.com error: ${JSON.stringify(data.errors)}` },
        { status: 502 }
      );
    }

    const board = data.data?.boards?.[0];
    if (!board) {
      return NextResponse.json(
        { error: `Board ${boardId} not found. Check that the URL is correct and your API token has access.` },
        { status: 404 }
      );
    }

    // Load existing config for this board if it exists
    let existingConfig: Record<string, unknown> | null = null;
    try {
      const cfg = await loadConfig();
      existingConfig = ((cfg?.boards as Record<string, Record<string, unknown>>)?.[boardId]) ?? null;
    } catch {
      // Config unreadable — treat as new board
    }

    return NextResponse.json({
      boardId,
      boardName: board.name,
      columns: board.columns as { id: string; title: string; type: string }[],
      existingConfig,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch from Monday.com: ${err}` },
      { status: 500 }
    );
  }
}
