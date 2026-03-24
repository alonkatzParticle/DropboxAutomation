"use client";

/**
 * skip-rules/page.tsx — Skip Rules management page
 *
 * Shows all skip rules per board. Each rule has a name and one or more
 * conditions (e.g. video_type = "Upload B-Roll"). If ANY rule matches a task,
 * that task is excluded from the Auto-Creator and shown in Skipped Tasks.
 *
 * Users can:
 *   - Add new rules (with one or more conditions each)
 *   - Delete existing rules
 *   - See which column each condition references
 *
 * Rules are saved to config.json under each board's "skip_rules" array.
 *
 * Depends on: /api/config (GET + POST), /api/monday-columns (GET)
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Save, ShieldOff, ChevronDown, ChevronRight } from "lucide-react";

interface SkipCondition {
  column: string; // semantic column key, e.g. "video_type", "department"
  value: string;  // exact value to match (case-insensitive)
}

interface SkipRule {
  name: string;
  conditions: SkipCondition[];
}

interface BoardColumn { id: string; title: string; type: string; }

interface BoardInfo {
  boardId: string;
  boardName: string;
  columns: Record<string, string>; // semantic name → Monday column ID
  columnTitles: Record<string, string>; // column ID → human title
  skipRules: SkipRule[];
}

export default function SkipRulesPage() {
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // boardId being saved
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Local edits — keyed by boardId
  const [edits, setEdits] = useState<Record<string, SkipRule[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch config first, then fetch Monday columns using the real board IDs
      const configRes = await fetch("/api/config");
      const config = await configRes.json();
      if (config.error) throw new Error(config.error);

      const boardIds = Object.keys(config.boards ?? {});
      const colRes = await fetch(`/api/monday-columns?boardIds=${boardIds.join(",")}`);
      const colData: Record<string, BoardColumn[]> = colRes.ok ? await colRes.json() : {};

      const boardInfos: BoardInfo[] = boardIds.map((boardId) => {
        const boardCfg = config.boards[boardId];
        const mondayCols: BoardColumn[] = colData[boardId] ?? [];

        // Map Monday column ID → human-readable title
        const columnTitles: Record<string, string> = {};
        mondayCols.forEach((c) => { columnTitles[c.id] = c.title; });

        return {
          boardId,
          boardName: boardCfg.name ?? boardId,
          columns: boardCfg.columns ?? {},
          columnTitles,
          skipRules: boardCfg.skip_rules ?? [],
        };
      });

      setBoards(boardInfos);

      // Initialise local edits from loaded data
      const initialEdits: Record<string, SkipRule[]> = {};
      boardInfos.forEach((b) => { initialEdits[b.boardId] = JSON.parse(JSON.stringify(b.skipRules)); });
      setEdits(initialEdits);

      // Auto-expand boards that already have rules
      setExpanded(new Set(boardInfos.filter((b) => b.skipRules.length > 0).map((b) => b.boardId)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(boardId: string) {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(boardId) ? s.delete(boardId) : s.add(boardId);
      return s;
    });
  }

  function addRule(boardId: string) {
    setEdits((prev) => ({
      ...prev,
      [boardId]: [...(prev[boardId] ?? []), { name: "", conditions: [{ column: "", value: "" }] }],
    }));
  }

  function removeRule(boardId: string, ruleIdx: number) {
    setEdits((prev) => ({
      ...prev,
      [boardId]: prev[boardId].filter((_, i) => i !== ruleIdx),
    }));
  }

  function updateRule(boardId: string, ruleIdx: number, field: "name", value: string) {
    setEdits((prev) => {
      const rules = prev[boardId].map((r, i) => i === ruleIdx ? { ...r, [field]: value } : r);
      return { ...prev, [boardId]: rules };
    });
  }

  function addCondition(boardId: string, ruleIdx: number) {
    setEdits((prev) => {
      const rules = prev[boardId].map((r, i) =>
        i === ruleIdx ? { ...r, conditions: [...r.conditions, { column: "", value: "" }] } : r
      );
      return { ...prev, [boardId]: rules };
    });
  }

  function removeCondition(boardId: string, ruleIdx: number, condIdx: number) {
    setEdits((prev) => {
      const rules = prev[boardId].map((r, i) =>
        i === ruleIdx ? { ...r, conditions: r.conditions.filter((_, ci) => ci !== condIdx) } : r
      );
      return { ...prev, [boardId]: rules };
    });
  }

  function updateCondition(boardId: string, ruleIdx: number, condIdx: number, field: keyof SkipCondition, value: string) {
    setEdits((prev) => {
      const rules = prev[boardId].map((r, i) =>
        i === ruleIdx
          ? { ...r, conditions: r.conditions.map((c, ci) => ci === condIdx ? { ...c, [field]: value } : c) }
          : r
      );
      return { ...prev, [boardId]: rules };
    });
  }

  async function save(boardId: string) {
    setSaving(boardId);
    try {
      const rules = edits[boardId] ?? [];
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boards: { [boardId]: { skip_rules: rules } } }),
      });
      await load(); // reload to confirm saved
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ShieldOff className="h-5 w-5 text-muted-foreground" />
          Skip Rules
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tasks matching any rule are excluded from Auto-Creator and shown in Skipped Tasks instead.
          All conditions in a rule must match (AND). Any rule matching is enough to skip (OR between rules).
        </p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {!loading && boards.map((board) => {
        const isExpanded = expanded.has(board.boardId);
        const rules = edits[board.boardId] ?? [];
        const isDirty = JSON.stringify(rules) !== JSON.stringify(board.skipRules);

        return (
          <div key={board.boardId} className="rounded-lg border">
            {/* Board header — click to expand/collapse */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => toggleExpand(board.boardId)}
            >
              <span className="font-medium text-sm flex items-center gap-2">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {board.boardName}
                {rules.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{rules.length} rule{rules.length !== 1 ? "s" : ""}</Badge>
                )}
                {isDirty && <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Unsaved</Badge>}
              </span>
            </button>

            {isExpanded && (
              <div className="border-t px-4 py-4 space-y-4">
                {rules.length === 0 && (
                  <p className="text-sm text-muted-foreground">No skip rules for this board yet.</p>
                )}

                {rules.map((rule, rIdx) => (
                  <div key={rIdx} className="rounded-md border bg-muted/20 p-3 space-y-3">
                    {/* Rule name */}
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 text-sm border rounded px-2 py-1 bg-background"
                        placeholder="Rule name (e.g. Upload B-Roll)"
                        value={rule.name}
                        onChange={(e) => updateRule(board.boardId, rIdx, "name", e.target.value)}
                      />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeRule(board.boardId, rIdx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Conditions */}
                    <div className="space-y-2 pl-2 border-l-2 border-muted">
                      <p className="text-xs text-muted-foreground font-medium">CONDITIONS (all must match)</p>
                      {rule.conditions.map((cond, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-2">
                          {/* Column selector — semantic keys from board.columns */}
                          <select
                            className="text-sm border rounded px-2 py-1 bg-background"
                            value={cond.column}
                            onChange={(e) => updateCondition(board.boardId, rIdx, cIdx, "column", e.target.value)}
                          >
                            <option value="">Select column…</option>
                            {Object.entries(board.columns).map(([key, colId]) => (
                              <option key={key} value={key}>
                                {board.columnTitles[colId] ?? key} ({key})
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-muted-foreground">=</span>
                          <input
                            className="flex-1 text-sm border rounded px-2 py-1 bg-background"
                            placeholder="Value to match"
                            value={cond.value}
                            onChange={(e) => updateCondition(board.boardId, rIdx, cIdx, "value", e.target.value)}
                          />
                          {rule.conditions.length > 1 && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => removeCondition(board.boardId, rIdx, cIdx)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => addCondition(board.boardId, rIdx)}>
                        <Plus className="h-3 w-3 mr-1" /> Add condition
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => addRule(board.boardId)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add rule
                  </Button>
                  {isDirty && (
                    <Button size="sm" onClick={() => save(board.boardId)} disabled={saving === board.boardId}>
                      {saving === board.boardId ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                      Save rules
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
