/**
 * api/config/route.ts — Read and write the app's config.json file.
 *
 * GET /api/config  — Returns the current config (without internal _comment keys).
 * POST /api/config — Accepts updated fields and merges them into config.json.
 *                    Only the editable sections (department_rules, bundle_keywords,
 *                    other_keywords) are allowed to be overwritten for safety.
 *
 * Depends on: config.json in the project root (one directory above web/)
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Path to config.json — one level above the Next.js web/ folder
const CONFIG_PATH = path.resolve(process.cwd(), "..", "config.json");

/**
 * Remove all keys that start with "_" from an object — these are internal comments
 * used to document config.json and should not be exposed to the UI.
 */
function stripComments(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip any key that starts with underscore — those are comment fields
    if (key.startsWith("_")) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripComments(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * GET /api/config
 * Reads config.json and returns it as JSON, with comment fields removed.
 */
export async function GET() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    return NextResponse.json(stripComments(config));
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read config.json: ${err}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config
 * Accepts a JSON body with any of:
 *   { department_rules, bundle_keywords, other_keywords, boards }
 * Merges only those fields into the existing config.json and writes it back.
 *
 * For `boards`: performs a deep merge per board ID so that internal _comment
 * keys in config.json are preserved and only updated fields are overwritten.
 *
 * All other top-level fields (dropbox_root, etc.) are left untouched.
 */
export async function POST(req: Request) {
  try {
    // Read the existing config so we can merge into it
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);

    const body = await req.json();

    // The frontend should now only send updates inside the `boards` object
    // boards: shallow-merge per board ID to preserve _comment fields
    if ("boards" in body && body.boards && typeof body.boards === "object") {
      config.boards = config.boards ?? {};
      for (const [boardId, updates] of Object.entries(body.boards as Record<string, unknown>)) {
        // Merge the incoming fields into the existing board entry
        config.boards[boardId] = { ...(config.boards[boardId] ?? {}), ...(updates as object) };
      }
    }

    // Write the updated config back to disk with nice indentation
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to write config.json: ${err}` },
      { status: 500 }
    );
  }
}
