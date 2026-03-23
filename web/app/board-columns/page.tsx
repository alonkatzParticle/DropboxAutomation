"use client";

/**
 * board-columns/page.tsx — Per-Board Configuration editor.
 *
 * A dropdown at the top lets the user select which board to edit.
 * Selection is persisted via localStorage. BoardPanel renders the full
 * config for the selected board, including a group picker for
 * form_requests_group pulled live from Monday.com.
 *
 * Depends on: /api/config (GET + POST), /api/monday-columns (GET),
 *             /api/monday-groups (GET), web/components/BoardPanel.tsx
 */

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle } from "lucide-react";
import BoardPanel, { type BoardConfig, type MondayColumn, type MondayGroup } from "@/components/BoardPanel";

type BoardsMap = Record<string, BoardConfig>;
type ColumnMap = Record<string, MondayColumn[]>;
type GroupMap = Record<string, MondayGroup[]>;

export default function BoardColumnsPage() {
  const [boards, setBoards] = useState<BoardsMap>({});
  const [availableCols, setAvailableCols] = useState<ColumnMap>({});
  const [availableGroups, setAvailableGroups] = useState<GroupMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  // Restore board selection from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("board-columns-board");
    if (saved) setSelectedBoardId(saved);
  }, []);

  function selectBoard(id: string) {
    setSelectedBoardId(id);
    localStorage.setItem("board-columns-board", id);
  }

  useEffect(() => {
    async function load() {
      const cfgRes = await fetch("/api/config");
      const cfg = await cfgRes.json();

      const raw: Record<string, Record<string, unknown>> = cfg.boards ?? {};
      const mapped: BoardsMap = {};
      for (const [id, b] of Object.entries(raw)) {
        mapped[id] = {
          name:                 b.name                 as string ?? id,
          media_type:           b.media_type           as string ?? "",
          dropbox_link_column:  b.dropbox_link_column  as string ?? "",
          status_column:        b.status_column        as string ?? "",
          completed_labels:     (b.completed_labels    as string[]) ?? [],
          columns:              (b.columns             as Record<string, string>) ?? {},
          bundle_keywords:      (b.bundle_keywords     as string[]) ?? [],
          other_keywords:       (b.other_keywords      as string[]) ?? [],
          fallback_values:      (b.fallback_values     as Record<string, string>) ?? {},
          form_requests_group:  b.form_requests_group  as string ?? "",
        };
      }
      setBoards(mapped);

      const boardIds = Object.keys(mapped).join(",");
      if (boardIds) {
        // Fetch columns and groups in parallel
        await Promise.all([
          fetch(`/api/monday-columns?boardIds=${boardIds}`)
            .then((r) => r.ok ? r.json() : {})
            .then(setAvailableCols)
            .catch(() => {}),
          fetch(`/api/monday-groups?boardIds=${boardIds}`)
            .then((r) => r.ok ? r.json() : {})
            .then(setAvailableGroups)
            .catch(() => {}),
        ]);
      }

      setIsLoading(false);
    }
    load();
  }, []);

  async function saveBoard(boardId: string, updated: BoardConfig) {
    setSaveResult(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boards: { [boardId]: updated } }),
      });
      if (!res.ok) throw new Error("API error");
      setBoards((prev) => ({ ...prev, [boardId]: updated }));
      setSaveResult("success");
      setTimeout(() => setSaveResult(null), 3000);
    } catch {
      setSaveResult("error");
      setTimeout(() => setSaveResult(null), 3000);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const boardEntries = Object.entries(boards);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

      {/* Page header with board dropdown */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Board Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure column mappings, keywords, and group settings per board.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveResult === "success" && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          {saveResult === "error" && (
            <span className="flex items-center gap-1.5 text-xs text-destructive font-medium">
              <XCircle className="h-3.5 w-3.5" /> Save failed
            </span>
          )}
          <select
            value={selectedBoardId ?? ""}
            onChange={(e) => selectBoard(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="" disabled>Select a board…</option>
            {boardEntries.map(([id, board]) => (
              <option key={id} value={id}>{board.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty state */}
      {!selectedBoardId && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-lg font-medium">Select a board to get started</p>
          <p className="text-sm mt-1">Use the dropdown above to choose a board to configure</p>
        </div>
      )}

      {/* Board panel */}
      {selectedBoardId && boards[selectedBoardId] && (
        <BoardPanel
          boardId={selectedBoardId}
          board={boards[selectedBoardId]}
          availableColumns={availableCols[selectedBoardId] ?? []}
          availableGroups={availableGroups[selectedBoardId] ?? []}
          onSave={saveBoard}
        />
      )}

      {/* No boards configured */}
      {boardEntries.length === 0 && (
        <p className="text-sm text-muted-foreground">No boards found in config.json.</p>
      )}
    </div>
  );
}
