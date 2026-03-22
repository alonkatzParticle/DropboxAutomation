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
import fs from "fs";
import path from "path";

// Path to the .env file one level above the Next.js web/ folder
const ENV_PATH = path.resolve(process.cwd(), "..", ".env");

/**
 * Read MONDAY_API_TOKEN from the parent-directory .env file.
 * Returns null if the file is missing or the variable is not set.
 */
function readMondayToken(): string | null {
  try {
    const content = fs.readFileSync(ENV_PATH, "utf-8");
    const match = content.match(/^MONDAY_API_TOKEN\s*=\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
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
      { error: "MONDAY_API_TOKEN not found in .env" },
      { status: 500 }
    );
  }

  // Parse board IDs from query string, e.g. ?boardIds=123,456
  const boardIds = req.nextUrl.searchParams.get("boardIds");
  if (!boardIds) {
    return NextResponse.json({ error: "boardIds query param required" }, { status: 400 });
  }

  const ids = boardIds.split(",").map((id) => id.trim()).filter(Boolean);

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
