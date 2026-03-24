/**
 * lib/classifier.ts — Task classification logic
 *
 * Single function that takes all raw Monday.com items for a board and sorts
 * each one into exactly one of four buckets:
 *   ready           — department rule matched, folder can be auto-created
 *   ambiguous       — no department rule, needs manual path selection
 *   skipped         — excluded by a skip rule OR manually skipped by the user
 *   approvedWithFolder — already has a folder and is in Approved status
 *
 * A task is skipped if:
 *   1. Its item ID is in the manual skip list (state.skipped_items), OR
 *   2. It matches ANY skip rule defined for its board in config.json
 *
 * Skip rule structure in config.json per board:
 *   "skip_rules": [{ "name": "Upload B-Roll", "conditions": [{ "column": "video_type", "value": "Upload B-Roll" }] }]
 *
 * All conditions in a rule must match (AND). Any rule matching is enough (OR).
 *
 * Depends on: lib/monday-client.ts, lib/board.ts, lib/task.ts
 * Used by: lib/auto-creator.ts, app/api/classified-tasks/route.ts
 */

import { getColumnValue, MondayItem } from "./monday-client";
import { Board, BoardConfig, getDateFolder } from "./board";
import { Task } from "./task";

export interface SkipRule {
  name: string;
  conditions: { column: string; value: string }[];
}

export interface SkippedItem {
  itemId: string;
  skippedAt: string;  // ISO timestamp
  reason?: string;    // optional label the user gave
}

export interface SkippedTask {
  id: string; boardId: string; boardName: string; taskName: string;
  mondayUrl: string; department: string; status: string;
  createdAt: string; skipReason: string; // rule name or "Manually skipped"
}

export interface ReadyTask {
  id: string; boardId: string; boardName: string; taskName: string;
  mondayUrl: string; previewPath: string; status: string;
  isApproved: boolean; isNew: boolean; createdAt: string;
}

export interface AmbiguousTask {
  id: string; boardId: string; boardName: string; taskName: string;
  mondayUrl: string; department: string; status: string;
  isApproved: boolean; isNew: boolean; createdAt: string;
  columnValues: { product: string; platform: string; category: string; media_type: string; date: string };
}

export interface ApprovedWithFolder {
  id: string; boardId: string; boardName: string; taskName: string;
  mondayUrl: string; dropboxLink: string;
}

/**
 * Check whether a task matches a single skip rule.
 * All conditions must match (AND logic).
 */
function matchesRule(item: MondayItem, rule: SkipRule, board: Board): boolean {
  return rule.conditions.every(({ column, value }) => {
    const colId = board.columns[column] ?? "";
    if (!colId) return false;
    const taskValue = getColumnValue(item, colId);
    return taskValue.toLowerCase() === value.toLowerCase();
  });
}

/**
 * Find the first skip rule that matches a task, or null if none match.
 */
function findMatchingRule(item: MondayItem, rules: SkipRule[], board: Board): SkipRule | null {
  return rules.find((rule) => matchesRule(item, rule, board)) ?? null;
}

export interface ClassifiedResult {
  ready: ReadyTask[];
  ambiguous: AmbiguousTask[];
  skipped: SkippedTask[];
  approvedWithFolder: ApprovedWithFolder[];
  groupWarnings: { boardId: string; boardName: string; configured: string; foundGroups: string[] }[];
}

/**
 * Classify all items from all boards into the four buckets.
 *
 * boards         — board configs from config.json
 * allItems       — map of boardId → items fetched from Monday.com
 * manualSkips    — set of item IDs the user manually skipped
 * dropboxRoot    — root Dropbox path for building preview paths
 * subdomain      — Monday.com subdomain for building task URLs
 */
export function classifyAllItems(
  boards: Record<string, BoardConfig>,
  allItems: Record<string, MondayItem[]>,
  manualSkips: SkippedItem[],
  dropboxRoot: string,
  subdomain: string
): ClassifiedResult {
  const ready: ReadyTask[] = [];
  const ambiguous: AmbiguousTask[] = [];
  const skipped: SkippedTask[] = [];
  const approvedWithFolder: ApprovedWithFolder[] = [];
  const groupWarnings: ClassifiedResult["groupWarnings"] = [];
  const manualSkipIds = new Set(manualSkips.map((s) => s.itemId));

  for (const [boardId, boardConfig] of Object.entries(boards)) {
    const board = new Board(boardId, boardConfig);
    const items = allItems[boardId] ?? [];
    const skipRules: SkipRule[] = (boardConfig as any).skip_rules ?? [];

    // Validate that the configured form_requests_group actually exists on this board
    const foundGroups = new Set(items.map((i) => i.group?.title).filter(Boolean) as string[]);
    if (foundGroups.size && ![...foundGroups].some((g) => g.toLowerCase() === board.formRequestsGroup)) {
      groupWarnings.push({ boardId, boardName: board.name, configured: (boardConfig as any).form_requests_group ?? "Form Requests", foundGroups: [...foundGroups].sort() });
    }

    for (const item of items) {
      const task = new Task(item, board, subdomain);

      // Tasks that already have a folder
      if (task.hasFolder) {
        if (task.isApproved && !task.isCompleted) {
          approvedWithFolder.push({ id: task.id, boardId: task.boardId, boardName: task.boardName, taskName: task.taskName, mondayUrl: task.mondayUrl, dropboxLink: task.dropboxLink });
        }
        continue;
      }

      // Completed tasks need no action
      if (task.isCompleted) continue;

      // Manual skip check
      if (manualSkipIds.has(task.id)) {
        const entry = manualSkips.find((s) => s.itemId === task.id);
        skipped.push({ id: task.id, boardId: task.boardId, boardName: task.boardName, taskName: task.taskName, mondayUrl: task.mondayUrl, department: task.department, status: task.status, createdAt: task.createdAt, skipReason: entry?.reason ?? "Manually skipped" });
        continue;
      }

      // Rule-based skip check
      const matchedRule = findMatchingRule(item, skipRules, board);
      if (matchedRule) {
        skipped.push({ id: task.id, boardId: task.boardId, boardName: task.boardName, taskName: task.taskName, mondayUrl: task.mondayUrl, department: task.department, status: task.status, createdAt: task.createdAt, skipReason: `Rule: ${matchedRule.name}` });
        continue;
      }

      // Ambiguous (no department rule)
      if (board.isAmbiguous(task.department)) {
        ambiguous.push({ id: task.id, boardId: task.boardId, boardName: task.boardName, taskName: task.taskName, mondayUrl: task.mondayUrl, department: task.department, status: task.status, isApproved: task.isApproved, isNew: task.isNew, createdAt: task.createdAt, columnValues: { product: task.product, platform: task.platform, category: board.getCategory(task.product), media_type: board.mediaType, date: getDateFolder() } });
        continue;
      }

      // Ready — build preview path
      let preview = "";
      try { preview = board.buildPath(item, dropboxRoot); } catch { /* ignore */ }
      ready.push({ id: task.id, boardId: task.boardId, boardName: task.boardName, taskName: task.taskName, mondayUrl: task.mondayUrl, previewPath: preview, status: task.status, isApproved: task.isApproved, isNew: task.isNew, createdAt: task.createdAt });
    }
  }

  return { ready, ambiguous, skipped, approvedWithFolder, groupWarnings };
}
