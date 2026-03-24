/**
 * lib/folder-mover.ts — Folder Mover page backend logic
 *
 * Handles two operations for the Folder Mover page:
 *   checkTaskFolder  — fetch a task, return its current Dropbox path and proposed new path
 *   moveTaskFolder   — move the Dropbox folder to a new path and update Monday.com
 *
 * Depends on: lib/monday-client.ts, lib/dropbox-client.ts, lib/board.ts, lib/storage.ts
 * Used by: app/api/folder-mover/route.ts
 */

import { getItemById, updateDropboxLink, getLinkUrl } from "./monday-client";
import { getFolderPathFromLink, moveFolder, getSharedLink } from "./dropbox-client";
import { Board, BoardConfig } from "./board";
import { loadConfig } from "./storage";

/**
 * Read a task and return everything the Folder Mover page needs:
 * - Current Dropbox folder path (if the task has a link)
 * - Proposed new path (computed from current column values)
 * Returns { success, taskName, boardId, itemId, hasFolder, proposedPath, dropboxRoot, ... }
 */
export async function checkTaskFolder(boardId: string, itemId: string) {
  const config = await loadConfig();
  const boards = config.boards as Record<string, BoardConfig>;
  const boardConfig = boards[String(boardId)];

  if (!boardConfig) return { success: false, error: `Board ${boardId} not found in config` };

  let item;
  try { item = await getItemById(itemId); }
  catch (e) { return { success: false, error: `Could not fetch task: ${e}` }; }

  const board = new Board(String(boardId), boardConfig);

  let proposedPath = "";
  try { proposedPath = board.buildPath(item, config.dropbox_root as string); } catch { /* ignore */ }

  const currentLink = getLinkUrl(item, board.dropboxLinkColumn);

  const result: Record<string, unknown> = {
    success: true,
    taskName: item.name,
    boardId: String(boardId),
    itemId: String(itemId),
    hasFolder: Boolean(currentLink),
    proposedPath,
    dropboxRoot: config.dropbox_root ?? "",
  };

  if (currentLink) {
    result.currentLink = currentLink;
    // Resolve the shared link to its actual display path
    const currentPath = await getFolderPathFromLink(currentLink);
    if (currentPath) {
      result.currentPath = currentPath;
      // The folder's name is the last segment of its path
      result.currentFolderName = currentPath.replace(/\/$/, "").split("/").pop();
    }
  }

  return result;
}

/**
 * Move a task's Dropbox folder to a new path and update the Monday.com link.
 * Returns { success, newLink, newPath } or { success: false, error }.
 */
export async function moveTaskFolder(boardId: string, itemId: string, newPath: string) {
  const config = await loadConfig();
  const boards = config.boards as Record<string, BoardConfig>;
  const boardConfig = boards[String(boardId)];

  if (!boardConfig) return { success: false, error: `Board ${boardId} not found in config` };

  let item;
  try { item = await getItemById(itemId); }
  catch (e) { return { success: false, error: `Could not fetch task: ${e}` }; }

  const board = new Board(String(boardId), boardConfig);
  const currentLink = getLinkUrl(item, board.dropboxLinkColumn);

  if (!currentLink) return { success: false, error: "This task has no existing Dropbox folder to move" };

  const oldPath = await getFolderPathFromLink(currentLink);
  if (!oldPath) return { success: false, error: "Could not determine the current folder path from the Dropbox link" };

  const moved = await moveFolder(oldPath, newPath);
  if (!moved) return { success: false, error: "Dropbox folder move failed — check that the destination path is valid" };

  let newLink: string;
  try { newLink = await getSharedLink(newPath); }
  catch { return { success: false, error: "Folder moved but could not generate a new shared link" }; }

  await updateDropboxLink(itemId, String(boardId), board.dropboxLinkColumn, newLink);

  return { success: true, newLink, newPath };
}

/**
 * Verify a task and return a preview of the folder path that would be created.
 * Also checks whether the task already has a Dropbox folder linked.
 * No side effects — used by the verify-link API route.
 */
export async function verifyLink(boardId: string, itemId: string) {
  const config = await loadConfig();
  const boards = config.boards as Record<string, BoardConfig>;
  const boardConfig = boards[boardId];
  if (!boardConfig) return { success: false, error: `Board ${boardId} not found in config` };
  try {
    const board = new Board(boardId, boardConfig);
    const item = await getItemById(itemId);
    const previewPath = board.buildPath(item, config.dropbox_root as string);
    // Check if this task already has a Dropbox link
    const existingLink = getLinkUrl(item, board.dropboxLinkColumn);
    return {
      success: true,
      taskName: item.name,
      previewPath,
      boardId,
      itemId,
      hasExistingFolder: Boolean(existingLink),
      existingLink: existingLink || undefined,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
