/**
 * lib/auto-creator.ts — Auto-creator page backend logic
 *
 * getPendingTasksWithStatus — fetches and classifies all tasks, returning only
 *   ready + ambiguous (skipped tasks are excluded — they go to the Skipped Tasks page).
 *
 * autoCreateReadyTask  — auto-create Dropbox folder for a ready task
 * createFolderAtPath   — create folder at a manually-chosen path (ambiguous tasks)
 *
 * Depends on: lib/classifier.ts, lib/monday-client.ts, lib/dropbox-client.ts,
 *             lib/board.ts, lib/core.ts, lib/storage.ts
 * Used by: app/api/auto-create/route.ts
 */

import { getNewItems, getItemById, updateDropboxLink } from "./monday-client";
import { createFolder, getSharedLink } from "./dropbox-client";
import { Board, BoardConfig } from "./board";
import { processItem } from "./core";
import { loadConfig, loadState } from "./storage";
import { classifyAllItems, SkippedItem } from "./classifier";

/**
 * Fetch all tasks and return only those that need attention in the Auto-Creator:
 * ready, ambiguous, approvedWithFolder, and groupWarnings.
 * Skipped tasks are excluded entirely.
 */
export async function getPendingTasksWithStatus() {
  const [config, state] = await Promise.all([loadConfig(), loadState()]);
  const boards = config.boards as Record<string, BoardConfig>;
  const subdomain = (config.monday_subdomain as string) ?? "";
  const dropboxRoot = (config.dropbox_root as string) ?? "";
  const manualSkips = (state.skipped_items as SkippedItem[] | undefined) ?? [];

  // Fetch all boards in parallel
  const itemsByBoard: Record<string, Awaited<ReturnType<typeof getNewItems>>> = {};
  await Promise.all(
    Object.keys(boards).map(async (boardId) => {
      try {
        itemsByBoard[boardId] = await getNewItems(boardId, "2000-01-01T00:00:00+00:00");
      } catch (e) {
        console.error(`Error fetching board ${boardId}:`, e);
        itemsByBoard[boardId] = [];
      }
    })
  );

  const { ready, ambiguous, approvedWithFolder, groupWarnings } = classifyAllItems(
    boards, itemsByBoard, manualSkips, dropboxRoot, subdomain
  );

  // Skipped tasks are not returned here — they only appear on the Skipped Tasks page
  return { ready, ambiguous, approvedWithFolder, groupWarnings };
}

/**
 * Auto-create a Dropbox folder for a ready task (department rule matched).
 * Returns { success, path } or { success: false, error }.
 */
export async function autoCreateReadyTask(boardId: string, itemId: string) {
  const config = await loadConfig();
  const boards = config.boards as Record<string, BoardConfig>;
  const boardConfig = boards[boardId];
  if (!boardConfig) return { success: false, error: `Board ${boardId} not found in config` };
  try {
    const item = await getItemById(itemId);
    const board = new Board(boardId, boardConfig);
    const folderPath = board.buildPath(item, config.dropbox_root as string);
    await processItem(item, boardId, boardConfig, config);
    return { success: true, path: folderPath };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Create a Dropbox folder at a manually-chosen path for an ambiguous task,
 * then write the shared link back to Monday.com.
 * Returns { success, link } or { success: false, error }.
 */
export async function createFolderAtPath(boardId: string, itemId: string, customPath: string) {
  const config = await loadConfig();
  const boards = config.boards as Record<string, BoardConfig>;
  const boardConfig = boards[boardId];
  if (!boardConfig) return { success: false, error: `Board ${boardId} not found in config` };
  try {
    const board = new Board(boardId, boardConfig);
    await createFolder(customPath);
    const link = await getSharedLink(customPath);
    await updateDropboxLink(itemId, boardId, board.dropboxLinkColumn, link);
    return { success: true, link };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
