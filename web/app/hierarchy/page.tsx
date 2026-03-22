"use client";

/**
 * hierarchy/page.tsx — Folder Hierarchy editor page.
 *
 * Shows a board selector in the sidebar. Selecting a board loads that board's
 * own department_rules into DeptCard components so each board's folder hierarchy
 * can be edited independently.
 *
 * All saves go to: POST /api/config { boards: { [boardId]: { department_rules } } }
 *
 * Depends on: /api/config (GET + POST), web/components/DeptCard.tsx
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Save, CheckCircle2, XCircle } from "lucide-react";
import DeptCard, { type DeptRule } from "@/components/DeptCard";

interface BoardInfo {
  name: string;
  department_rules: Record<string, { dropbox_folder: string; path_template?: string[] }>;
  columns?: Record<string, string>;
}

export default function HierarchyPage() {
  const [boards, setBoards] = useState<Record<string, BoardInfo>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [deptRules, setDeptRules] = useState<DeptRule[]>([]);
  const [dropboxRoot, setDropboxRoot] = useState<string>("/Creative");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);
  const [customSegments, setCustomSegments] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        setDropboxRoot(cfg.dropbox_root ?? "/Creative");
        const bds: Record<string, BoardInfo> = cfg.boards ?? {};
        setBoards(bds);
        const boardIds = Object.keys(bds);
        if (boardIds.length > 0) applyBoard(boardIds[0], bds);
      })
      .finally(() => setIsLoading(false));
  }, []);

  function applyBoard(boardId: string, bds = boards) {
    setSelectedBoardId(boardId);
    setSaveResult(null);
    const rulesObj = bds[boardId]?.department_rules ?? {};
    const colsObj = bds[boardId]?.columns ?? {};

    const rows: DeptRule[] = Object.entries(rulesObj)
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, val]) => {
        const template = val.path_template ?? [
          "dept_folder", "category", "product", "media_type", "platform", "date", "task_name"
        ];
        return { key, dropbox_folder: val.dropbox_folder ?? key, path_template: template };
      });
    setDeptRules(rows);

    const builtIn = new Set(["dept_folder","category","product","media_type","platform","department","date","task_name"]);
    const customKeys = Object.keys(colsObj).filter((k) => !builtIn.has(k));
    setCustomSegments(customKeys);
  }

  async function saveRule(index: number, updated: DeptRule) {
    if (!selectedBoardId) return;
    const newRules = deptRules.map((r, i) => (i === index ? updated : r));
    setDeptRules(newRules);
    const department_rules: Record<string, { dropbox_folder: string; path_template: string[] }> = {};
    for (const row of newRules) {
      if (row.key.trim()) {
        department_rules[row.key.trim()] = { dropbox_folder: row.dropbox_folder, path_template: row.path_template };
      }
    }
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boards: { [selectedBoardId]: { department_rules } } }),
    });
  }

  function addDept() {
    setDeptRules((prev) => [
      ...prev,
      { key: "", dropbox_folder: "", path_template: ["dept_folder", "category", "product", "media_type", "platform", "date", "task_name"] },
    ]);
  }

  async function save() {
    if (!selectedBoardId) return;
    setIsSaving(true);
    setSaveResult(null);
    const department_rules: Record<string, { dropbox_folder: string; path_template: string[] }> = {};
    for (const row of deptRules) {
      if (row.key.trim()) {
        department_rules[row.key.trim()] = { dropbox_folder: row.dropbox_folder, path_template: row.path_template };
      }
    }
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boards: { [selectedBoardId]: { department_rules } } }),
    });
    setSaveResult(res.ok ? "success" : "error");
    setIsSaving(false);
    setTimeout(() => setSaveResult(null), 3000);
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Folder Hierarchy</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Edit each board&apos;s department rules independently. Select a board from the sidebar, then
          drag path levels to reorder or add new ones. Changes must be saved per board.
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Board selector sidebar */}
        <aside className="w-44 shrink-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Board</p>
          {Object.entries(boards).map(([id, b]) => (
            <button
              key={id}
              onClick={() => applyBoard(id)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                selectedBoardId === id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {b.name}
            </button>
          ))}
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {selectedBoardId && (
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Rules for <span className="text-primary">{boards[selectedBoardId]?.name}</span>
              </h2>
            </div>
          )}

          {deptRules.length === 0 && (
            <p className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded-md border border-dashed">
              No department rules defined for this board yet.
            </p>
          )}

          <div className="space-y-3">
            {deptRules.map((rule, i) => (
              <DeptCard
                key={i}
                rule={rule}
                dropboxRoot={dropboxRoot}
                customSegments={customSegments}
                onSave={(updated) => saveRule(i, updated)}
                onDelete={() => setDeptRules((p) => p.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addDept} className="gap-1.5 text-xs border-dashed">
            <Plus className="h-3.5 w-3.5" /> Add Department Rule
          </Button>

          {deptRules.length > 0 && (
            <div className="flex items-center gap-3 pt-4 pb-8 border-t border-border/40">
              <Button onClick={save} disabled={isSaving} className="gap-2">
                <Save className="h-4 w-4" />
                {isSaving ? "Saving…" : "Save All Rules"}
              </Button>
              {saveResult === "success" && (
                <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Saved to config.json
                </span>
              )}
              {saveResult === "error" && (
                <span className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                  <XCircle className="h-4 w-4" /> Save failed
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
