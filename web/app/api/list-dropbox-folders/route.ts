/**
 * api/list-dropbox-folders/route.ts — Lists subfolders at a given Dropbox path.
 *
 * GET /api/list-dropbox-folders?path=/Creative+2026/Marketing+Ads
 * Returns { folders: string[] } — names of immediate subfolders only.
 *
 * Used by the Folder Mover page's cascading dropdowns to let the user
 * navigate the existing Dropbox folder tree one level at a time.
 *
 * Depends on: dropbox_client.py
 */

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

/**
 * GET /api/list-dropbox-folders?path=...
 * Returns the names of all subfolders directly inside the given path.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const folderPath = searchParams.get("path") ?? "";

  // Escape the path so it's safe inside a Python single-quoted string
  const safePath = folderPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escaped = PROJECT_ROOT.replace(/"/g, '\\"');

  try {
    const { stdout } = await execAsync(
      `cd "${PROJECT_ROOT}" && python3 -c "import json,sys; sys.path.insert(0,'${escaped}'); import dropbox_client; print(json.dumps({'folders': dropbox_client.list_subfolder_names('${safePath}')}))"`,
      { timeout: 15000 }
    );
    return NextResponse.json(JSON.parse(stdout.trim()));
  } catch (e) {
    // Return an empty list on error so the UI degrades gracefully
    return NextResponse.json({ folders: [], error: String(e) });
  }
}
