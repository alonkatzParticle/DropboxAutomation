/**
 * app/api/list-dropbox-folders/route.ts — List subfolders at a Dropbox path
 *
 * GET /api/list-dropbox-folders?path=/Creative 2026/Marketing Ads
 * Returns: { folders: ["Products", "Bundles", ...] }
 *
 * Used by the Folder Mover page's cascading dropdown selectors.
 *
 * Depends on: lib/dropbox-client.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { listSubfolderNames } from "@/lib/dropbox-client";
import { loadConfig } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedPath = searchParams.get("path");

  // If no path given, use the dropbox_root from config as a starting point
  if (!requestedPath) {
    try {
      const config = await loadConfig();
      const root = (config.dropbox_root as string) ?? "";
      const folders = await listSubfolderNames(root);
      return NextResponse.json({ folders });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  try {
    const folders = await listSubfolderNames(requestedPath);
    return NextResponse.json({ folders });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
