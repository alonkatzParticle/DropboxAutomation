/**
 * api/history/route.ts — Auto-created folder history
 *
 * Stores the last 50 Dropbox folders that were automatically created
 * by the Auto-Creator page. Persisted in history.json next to the app.
 *
 * GET  /api/history — returns { entries: HistoryEntry[] }
 * POST /api/history — body: HistoryEntry[], appends to history (max 50 kept)
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const HISTORY_PATH = path.resolve(process.cwd(), "..", "history.json");
const MAX_ENTRIES = 50;

export interface HistoryEntry {
  taskName: string;
  boardName: string;
  previewPath: string;
  createdAt: string;  // ISO timestamp of when the folder was auto-created
}

/** Read history.json, returning empty array if file doesn't exist. */
function readHistory(): HistoryEntry[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
    return data.entries ?? [];
  } catch {
    return [];
  }
}

/** Write entries back to history.json. */
function writeHistory(entries: HistoryEntry[]) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify({ entries }, null, 2));
}

// GET — return all stored history entries
export async function GET() {
  return NextResponse.json({ entries: readHistory() });
}

// POST — prepend new entries and trim to MAX_ENTRIES
export async function POST(req: NextRequest) {
  const body = await req.json();
  const newEntries: HistoryEntry[] = Array.isArray(body) ? body : [];
  const existing = readHistory();

  // New entries go at the top (most recent first), trim to 50
  const updated = [...newEntries, ...existing].slice(0, MAX_ENTRIES);
  writeHistory(updated);

  return NextResponse.json({ entries: updated });
}
