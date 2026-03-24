/**
 * lib/task.ts — Task object representing a single Monday.com item
 *
 * Wraps the raw item dict from the Monday API and computes all derived
 * properties (task name, department, status, UI state flags) in one place.
 *
 * Depends on: lib/monday-client.ts, lib/board.ts
 * Used by: lib/core.ts, lib/auto-creator.ts
 */

import { getColumnValue, MondayItem } from "./monday-client";
import { Board } from "./board";

export class Task {
  id: string;
  createdAt: string;
  groupTitle: string;    // lowercased group name
  taskName: string;      // trimmed name (after last " | " if present)
  department: string;
  product: string;
  platform: string;
  status: string;        // lowercased
  dropboxLink: string;

  boardId: string;
  boardName: string;
  subdomain: string;
  board: Board;

  // Keep the raw item for callers that need it (e.g. buildPath)
  private _item: MondayItem;

  constructor(item: MondayItem, board: Board, subdomain = "") {
    this._item = item;
    this.board = board;
    this.boardId = board.boardId;
    this.boardName = board.name;
    this.subdomain = subdomain;

    this.id = item.id;
    this.createdAt = item.created_at ?? "";
    this.groupTitle = (item.group?.title ?? "").toLowerCase();

    // Use the segment after the last " | " if present in the task name
    let rawName = item.name ?? "Untitled Task";
    if (rawName.includes(" | ")) rawName = rawName.split(" | ").pop()!;
    this.taskName = rawName.trim();

    // Column values — read using board's column ID mappings
    this.department = getColumnValue(item, board.columns.department ?? "") || (board.fallback.department ?? "");
    this.product    = getColumnValue(item, board.columns.product ?? "")    || (board.fallback.product ?? "");
    this.platform   = getColumnValue(item, board.columns.platform ?? "")   || (board.fallback.platform ?? "");
    this.status     = getColumnValue(item, board.statusColumn).toLowerCase();
    this.dropboxLink = getColumnValue(item, board.dropboxLinkColumn);
  }

  /** True if this task already has a Dropbox link on Monday.com */
  get hasFolder(): boolean { return Boolean(this.dropboxLink); }

  /** True if this task is in the board's configured Form Requests group */
  get isNew(): boolean { return this.groupTitle === this.board.formRequestsGroup; }

  /** True if this task's status matches the board's approved label */
  get isApproved(): boolean { return this.status === this.board.approvedLabel; }

  /** True if this task's status is one of the board's completed labels */
  get isCompleted(): boolean { return this.board.completedLabels.includes(this.status); }

  /** Full Monday.com URL to this task */
  get mondayUrl(): string {
    return `https://${this.subdomain}.monday.com/boards/${this.boardId}/pulses/${this.id}`;
  }

  /** Return the original raw item dict (needed by Board.buildPath) */
  rawItem(): MondayItem { return this._item; }
}
