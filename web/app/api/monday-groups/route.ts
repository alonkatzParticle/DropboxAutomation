/**
 * api/monday-groups/route.ts — Fetch group names from Monday.com boards.
 *
 * GET /api/monday-groups?boardIds=123,456
 *
 * Returns an object keyed by board ID, each containing an array of
 * { id, title } for every group on that board.
 *
 * Reads MONDAY_API_TOKEN from the project root .env file (one level above web/).
 */

import { NextRequest, NextResponse } from "next/server";

function readMondayToken(): string | null {
  return process.env.MONDAY_API_TOKEN ?? null;
}

export async function GET(req: NextRequest) {
  const token = readMondayToken();
  if (!token) {
    return NextResponse.json(
      { error: "MONDAY_API_TOKEN not found in environment variables" },
      { status: 500 }
    );
  }

  const boardIds = req.nextUrl.searchParams.get("boardIds");
  if (!boardIds) {
    return NextResponse.json({ error: "boardIds query param required" }, { status: 400 });
  }

  const ids = boardIds.split(",").map((id) => id.trim()).filter(Boolean);

  const query = `
    query GetBoardGroups($ids: [ID!]) {
      boards(ids: $ids) {
        id
        groups {
          id
          title
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

    const result: Record<string, { id: string; title: string }[]> = {};
    for (const board of data.data?.boards ?? []) {
      result[board.id] = board.groups;
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch from Monday.com: ${err}` },
      { status: 500 }
    );
  }
}
