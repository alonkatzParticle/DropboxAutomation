"use client";

/**
 * PathBuilderLevel.tsx — One row in the PathBuilder.
 *
 * Left side: tag selector — pre-made segment, new tag (linked to a Monday column),
 * or custom (free text label + free text value).
 * Right side: value area — changes based on tag type.
 *
 * Depends on: PathBuilder.tsx (parent)
 */

import { Loader2, ChevronUp, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AmbiguousTask } from "@/components/AmbiguousTaskCard";

/** Built-in segment names and their human-readable labels */
export const PREMADE_TAGS = [
  { name: "dept_folder", label: "Dept Folder" },
  { name: "category",   label: "Category"    },
  { name: "product",    label: "Product"      },
  { name: "media_type", label: "Media Type"   },
  { name: "platform",   label: "Platform"     },
  { name: "date",       label: "Date"         },
  { name: "task_name",  label: "Task Name"    },
];

/** State for a single path level */
export interface Level {
  uid: string;
  tagType: "premade" | "new" | "custom" | null;
  tagName: string;         // premade: segment name; new: user-typed; custom: label
  selection: string;       // chosen option, or "__custom__"
  customText: string;      // typed value when selection === "__custom__"
  nameConfirmed: boolean;  // new tag: has the user confirmed the tag name?
  columnId: string;        // new tag: selected Monday column ID
  columnValues: string[];  // new tag: option values from that column
  loadingCols: boolean;    // new tag: fetching column values
}

/** Extract the final path-segment string from a level */
export function levelValue(l: Level): string {
  if (l.tagType === "custom") return l.selection.trim();
  return l.selection === "__custom__" ? l.customText.trim() : l.selection;
}

/** Pre-fill the value for a pre-made segment using the task's column data */
function getSuggestion(tagName: string, task: AmbiguousTask): string {
  if (tagName === "task_name") return task.taskName;
  return (task.columnValues as Record<string, string>)[tagName] ?? "";
}

interface Props {
  level: Level;
  isFirst: boolean;
  isLast: boolean;
  task: AmbiguousTask;
  deptFolders: string[];
  boardColumns: { id: string; title: string }[];
  onChange(uid: string, patch: Partial<Level>): void;
  onFetchCols(uid: string, columnId: string): void;
  onRemove(uid: string): void;
  onMoveUp(uid: string): void;
  onMoveDown(uid: string): void;
}

export default function PathBuilderLevel({
  level, isFirst, isLast, task, deptFolders, boardColumns,
  onChange, onFetchCols, onRemove, onMoveUp, onMoveDown,
}: Props) {
  const { uid, tagType, tagName, selection, customText, columnId, columnValues, loadingCols, nameConfirmed } = level;

  // Dropdown options for pre-made and new-tag value selectors
  const opts = tagType === "premade"
    ? (tagName === "dept_folder" ? deptFolders : [getSuggestion(tagName, task)].filter(Boolean))
    : columnValues;

  /** Value area on the right — varies by tag type and setup step */
  function ValueArea() {
    if (!tagType) return <span className="text-xs text-muted-foreground py-1">← select a tag</span>;
    if (tagType === "custom") return (
      <input type="text" value={selection} placeholder="Type value…"
        onChange={e => onChange(uid, { selection: e.target.value })}
        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm" />
    );
    if (tagType === "new" && !nameConfirmed) return (
      <div className="flex flex-1 gap-1.5">
        <input type="text" value={tagName} placeholder="Tag name (e.g. campaign)" autoFocus
          onChange={e => onChange(uid, { tagName: e.target.value })}
          onKeyDown={e => e.key === "Enter" && tagName.trim() && onChange(uid, { nameConfirmed: true })}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm" />
        <Button size="sm" variant="outline" disabled={!tagName.trim()}
          onClick={() => onChange(uid, { nameConfirmed: true })}>Next</Button>
      </div>
    );
    if (tagType === "new" && !columnId) return (
      <select value="" onChange={e => { onFetchCols(uid, e.target.value); onChange(uid, { columnId: e.target.value }); }}
        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm">
        <option value="" disabled>— Which Monday column? —</option>
        {boardColumns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    );
    if (loadingCols) return <div className="flex items-center gap-1 text-xs text-muted-foreground py-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</div>;

    // Column selector — always visible for "new" tags so user can switch columns
    const colSelector = tagType === "new" && (
      <select value={columnId}
        onChange={e => { onFetchCols(uid, e.target.value); onChange(uid, { columnId: e.target.value, selection: "", customText: "" }); }}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground shrink-0">
        {boardColumns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    );

    if (opts.length === 0) return (
      <div className="flex flex-1 gap-1.5">
        {colSelector}
        <input type="text" value={customText} placeholder="Type value…"
          onChange={e => onChange(uid, { customText: e.target.value, selection: "__custom__" })}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm" />
      </div>
    );
    return (
      <div className="flex flex-1 gap-1.5 flex-wrap">
        {colSelector}
        <select value={selection} onChange={e => onChange(uid, { selection: e.target.value, customText: "" })}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm">
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__custom__">Custom…</option>
        </select>
        {selection === "__custom__" && (
          <input type="text" value={customText} placeholder="Type value…" autoFocus
            onChange={e => onChange(uid, { customText: e.target.value })}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm" />
        )}
      </div>
    );
  }

  /** Handle tag type selection from the dropdown on the left */
  function handleTagSelect(v: string) {
    if (v === "__new__")
      onChange(uid, { tagType: "new", tagName: "", selection: "", customText: "", nameConfirmed: false, columnId: "", columnValues: [] });
    else if (v === "__custom__")
      onChange(uid, { tagType: "custom", tagName: "custom", selection: "", customText: "" });
    else {
      const sug = getSuggestion(v, task);
      const init = v === "dept_folder" ? (deptFolders[0] ?? "__custom__") : (sug || "__custom__");
      onChange(uid, { tagType: "premade", tagName: v, selection: init, customText: "" });
    }
  }

  const chipLabel = tagType === "premade"
    ? (PREMADE_TAGS.find(t => t.name === tagName)?.label ?? tagName)
    : tagType === "new" ? (nameConfirmed ? tagName : "new tag")
    : "custom";

  return (
    <div className="flex items-center gap-2">
      {/* ↑↓ reorder */}
      <div className="flex flex-col shrink-0">
        <button onClick={() => onMoveUp(uid)} disabled={isFirst}
          className="text-muted-foreground hover:text-foreground disabled:opacity-25"><ChevronUp className="h-3 w-3" /></button>
        <button onClick={() => onMoveDown(uid)} disabled={isLast}
          className="text-muted-foreground hover:text-foreground disabled:opacity-25"><ChevronDown className="h-3 w-3" /></button>
      </div>

      {/* Left — tag chip or selector */}
      {tagType ? (
        <span className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground shrink-0 w-24 text-center truncate">
          {chipLabel}
        </span>
      ) : (
        <select value="" onChange={e => handleTagSelect(e.target.value)}
          className="w-28 shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs">
          <option value="" disabled>— Tag —</option>
          {PREMADE_TAGS.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
          <option disabled>──────────</option>
          <option value="__new__">+ New tag…</option>
          <option value="__custom__">Custom</option>
        </select>
      )}

      {/* Right — value area */}
      <div className="flex flex-1 items-center"><ValueArea /></div>

      {/* × remove */}
      <button onClick={() => onRemove(uid)}
        className="text-muted-foreground hover:text-destructive shrink-0"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}
