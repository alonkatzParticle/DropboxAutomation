/**
 * api/monday-column-options/route.ts — Fetch the available label/status values
 * for specific columns on Monday.com boards.
 *
 * GET /api/monday-column-options?boardIds=123,456&columnIds=label,status_1__1
 *
 * Returns { boardId: { columnId: ["Option A", "Option B", ...] } }
 * so the UI can populate dropdowns with real Monday column values.
 *
 * Reads MONDAY_API_TOKEN from the project root .env file (one level above web/).
 * Depends on: .env (MONDAY_API_TOKEN)
 */

import { NextRequest, NextResponse } from "next/server";

/** Read MONDAY_API_TOKEN from environment variables. */
function readMondayToken(): string | null {
  return process.env.MONDAY_API_TOKEN ?? null;
}

/**
 * Parse a Monday.com column's settings_str JSON to extract the list of
 * available label/status option strings.
 * Both label and status columns use { "labels": { "0": "Name", ... } } format.
 */
function parseOptions(settingsStr: string): string[] {
  try {
    const settings = JSON.parse(settingsStr);
    const labels = settings?.labels ?? {};
    // Values are the human-readable option names; filter out empty strings
    return Object.values(labels as Record<string, string>)
      .map((v) => String(v).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * GET /api/monday-column-options?boardIds=123,456&columnIds=label,status_1__1
 * Returns the available option values for each requested column on each board.
 */
export async function GET(req: NextRequest) {
  const token = readMondayToken();
  if (!token) {
    return NextResponse.json({ error: "MONDAY_API_TOKEN not found in .env" }, { status: 500 });
  }

  const boardIds = req.nextUrl.searchParams.get("boardIds");
  const columnIds = req.nextUrl.searchParams.get("columnIds");
  if (!boardIds || !columnIds) {
    return NextResponse.json({ error: "boardIds and columnIds query params required" }, { status: 400 });
  }

  const ids = boardIds.split(",").map((id) => id.trim()).filter(Boolean);
  const wantedColIds = new Set(columnIds.split(",").map((id) => id.trim()).filter(Boolean));

  const query = `
    query GetColumnSettings($ids: [ID!]) {
      boards(ids: $ids) {
        id
        columns { id settings_str }
      }
    }
  `;

  try {
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json", "API-Version": "2023-10" },
      body: JSON.stringify({ query, variables: { ids } }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Monday.com API returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    if (data.errors) {
      return NextResponse.json({ error: `Monday.com error: ${JSON.stringify(data.errors)}` }, { status: 502 });
    }

    // Build result: { boardId: { columnId: [options] } }
    const result: Record<string, Record<string, string[]>> = {};
    for (const board of data.data?.boards ?? []) {
      result[board.id] = {};
      for (const col of board.columns ?? []) {
        if (wantedColIds.has(col.id)) {
          result[board.id][col.id] = parseOptions(col.settings_str ?? "{}");
        }
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch from Monday.com: ${err}` }, { status: 500 });
  }
}
