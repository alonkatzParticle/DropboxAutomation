/**
 * lib/monday-client.ts — Monday.com business logic
 *
 * High-level functions for fetching items and writing data back to Monday.com.
 * All GraphQL communication is delegated to lib/monday-api.ts.
 *
 * Depends on: lib/monday-api.ts
 * Used by: lib/core.ts, lib/auto-creator.ts, lib/folder-mover.ts, lib/board.ts
 */

import { runQuery } from "./monday-api";

// All column IDs we may need across all boards
const COLUMN_IDS = [
  "label", "label9", "single_selectu06tevn", "status_1__1",
  "single_selectrz7zhou", "single_selectrz7230p", "link4__1", "link0__1", "status",
  "label4",
];

// The GraphQL fragment reused by all item-fetching queries
const ITEM_FIELDS = `
  id
  name
  created_at
  group { title }
  column_values(ids: $columnIds) { id text value }
`;

/**
 * Fetch all items on a board created after a given ISO timestamp.
 * board_id  — Monday.com board ID
 * since_iso — ISO 8601 string, e.g. "2026-01-01T00:00:00Z"
 */
export async function getNewItems(boardId: string, sinceIso: string): Promise<MondayItem[]> {
  const data = await runQuery(
    `query ($boardId: ID!, $columnIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: 100) { items { ${ITEM_FIELDS} } }
      }
    }`,
    { boardId, columnIds: COLUMN_IDS }
  );
  const items = (data as any).boards[0].items_page.items as MondayItem[];
  return items.filter((item) => item.created_at > sinceIso);
}

/**
 * Fetch a single Monday.com item by its numeric ID.
 * Throws if the item is not found.
 */
export async function getItemById(itemId: string): Promise<MondayItem> {
  const data = await runQuery(
    `query ($itemId: ID!, $columnIds: [String!]) {
      items(ids: [$itemId]) { ${ITEM_FIELDS} }
    }`,
    { itemId, columnIds: COLUMN_IDS }
  );
  const items = (data as any).items as MondayItem[];
  if (!items?.length) throw new Error(`No item found with ID ${itemId}`);
  return items[0];
}

/**
 * Fetch multiple items by their IDs in a single request.
 */
export async function getItemsByIds(itemIds: string[]): Promise<MondayItem[]> {
  const data = await runQuery(
    `query ($itemIds: [ID!], $columnIds: [String!]) {
      items(ids: $itemIds) { ${ITEM_FIELDS} }
    }`,
    { itemIds, columnIds: COLUMN_IDS }
  );
  return ((data as any).items ?? []) as MondayItem[];
}

/**
 * Write a Dropbox folder URL back to the link column of a Monday.com item.
 */
export async function updateDropboxLink(
  itemId: string,
  boardId: string,
  columnId: string,
  linkUrl: string
): Promise<void> {
  const value = JSON.stringify({ url: linkUrl, text: "Dropbox Link" });
  await runQuery(
    `mutation ($itemId: ID!, $boardId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(item_id: $itemId, board_id: $boardId, column_id: $columnId, value: $value) { id }
    }`,
    { itemId, boardId, columnId, value }
  );
}

/**
 * Extract the text value of a column from an item's column_values array.
 * Returns an empty string if the column is not present.
 */
export function getColumnValue(item: MondayItem, columnId: string): string {
  for (const col of item.column_values ?? []) {
    if (col.id === columnId) return (col.text ?? "").trim();
  }
  return "";
}

/**
 * Extract the raw URL from a Monday.com link-type column.
 * Link columns store JSON like {"url": "https://...", "text": "Dropbox Link"}.
 */
export function getLinkUrl(item: MondayItem, columnId: string): string {
  for (const col of item.column_values ?? []) {
    if (col.id === columnId && col.value) {
      try { return JSON.parse(col.value).url ?? ""; } catch { /* ignore */ }
    }
  }
  return "";
}

// Shared type for a raw Monday.com item dict
export interface MondayItem {
  id: string;
  name: string;
  created_at: string;
  group?: { title: string };
  column_values: { id: string; text?: string; value?: string }[];
}
