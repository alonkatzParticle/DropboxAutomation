/**
 * api/monday-columns/route.ts — Fetch column names from Monday.com boards.
 *
 * GET /api/monday-columns?boardIds=123,456
 *
 * Returns an object keyed by board ID, each containing an array of
 * { id, title, type } for every column on that board.
 * This lets the UI show human-readable column names instead of raw IDs.
 *
 * Reads MONDAY_API_TOKEN from the project root .env file (one level above web/).
 */

import { NextRequest, NextResponse } from "next/server";

/** Read MONDAY_API_TOKEN from environment variables. */
function readMondayToken(): string | null {
  return process.env.MONDAY_API_TOKEN ?? null;
}

/**
 * GET /api/monday-columns?boardIds=123,456
 * Calls the Monday.com GraphQL API to get columns for each board ID.
 * Returns: { "123": [{ id, title, type }, ...], "456": [...] }
 */
export async function GET(req: NextRequest) {
  const token = readMondayToken();
  if (!token) {
    return NextResponse.json(
      { error: "MONDAY_API_TOKEN not found in environment variables" },
      { status: 500 }
    );
  }

  // Parse board IDs from query string, e.g. ?boardIds=123,456
  const boardIds = req.nextUrl.searchParams.get("boardIds");
  // Return empty result instead of error when no board IDs are provided.
  // This happens when the UI calls before the board list has finished loading.
  if (!boardIds) return NextResponse.json({});

  const ids = boardIds.split(",").map((id) => id.trim()).filter(Boolean);
  // If all IDs were empty strings after trimming, nothing to fetch
  if (!ids.length) return NextResponse.json({});

  const query = `
    query GetBoardColumns($ids: [ID!]) {
      boards(ids: $ids) {
        id
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
      body: JSON.stringify({ query, variables: { ids } }),
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

    // Reshape into { boardId: [columns] }
    const result: Record<string, { id: string; title: string; type: string }[]> = {};
    for (const board of data.data?.boards ?? []) {
      result[board.id] = board.columns;
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch from Monday.com: ${err}` },
      { status: 500 }
    );
  }
}
