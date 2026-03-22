/**
 * api/status/route.ts — Returns current state from state.json and config.json
 *
 * GET /api/status
 * Returns board names, last-checked timestamps, and cron log tail.
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(process.cwd(), "..");

function readJson(filename: string) {
  const p = path.join(PROJECT_ROOT, filename);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readLogTail(filename: string, lines = 100): string {
  const p = path.join(PROJECT_ROOT, filename);
  if (!fs.existsSync(p)) return "";
  const content = fs.readFileSync(p, "utf-8");
  return content.split("\n").slice(-lines).join("\n").trim();
}

export async function GET() {
  const config = readJson("config.json");
  const state = readJson("state.json") ?? {};
  const log = readLogTail("cron.log");

  if (!config) {
    return NextResponse.json({ error: "config.json not found" }, { status: 500 });
  }

  // Shape the board data for the UI
  const boards = Object.entries(config.boards as Record<string, { name: string }>).map(
    ([id, board]) => ({
      id,
      name: board.name,
      lastChecked: state[id] ?? null,
    })
  );

  return NextResponse.json({ boards, log });
}
