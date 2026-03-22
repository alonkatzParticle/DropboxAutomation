"use client";

/**
 * FolderMoverCascade.tsx — Cascading folder-picker for the Folder Mover page.
 *
 * Shows a series of dropdowns, one per depth level. Selecting a folder loads
 * the next level's subfolders automatically. Choosing "+ New folder" shows a
 * text input and stops the cascade at that depth.
 *
 * The parent folder path is passed to onConfirm(). The caller appends the
 * folder name being moved to build the complete destination path.
 *
 * Depends on: /api/list-dropbox-folders
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Represents one level in the cascade
interface CascadeLevel {
  subfolders: string[];   // Options to show in the dropdown
  loading: boolean;       // True while fetching subfolders
  selected: string;       // Selected value ("" = none, "__new__" = create new)
  newName: string;        // Text value when selected === "__new__"
}

interface FolderMoverCascadeProps {
  dropboxRoot: string;           // Starting path (e.g. "/Creative 2026")
  currentFolderName: string;     // The folder being moved — shown as the final segment
  onConfirm: (parentPath: string) => void;  // Called with the chosen parent path
  onCancel: () => void;
  confirmLabel?: string;         // Button label (default: "Move Here")
}

export default function FolderMoverCascade({
  dropboxRoot, currentFolderName, onConfirm, onCancel, confirmLabel = "Move Here"
}: FolderMoverCascadeProps) {
  const [levels, setLevels] = useState<CascadeLevel[]>([]);

  // Fetch the root level on mount
  useEffect(() => {
    fetchLevel(dropboxRoot, 0, []);
  }, [dropboxRoot]);

  // Fetch subfolders for a given path and set them as the new level at index
  async function fetchLevel(path: string, index: number, existingLevels: CascadeLevel[]) {
    // Add a loading placeholder for this level
    const placeholder: CascadeLevel = { subfolders: [], loading: true, selected: "", newName: "" };
    const truncated = existingLevels.slice(0, index);
    setLevels([...truncated, placeholder]);

    const res = await fetch(`/api/list-dropbox-folders?path=${encodeURIComponent(path)}`);
    const data = await res.json();

    const loaded: CascadeLevel = {
      subfolders: (data.folders ?? []).sort(),
      loading: false,
      selected: "",
      newName: "",
    };
    setLevels([...truncated, loaded]);
  }

  // Called when the user changes a dropdown at a given level index
  function handleSelect(index: number, value: string) {
    const updated = levels.map((lvl, i) =>
      i === index ? { ...lvl, selected: value, newName: "" } : lvl
    );

    if (value === "__new__") {
      // Stop the cascade — the user will type a new folder name
      setLevels(updated.slice(0, index + 1));
    } else if (value) {
      // Build the path up to and including this selection, then fetch the next level
      const pathToHere = buildPathAtIndex(updated, index);
      fetchLevel(pathToHere, index + 1, updated);
    } else {
      // Cleared the selection — remove all deeper levels
      setLevels(updated.slice(0, index + 1));
    }
  }

  // Build the selected path up to (and including) the given level index
  function buildPathAtIndex(lvls: CascadeLevel[], upToIndex: number): string {
    let p = dropboxRoot;
    for (let i = 0; i <= upToIndex; i++) {
      const sel = lvls[i]?.selected;
      if (!sel || sel === "__new__") break;
      p += "/" + sel;
    }
    return p;
  }

  // Build the current parent path from all completed levels
  function buildCurrentParentPath(): string {
    let p = dropboxRoot;
    for (const lvl of levels) {
      if (!lvl.selected || lvl.selected === "__new__") {
        if (lvl.selected === "__new__" && lvl.newName.trim()) {
          p += "/" + lvl.newName.trim();
        }
        break;
      }
      p += "/" + lvl.selected;
    }
    return p;
  }

  // True when the user has made at least one selection (so Move Here is enabled)
  const hasSelection = levels.some(
    (l) => (l.selected && l.selected !== "__new__") || (l.selected === "__new__" && l.newName.trim())
  );

  const previewPath = buildCurrentParentPath() + (currentFolderName ? "/" + currentFolderName : "");

  return (
    <div className="space-y-3">
      {/* One dropdown per level */}
      {levels.map((lvl, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
          {lvl.loading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading folders…
            </div>
          ) : lvl.selected === "__new__" ? (
            <input
              autoFocus
              type="text"
              placeholder="New folder name…"
              value={lvl.newName}
              onChange={(e) => setLevels(levels.map((l, i) => i === idx ? { ...l, newName: e.target.value } : l))}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          ) : (
            <select
              value={lvl.selected}
              onChange={(e) => handleSelect(idx, e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">— Select a folder —</option>
              {lvl.subfolders.map((f) => <option key={f} value={f}>{f}</option>)}
              <option value="__new__">+ Create new folder here</option>
            </select>
          )}
        </div>
      ))}

      {/* Path preview */}
      {hasSelection && (
        <p className="text-xs text-muted-foreground break-words font-mono bg-muted/40 rounded px-3 py-2">
          {previewPath}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => onConfirm(buildCurrentParentPath())} disabled={!hasSelection}>
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
