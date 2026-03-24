/**
 * lib/core.ts — Core automation workflows
 *
 * Implements the main automation operations:
 *   processItem  — create a Dropbox folder for one task and write the link to Monday
 *   runPolling   — check all boards for new tasks since last run
 *   runAll       — backfill all tasks missing Dropbox links
 *   runManual    — process a single task by Monday.com URL
 *   runSelected  — process specific tasks by boardId:itemId pairs
 *
 * Depends on: lib/monday-client.ts, lib/dropbox-client.ts, lib/board.ts,
 *             lib/task.ts, lib/storage.ts
 * Used by: app/api/run/route.ts, app/api/cron/poll/route.ts
 */

import { getNewItems, getItemById, getItemsByIds, updateDropboxLink } from "./monday-client";
import { createFolder, getSharedLink } from "./dropbox-client";
import { Board, BoardConfig } from "./board";
import { Task } from "./task";
import { loadConfig, loadState, saveState } from "./storage";
import { log } from "./logger";

/**
 * Run the full automation for one Monday.com item:
 * 1. Skip if it already has a Dropbox link (unless force=true)
 * 2. Build the folder path from column values
 * 3. Create the folder in Dropbox
 * 4. Get a shareable link
 * 5. Write the link back to Monday.com
 */
export async function processItem(
  item: Parameters<typeof getItemById>[0] extends string ? Awaited<ReturnType<typeof getItemById>> : never,
  boardId: string,
  boardConfig: BoardConfig,
  config: Record<string, unknown>,
  force = false
): Promise<{ path: string; link: string }> {
  const board = new Board(boardId, boardConfig);
  const task = new Task(item as any, board, (config.monday_subdomain as string) ?? "");

  if (task.hasFolder && !force) {
    return { path: "", link: task.dropboxLink };
  }

  const dropboxRoot = config.dropbox_root as string;
  const folderPath = board.buildPath(task.rawItem(), dropboxRoot);
  await createFolder(folderPath);
  const link = await getSharedLink(folderPath);
  await updateDropboxLink(task.id, boardId, board.dropboxLinkColumn, link);
  await log("info", "processItem", `Created folder for '${task.taskName}'`, { boardId, itemId: task.id, path: folderPath });
  return { path: folderPath, link };
}

/**
 * Polling mode: check all boards for new tasks since the last run.
 * For tasks in the Form Requests group with no link:
 *   - Department recognised → auto-create folder
 *   - Department unrecognised → log for manual review
 * Respects the auto_enabled flag from the web UI.
 * Returns a human-readable log string.
 */
export async function runPolling(config: Record<string, unknown>): Promise<string> {
  const lines: string[] = [];
  const state = await loadState();

  if (state.auto_enabled === false) {
    return "Auto-create is disabled. Enable it in the web UI to resume.";
  }

  const nowIso = new Date().toISOString();
  const subdomain = (config.monday_subdomain as string) ?? "";
  const boards = config.boards as Record<string, BoardConfig>;

  for (const [boardId, boardConfig] of Object.entries(boards)) {
    const board = new Board(boardId, boardConfig);
    const since = (state[boardId] as string) ?? "2000-01-01T00:00:00+00:00";
    lines.push(`\n[${board.name}] Checking for new items since ${since}...`);

    try {
      const items = await getNewItems(boardId, since);
      lines.push(`  Found ${items.length} new item(s).`);

      for (const item of items) {
        const task = new Task(item, board, subdomain);
        if (!task.isNew) { lines.push(`  → Skipping '${task.taskName}' (group: '${task.groupTitle}')`); continue; }
        if (task.hasFolder) { lines.push(`  ↷ Skipping '${task.taskName}' — already has a Dropbox link.`); continue; }
        if (board.isAmbiguous(task.department)) {
          lines.push(`  ⚠ '${task.taskName}' — department '${task.department}' not recognised, needs manual review.`);
          continue;
        }
        try {
          await processItem(item, boardId, boardConfig, config);
          lines.push(`  ✓ Created folder for '${task.taskName}'.`);
        } catch (e) {
          lines.push(`  ✗ Failed for '${task.taskName}': ${e}`);
          await log("error", "runPolling", `Failed to create folder for '${task.taskName}'`, { boardId, itemId: task.id, error: String(e) });
        }
      }
    } catch (e) {
      lines.push(`  ✗ Could not fetch items from ${board.name}: ${e}`);
      await log("error", "runPolling", `Could not fetch items from board '${board.name}'`, { boardId, error: String(e) });
    }
  }

  for (const boardId of Object.keys(boards)) { state[boardId] = nowIso; }
  await saveState(state);
  lines.push("\nDone. State updated.");
  return lines.join("\n");
}

/** Backfill mode: process ALL items across all boards that are missing a Dropbox link. */
export async function runAll(config: Record<string, unknown>): Promise<string> {
  const lines: string[] = [];
  const boards = config.boards as Record<string, BoardConfig>;
  const subdomain = (config.monday_subdomain as string) ?? "";

  for (const [boardId, boardConfig] of Object.entries(boards)) {
    const board = new Board(boardId, boardConfig);
    lines.push(`\n[${board.name}] Fetching all items...`);
    try {
      const items = await getNewItems(boardId, "2000-01-01T00:00:00+00:00");
      lines.push(`  Found ${items.length} item(s).`);
      for (const item of items) {
        const task = new Task(item, board, subdomain);
        try { await processItem(item, boardId, boardConfig, config); lines.push(`  ✓ ${task.taskName}`); }
        catch (e) { lines.push(`  ✗ ${task.taskName}: ${e}`); await log("error", "runAll", `Failed: ${task.taskName}`, { boardId, itemId: task.id, error: String(e) }); }
      }
    } catch (e) { lines.push(`  ✗ Could not fetch from ${board.name}: ${e}`); }
  }

  lines.push("\nDone.");
  return lines.join("\n");
}

/** Manual mode: process a specific task by its Monday.com item ID and board ID. */
export async function runManual(
  boardId: string, itemId: string, config: Record<string, unknown>, force = false
): Promise<string> {
  const boards = config.boards as Record<string, BoardConfig>;
  const boardConfig = boards[boardId];
  if (!boardConfig) throw new Error(`Board ${boardId} not found in config`);
  const item = await getItemById(itemId);
  const { path, link } = await processItem(item, boardId, boardConfig, config, force);
  return `✓ Created: ${path}\nLink: ${link}`;
}

/** Selected mode: process specific items given as { boardId, itemId } pairs. */
export async function runSelected(
  items: { boardId: string; itemId: string }[], config: Record<string, unknown>, force = false
): Promise<string> {
  const lines: string[] = [];
  const boards = config.boards as Record<string, BoardConfig>;
  for (const { boardId, itemId } of items) {
    const boardConfig = boards[boardId];
    if (!boardConfig) { lines.push(`✗ Board ${boardId} not found in config`); continue; }
    try {
      const fetched = await getItemsByIds([itemId]);
      if (!fetched.length) { lines.push(`✗ Item ${itemId} not found`); continue; }
      const { path, link } = await processItem(fetched[0], boardId, boardConfig, config, force);
      lines.push(`✓ ${fetched[0].name}: ${path}\nLink: ${link}`);
    } catch (e) { lines.push(`✗ ${itemId}: ${e}`); await log("error", "runSelected", `Failed for item ${itemId}`, { boardId, itemId, error: String(e) }); }
  }
  lines.push("\nDone.");
  return lines.join("\n");
}
