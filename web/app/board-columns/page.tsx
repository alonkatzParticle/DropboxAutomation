"use client";

/**
 * board-columns/page.tsx — Per-Board Configuration editor.
 *
 * Shows an expandable card for each Monday.com board. Clicking a board
 * expands it to reveal BoardPanel, which manages:
 *   - Column mappings (segment → Monday column ID)
 *   - Bundle and Other keywords (per-board)
 *   - Computed segments (info only)
 *
 * All settings are saved into the board's own block in config.json via POST /api/config.
 *
 * Depends on: /api/config (GET + POST), /api/monday-columns (GET),
 *             web/components/BoardPanel.tsx
 */

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Settings2, ChevronDown } from "lucide-react";
import BoardPanel, { type BoardConfig, type MondayColumn } from "@/components/BoardPanel";

type BoardsMap = Record<string, BoardConfig>;
type ColumnMap = Record<string, MondayColumn[]>;

export default function BoardColumnsPage() {
  const [boards, setBoards] = useState<BoardsMap>({});
  const [availableCols, setAvailableCols] = useState<ColumnMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saveResults, setSaveResults] = useState<Record<string, "success" | "error" | null>>({});
  const [expandedBoard, setExpandedBoard] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const cfgRes = await fetch("/api/config");
      const cfg = await cfgRes.json();

      const raw: Record<string, Record<string, unknown>> = cfg.boards ?? {};
      const mapped: BoardsMap = {};
      for (const [id, b] of Object.entries(raw)) {
        mapped[id] = {
          name:                b.name                as string ?? id,
          media_type:          b.media_type          as string ?? "",
          dropbox_link_column: b.dropbox_link_column as string ?? "",
          status_column:       b.status_column       as string ?? "",
          completed_labels:    (b.completed_labels   as string[]) ?? [],
          columns:             (b.columns            as Record<string, string>) ?? {},
          bundle_keywords:     (b.bundle_keywords    as string[]) ?? [],
          other_keywords:      (b.other_keywords     as string[]) ?? [],
          fallback_values:     (b.fallback_values    as Record<string, string>) ?? {},
        };
      }
      setBoards(mapped);

      const boardIds = Object.keys(mapped).join(",");
      if (boardIds) {
        try {
          const colRes = await fetch(`/api/monday-columns?boardIds=${boardIds}`);
          if (colRes.ok) setAvailableCols(await colRes.json());
        } catch { /* BoardPanel handles missing columns gracefully */ }
      }

      setIsLoading(false);
    }
    load();
  }, []);

  // Save a single board — shallow-merges into existing config so _comment keys are preserved
  async function saveBoard(boardId: string, updated: BoardConfig) {
    setSaveResults((prev) => ({ ...prev, [boardId]: null }));
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boards: { [boardId]: updated } }),
      });
      if (!res.ok) throw new Error("API error");

      // Update local state so the panel reflects saved values immediately
      setBoards((prev) => ({ ...prev, [boardId]: updated }));
      setSaveResults((prev) => ({ ...prev, [boardId]: "success" }));
      setTimeout(() => setSaveResults((prev) => ({ ...prev, [boardId]: null })), 3000);
    } catch {
      setSaveResults((prev) => ({ ...prev, [boardId]: "error" }));
      setTimeout(() => setSaveResults((prev) => ({ ...prev, [boardId]: null })), 3000);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const boardEntries = Object.entries(boards);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Board Configuration</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure column mappings and product keywords for each Monday.com board independently.
          All settings are saved per-board so each dashboard can have its own rules.
        </p>
      </div>

      {/* Board list */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Settings2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Per-Board Settings</h2>
            <p className="text-xs text-muted-foreground">
              Click a board to expand and edit its column mappings and keywords.
            </p>
          </div>
        </div>

        {boardEntries.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">No boards found in config.json.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {boardEntries.map(([boardId, board]) => {
              const isExpanded = expandedBoard === boardId;
              return (
                <Card
                  key={boardId}
                  className={`border-l-4 border-l-green-600 overflow-hidden transition-shadow ${
                    isExpanded ? "shadow-md ring-1 ring-primary/20" : ""
                  }`}
                >
                  {/* Collapsed header */}
                  <button
                    onClick={() => setExpandedBoard(isExpanded ? null : boardId)}
                    className="w-full p-4 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-left flex items-center gap-2 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{board.name}</h3>
                      <Badge variant="outline" className="text-xs shrink-0">{board.media_type}</Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {saveResults[boardId] === "success" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      {saveResults[boardId] === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t bg-muted/10 p-6">
                      <BoardPanel
                        boardId={boardId}
                        board={board}
                        availableColumns={availableCols[boardId] ?? []}
                        onSave={saveBoard}
                      />
                      {saveResults[boardId] === "success" && (
                        <p className="flex items-center gap-1.5 text-xs text-green-600 font-medium mt-4 pt-4 border-t">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Saved to config.json
                        </p>
                      )}
                      {saveResults[boardId] === "error" && (
                        <p className="flex items-center gap-1.5 text-xs text-destructive font-medium mt-4 pt-4 border-t">
                          <XCircle className="h-3.5 w-3.5" /> Save failed
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
