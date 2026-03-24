/**
 * app/api/history/route.ts — Auto-created folder history
 *
 * Stores the last 50 Dropbox folders automatically created by the Auto-Creator page.
 * Persisted via lib/storage.ts (filesystem locally, Vercel KV in production).
 *
 * GET  /api/history — returns { entries: HistoryEntry[] }
 * POST /api/history — body: HistoryEntry[], prepends new entries (max 50 kept)
 *
 * Depends on: lib/storage.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { storageGet, storageSet } from "@/lib/storage";

const MAX_ENTRIES = 50;

export interface HistoryEntry {
  taskName: string;
  boardName: string;
  previewPath: string;
  createdAt: string; // ISO timestamp
}

async function readHistory(): Promise<HistoryEntry[]> {
  const data = await storageGet<{ entries: HistoryEntry[] }>("history");
  return data?.entries ?? [];
}

// GET — return all stored history entries
export async function GET() {
  return NextResponse.json({ entries: await readHistory() });
}

// POST — prepend new entries and trim to MAX_ENTRIES
export async function POST(req: NextRequest) {
  const body = await req.json();
  const newEntries: HistoryEntry[] = Array.isArray(body) ? body : [];
  const existing = await readHistory();
  const updated = [...newEntries, ...existing].slice(0, MAX_ENTRIES);
  await storageSet("history", { entries: updated });
  return NextResponse.json({ entries: updated });
}
