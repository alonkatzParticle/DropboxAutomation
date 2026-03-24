/**
 * lib/dropbox-client.ts — Dropbox REST API operations
 *
 * Handles folder creation, sharing links, folder moves, and subfolder listing.
 * Uses the Dropbox HTTP API directly (no Python SDK needed).
 * Authentication is handled by lib/dropbox-auth.ts.
 *
 * Depends on: lib/dropbox-auth.ts
 * Used by: lib/core.ts, lib/auto-creator.ts, lib/folder-mover.ts
 */

import { getDropboxToken } from "./dropbox-auth";

const API = "https://api.dropboxapi.com/2";

// Helper: POST to a Dropbox API endpoint with a JSON body
async function post(endpoint: string, body: unknown): Promise<unknown> {
  const token = await getDropboxToken();
  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // 409 = conflict (folder already exists), handled by callers
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`Dropbox API error ${res.status} on ${endpoint}: ${text}`);
  }
  return res.json();
}

/**
 * Create a folder at the given Dropbox path.
 * Returns true if created, false if it already existed.
 * path — Full Dropbox path, e.g. "/Creative 2026/Marketing Ads/My Task"
 */
export async function createFolder(path: string): Promise<boolean> {
  const res = await fetch(`${API}/files/create_folder_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getDropboxToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, autorename: false }),
  });
  if (res.status === 409) return false; // Already exists
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dropbox create_folder failed ${res.status}: ${text}`);
  }
  return true;
}

/**
 * Get or create a shareable Dropbox link for the folder at path.
 * Returns the URL string.
 */
export async function getSharedLink(path: string): Promise<string> {
  const token = await getDropboxToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Try to create a new shared link
  const createRes = await fetch(`${API}/sharing/create_shared_link_with_settings`, {
    method: "POST", headers, body: JSON.stringify({ path }),
  });

  if (createRes.ok) {
    const data = await createRes.json() as { url: string };
    return data.url;
  }

  // If a link already exists, fetch and return it
  if (createRes.status === 409) {
    const listRes = await fetch(`${API}/sharing/list_shared_links`, {
      method: "POST", headers, body: JSON.stringify({ path, direct_only: true }),
    });
    const listData = await listRes.json() as { links: { url: string }[] };
    if (listData.links?.length) return listData.links[0].url;
  }

  throw new Error(`Could not get shared link for ${path}: ${createRes.status}`);
}

/**
 * Resolve a Dropbox shared link URL to its actual folder path.
 * Returns the path string (e.g. "/Creative 2026/...") or null if lookup fails.
 */
export async function getFolderPathFromLink(sharedLinkUrl: string): Promise<string | null> {
  try {
    const token = await getDropboxToken();
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const meta = await fetch(`${API}/sharing/get_shared_link_metadata`, {
      method: "POST", headers, body: JSON.stringify({ url: sharedLinkUrl }),
    });
    const metaData = await meta.json() as { path_lower?: string };
    if (!metaData.path_lower) return null;
    const file = await fetch(`${API}/files/get_metadata`, {
      method: "POST", headers, body: JSON.stringify({ path: metaData.path_lower }),
    });
    const fileData = await file.json() as { path_display?: string };
    return fileData.path_display ?? null;
  } catch {
    return null;
  }
}

/**
 * Move a Dropbox folder from one path to another.
 * Returns true on success, false if the move failed.
 */
export async function moveFolder(fromPath: string, toPath: string): Promise<boolean> {
  try {
    await post("/files/move_v2", { from_path: fromPath, to_path: toPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * List the names of all direct subfolders at the given Dropbox path.
 * Returns an empty array if the folder doesn't exist or has no subfolders.
 */
export async function listSubfolderNames(path: string): Promise<string[]> {
  try {
    const token = await getDropboxToken();
    const res = await fetch(`${API}/files/list_folder`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { entries: { ".tag": string; name: string }[] };
    return data.entries
      .filter((e) => e[".tag"] === "folder")
      .map((e) => e.name);
  } catch {
    return [];
  }
}
