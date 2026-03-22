"use client";

/**
 * PathBuilder.tsx — Blank-slate path builder for ambiguous tasks.
 *
 * The user builds a folder path from scratch:
 *   - Click "+ Add Level" to add a row
 *   - Each row: pick a tag on the left, pick/type a value on the right
 *   - Tags: pre-made (product, platform…), new (mapped to a Monday column), or custom (free text)
 *   - Levels can be reordered (↑↓) and removed (×)
 *
 * When all tags are pre-made or Monday-column-based, "Create Folder" opens a dialog
 * offering to save this path structure as a reusable hierarchy in config.json.
 *
 * Depends on: PathBuilderLevel.tsx, /api/monday-columns, /api/monday-column-options, /api/config
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Check, FolderPlus } from "lucide-react";
import PathBuilderLevel, { Level, levelValue } from "@/components/PathBuilderLevel";
import type { AmbiguousTask } from "@/components/AmbiguousTaskCard";

interface DeptRule { dropbox_folder?: string; path_template?: string[]; }
interface Props {
  task: AmbiguousTask;
  deptRules: Record<string, DeptRule>;
  dropboxRoot: string;
  onConfirm(fullPath: string): void;
  onCancel(): void;
}

/** Generate a unique ID for each level row */
function newUid() { return Math.random().toString(36).slice(2); }

/** Assemble the full Dropbox path from the root + all level values */
function buildPath(root: string, levels: Level[]): string {
  return [root, ...levels.map(levelValue).filter(Boolean)].join("/");
}

/** True when every level is reusable — qualifies for offering to save as hierarchy */
function eligibleToSave(levels: Level[]): boolean {
  return levels.length > 0 &&
    levels.every(l => l.tagType === "premade" || (l.tagType === "new" && l.columnId));
}

export default function PathBuilder({ task, deptRules, dropboxRoot, onConfirm, onCancel }: Props) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [boardCols, setBoardCols] = useState<{ id: string; title: string }[]>([]);
  const [rootFolders, setRootFolders] = useState<string[]>([]);

  // Save-as-hierarchy dialog state
  const [showSave, setShowSave] = useState(false);
  const [hierName, setHierName] = useState("");
  const [boardValues, setBoardValues] = useState<Record<string, string>>({ [task.boardId]: task.department });
  const [allBoards, setAllBoards] = useState<Record<string, { name: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const deptFolders = Object.values(deptRules)
    .map(r => r.dropbox_folder).filter((f): f is string => Boolean(f));

  /** Fetch the list of Monday columns for this task's board (used by "new tag" column picker) */
  useEffect(() => {
    fetch(`/api/monday-columns?boardIds=${task.boardId}`)
      .then(r => r.json())
      .then(data => setBoardCols(data[task.boardId] ?? []))
      .catch(() => {});
  }, [task.boardId]);

  /** Fetch the actual top-level Dropbox folders for the dept_folder tag dropdown */
  useEffect(() => {
    fetch(`/api/list-dropbox-folders?path=${encodeURIComponent(dropboxRoot)}`)
      .then(r => r.json())
      .then(data => setRootFolders((data.folders ?? []).sort()))
      .catch(() => {});
  }, [dropboxRoot]);

  /** Fetch board names from config for the save dialog's per-board dept. mapping inputs */
  useEffect(() => {
    fetch("/api/config").then(r => r.json())
      .then(cfg => setAllBoards(cfg.boards ?? {}))
      .catch(() => {});
  }, []);

  /** Patch one level by uid */
  function updateLevel(uid: string, patch: Partial<Level>) {
    setLevels(prev => prev.map(l => l.uid === uid ? { ...l, ...patch } : l));
  }

  /** Fetch values for a Monday column and store them on the level */
  async function fetchColValues(uid: string, columnId: string) {
    updateLevel(uid, { loadingCols: true });
    try {
      const res = await fetch(`/api/monday-column-options?boardIds=${task.boardId}&columnIds=${columnId}`);
      const data = await res.json();
      const vals: string[] = data[task.boardId]?.[columnId] ?? [];
      updateLevel(uid, { columnValues: vals, loadingCols: false, selection: vals[0] ?? "__custom__" });
    } catch {
      updateLevel(uid, { loadingCols: false });
    }
  }

  function addLevel() {
    setLevels(prev => [...prev, {
      uid: newUid(), tagType: null, tagName: "", selection: "", customText: "",
      nameConfirmed: false, columnId: "", columnValues: [], loadingCols: false,
    }]);
  }

  function removeLevel(uid: string) { setLevels(prev => prev.filter(l => l.uid !== uid)); }

  function moveUp(uid: string) {
    setLevels(prev => {
      const i = prev.findIndex(l => l.uid === uid);
      if (i <= 0) return prev;
      const next = [...prev]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next;
    });
  }

  function moveDown(uid: string) {
    setLevels(prev => {
      const i = prev.findIndex(l => l.uid === uid);
      if (i >= prev.length - 1) return prev;
      const next = [...prev]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; return next;
    });
  }

  /** Create folder — offer hierarchy save first if all tags are reusable */
  function handleCreate() {
    if (eligibleToSave(levels)) { setShowSave(true); return; }
    onConfirm(buildPath(dropboxRoot, levels));
  }

  /** Save this path structure as a new hierarchy in config.json for this board, then create the folder */
  async function saveAndCreate(alsoCreate: boolean) {
    if (!hierName.trim()) return;
    setSaving(true); setSaveError("");
    const path_template = levels.map(l => l.tagName).filter(Boolean);
    const newRule = { dropbox_folder: hierName.trim(), path_template, board_values: boardValues };
    try {
      // Fetch current board's department_rules to merge into
      const cfgRes = await fetch("/api/config");
      const cfg = await cfgRes.json();
      const existingBoardRules = cfg.boards?.[task.boardId]?.department_rules ?? {};
      const updatedRules = { ...existingBoardRules, [hierName.trim()]: newRule };
      
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boards: {
            [task.boardId]: { department_rules: updatedRules },
          },
        }),
      });
      if (!res.ok) throw new Error("Config save failed");
      if (alsoCreate) onConfirm(buildPath(dropboxRoot, levels));
      else setShowSave(false);
    } catch (e) {
      setSaveError(String(e));
    }
    setSaving(false);
  }

  const path = buildPath(dropboxRoot, levels);
  const hasValues = levels.length > 0 && levels.every(l => levelValue(l));

  // ── Save-as-hierarchy dialog ──
  if (showSave) return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
      <p className="text-sm font-medium">Save as a new hierarchy?</p>
      <p className="text-xs text-muted-foreground">
        Saving lets this folder structure be reused automatically for future tasks.
      </p>
      <div className="space-y-1">
        <label className="text-xs font-medium">Hierarchy name</label>
        <input type="text" value={hierName} placeholder="e.g. Amazon Ads" autoFocus
          onChange={e => setHierName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Which Monday.com department value routes here? (per board)</p>
        {Object.entries(allBoards).map(([boardId, board]) => (
          <div key={boardId} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-36 shrink-0 truncate">{board.name}</span>
            <input type="text" value={boardValues[boardId] ?? ""}
              placeholder="dept. value — leave blank if not used"
              onChange={e => setBoardValues(prev => ({ ...prev, [boardId]: e.target.value }))}
              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs" />
          </div>
        ))}
      </div>
      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" disabled={!hierName.trim() || saving} onClick={() => saveAndCreate(true)}>
          <Check className="h-3.5 w-3.5 mr-1.5" />Save &amp; Create Folder
        </Button>
        <Button size="sm" variant="outline" disabled={saving}
          onClick={() => onConfirm(buildPath(dropboxRoot, levels))}>
          Just Create Folder
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowSave(false)}>Back</Button>
      </div>
    </div>
  );

  // ── Main builder ──
  return (
    <div className="space-y-2">
      {levels.map((lvl, i) => (
        <PathBuilderLevel key={lvl.uid} level={lvl}
          isFirst={i === 0} isLast={i === levels.length - 1}
          task={task} deptFolders={rootFolders} boardColumns={boardCols}
          onChange={updateLevel} onFetchCols={fetchColValues}
          onRemove={removeLevel} onMoveUp={moveUp} onMoveDown={moveDown} />
      ))}

      <Button size="sm" variant="outline" className="w-full border-dashed text-muted-foreground"
        onClick={addLevel}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />Add Level
      </Button>

      {/* Live path preview */}
      {levels.length > 0 && (
        <p className="text-xs font-mono text-muted-foreground break-words bg-muted/40 rounded px-3 py-2">
          {path}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={!hasValues} onClick={handleCreate}>
          <FolderPlus className="h-3.5 w-3.5 mr-1.5" />Create Folder
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
