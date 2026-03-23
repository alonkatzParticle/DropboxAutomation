"use client";

/**
 * BoardPanel.tsx — Editable panel for one Monday.com board's column mappings,
 * keywords, and fallback settings.
 *
 * Per-board settings now include:
 *   - Column Mappings: segment name → Monday column ID
 *   - Bundle Keywords: products containing these words go under Bundles/
 *   - Other Keywords: exact product names that go under Other/
 *   - Computed Segments: auto-resolved path levels (info only)
 *
 * Depends on: shadcn Button, Badge components; lucide-react icons
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, X, Plus, Info, Pencil, Check, Trash2, ArrowRight, Cloud, Tag } from "lucide-react";

export interface BoardConfig {
  name: string;
  media_type: string;
  dropbox_link_column: string;
  status_column: string;
  completed_labels: string[];
  columns: Record<string, string>;
  bundle_keywords?: string[];
  other_keywords?: string[];
  fallback_values?: Record<string, string>;
  form_requests_group?: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export interface MondayGroup {
  id: string;
  title: string;
}

interface BoardPanelProps {
  boardId: string;
  board: BoardConfig;
  availableColumns: MondayColumn[];
  availableGroups?: MondayGroup[];
  onSave: (boardId: string, updated: BoardConfig) => void;
}

// Path levels that are auto-computed, not read from a Monday column
const INFO_ROWS = [
  { label: "Dept. Folder", desc: "From the department rule's 'Dropbox folder' field" },
  { label: "Category",     desc: "Computed: Products / Bundles / Other based on product name" },
  { label: "Date",         desc: "Computed from the current date (e.g. 03_March 2026)" },
  { label: "Task Name",    desc: "The Monday.com task's own name field" },
];

function ColumnPicker({ value, availableColumns, onChange }: {
  value: string;
  availableColumns: MondayColumn[];
  onChange: (id: string) => void;
}) {
  if (availableColumns.length === 0) {
    return (
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="column ID"
        className="h-7 w-full rounded-md border border-border/60 bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
    );
  }
  return (
    <div className="flex-1 space-y-1">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
        {!availableColumns.find((c) => c.id === value) && value && (
          <option value={value}>{value} (unknown)</option>
        )}
        {availableColumns.map((col) => (
          <option key={col.id} value={col.id}>{col.title}</option>
        ))}
      </select>
      <p className="text-[10px] font-mono text-muted-foreground px-0.5">ID: {value || "—"}</p>
    </div>
  );
}

function colTitle(id: string, cols: MondayColumn[]) {
  return cols.find((c) => c.id === id)?.title ?? id;
}

export default function BoardPanel({ boardId, board, availableColumns, availableGroups = [], onSave }: BoardPanelProps) {
  const [draft, setDraft] = useState<BoardConfig>(board);
  const [editingCols, setEditingCols] = useState(false);
  const [colsSnapshot, setColsSnapshot] = useState<Record<string, string>>(board.columns);
  const [newKey, setNewKey] = useState("");
  const [newColId, setNewColId] = useState("");
  const [newBundle, setNewBundle] = useState("");
  const [newOther, setNewOther] = useState("");

  useEffect(() => { setDraft(board); }, [JSON.stringify(board)]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(board);

  function setColumn(key: string, value: string) {
    setDraft((d) => ({ ...d, columns: { ...d.columns, [key]: value } }));
  }

  function removeColumn(key: string) {
    setDraft((d) => {
      const cols = { ...d.columns };
      delete cols[key];
      return { ...d, columns: cols };
    });
  }

  function addColumn() {
    const key = newKey.trim();
    if (!key || !newColId) return;
    setDraft((d) => ({ ...d, columns: { ...d.columns, [key]: newColId } }));
    setNewKey("");
    setNewColId(availableColumns[0]?.id ?? "");
  }

  function startEditCols() {
    setColsSnapshot({ ...draft.columns });
    setNewKey("");
    setNewColId(availableColumns[0]?.id ?? "");
    setEditingCols(true);
  }

  function confirmEditCols() {
    setEditingCols(false);
  }

  function cancelEditCols() {
    setDraft((d) => ({ ...d, columns: colsSnapshot }));
    setEditingCols(false);
  }

  function addKeyword(list: "bundle" | "other") {
    if (list === "bundle" && newBundle.trim()) {
      setDraft((d) => ({ ...d, bundle_keywords: [...(d.bundle_keywords ?? []), newBundle.trim()] }));
      setNewBundle("");
    } else if (list === "other" && newOther.trim()) {
      setDraft((d) => ({ ...d, other_keywords: [...(d.other_keywords ?? []), newOther.trim()] }));
      setNewOther("");
    }
  }

  function removeKeyword(list: "bundle" | "other", kw: string) {
    if (list === "bundle") {
      setDraft((d) => ({ ...d, bundle_keywords: (d.bundle_keywords ?? []).filter((k) => k !== kw) }));
    } else {
      setDraft((d) => ({ ...d, other_keywords: (d.other_keywords ?? []).filter((k) => k !== kw) }));
    }
  }

  return (
    <div className="border border-border/60 rounded-xl p-5 space-y-6 bg-card flex-1 min-w-0">

      {/* Board Settings — Dropbox link column + Form Requests group */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Board Settings</p>
        <div className="flex items-center gap-3">
          <Cloud className="h-5 w-5 text-blue-600 shrink-0" />
          <div className="flex items-center gap-2">
            <div>
              <label className="text-xs font-semibold text-blue-600 block">Dropbox Link Column</label>
              <span className="text-xs text-muted-foreground">Monday Column Value:</span>
            </div>
            <div>
              <span className="font-semibold text-foreground text-sm block">{colTitle(draft.dropbox_link_column, availableColumns)}</span>
              {availableColumns.length > 0 && (
                <span className="font-mono text-xs text-muted-foreground">({draft.dropbox_link_column})</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 shrink-0" />
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <label className="text-xs font-semibold text-blue-600 block">Form Requests Group</label>
              <span className="text-xs text-muted-foreground">New tasks are sourced from this group</span>
            </div>
            {availableGroups.length > 0 ? (
              <select
                value={draft.form_requests_group ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, form_requests_group: e.target.value }))}
                className="h-8 rounded-md border border-border/60 bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="" disabled>Select a group…</option>
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.title}>{g.title}</option>
                ))}
              </select>
            ) : (
              <input
                value={draft.form_requests_group ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, form_requests_group: e.target.value }))}
                placeholder="e.g., Form Requests"
                className="h-8 rounded-md border border-border/60 bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>
        </div>
      </div>

      {/* Column Mappings */}
      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/40">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold uppercase tracking-widest text-foreground">Column Mappings</p>
          {!editingCols && (
            <button onClick={startEditCols} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>

        {editingCols ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-muted-foreground mb-2 px-2">
              <div>Monday Column</div><div /><div>Path Segment</div>
            </div>
            <div className="space-y-2">
              {Object.entries(draft.columns).map(([key, colId]) => (
                <div key={key} className="grid grid-cols-3 gap-3 items-center p-2 bg-card rounded border border-border/30">
                  <ColumnPicker value={colId} availableColumns={availableColumns} onChange={(id) => setColumn(key, id)} />
                  <div className="flex justify-center">
                    <button onClick={() => removeColumn(key)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-foreground font-medium capitalize">{key}</span>
                </div>
              ))}
              {/* Add new mapping */}
              <div className="grid grid-cols-3 gap-3 items-center p-2 bg-card rounded border border-border/30 border-dashed">
                <select value={newColId} onChange={(e) => setNewColId(e.target.value)}
                  className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                  {!availableColumns.find((c) => c.id === newColId) && newColId && (
                    <option value={newColId}>{newColId} (unknown)</option>
                  )}
                  {availableColumns.map((col) => (
                    <option key={col.id} value={col.id}>{col.title}</option>
                  ))}
                </select>
                <input value={newKey} onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addColumn()}
                  placeholder="New segment…"
                  className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                <button onClick={addColumn} disabled={!newKey.trim() || !newColId}
                  className="h-8 px-3 bg-foreground text-background rounded-md text-xs font-medium hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Plus className="h-3 w-3 inline mr-1" /> Add
                </button>
              </div>
            </div>
            <div className="flex gap-2 pt-3 border-t border-border/40">
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={confirmEditCols}>
                <Check className="h-3 w-3" /> Confirm
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={cancelEditCols}>
                <X className="h-3 w-3" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-muted-foreground mb-2 px-2">
              <div>Monday Column</div><div /><div>Path Segment</div>
            </div>
            {Object.entries(draft.columns).map(([key, colId]) => (
              <div key={key} className="grid grid-cols-3 gap-3 items-center p-2 bg-card rounded border border-border/30">
                <div className="space-y-1">
                  <span className="font-semibold text-foreground block">{colTitle(colId, availableColumns)}</span>
                  {availableColumns.length > 0 && (
                    <span className="font-mono text-xs text-muted-foreground block">({colId})</span>
                  )}
                </div>
                <div className="flex justify-center"><ArrowRight className="h-4 w-4 text-foreground" /></div>
                <span className="text-foreground font-medium capitalize">{key}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Keywords — per-board bundle and other keywords */}
      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/40">
        <div className="flex items-start gap-3">
          <Tag className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-foreground">Product Keywords</p>
            <p className="text-xs text-muted-foreground mt-0.5">Controls how products are categorized into Products / Bundles / Other folders for this board.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-1">
          {/* Bundle Keywords */}
          <div className="space-y-2 pb-4 md:pb-0 md:border-r md:pr-4">
            <h3 className="text-xs font-semibold text-foreground">Bundle Keywords</h3>
            <p className="text-xs text-muted-foreground">Products containing these words → <code className="bg-muted px-1 rounded font-mono text-[10px]">Bundles/</code></p>
            <div className="flex flex-wrap gap-2 min-h-[28px]">
              {(draft.bundle_keywords ?? []).map((kw) => (
                <Badge key={kw} variant="secondary" className="gap-1.5 pr-1.5 text-xs">
                  {kw}
                  <button onClick={() => removeKeyword("bundle", kw)} className="hover:text-destructive font-bold leading-none">×</button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input value={newBundle} onChange={(e) => setNewBundle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyword("bundle")}
                placeholder="e.g., Set, Bundle, Kit"
                className="h-8 flex-1 rounded-md border border-border/60 bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
              <Button variant="outline" size="sm" onClick={() => addKeyword("bundle")} disabled={!newBundle.trim()} className="h-8 px-2">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Other Keywords */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">Other Keywords</h3>
            <p className="text-xs text-muted-foreground">Exact product names → <code className="bg-muted px-1 rounded font-mono text-[10px]">Other/</code></p>
            <div className="flex flex-wrap gap-2 min-h-[28px]">
              {(draft.other_keywords ?? []).map((kw) => (
                <Badge key={kw} variant="outline" className="gap-1.5 pr-1.5 text-xs">
                  {kw}
                  <button onClick={() => removeKeyword("other", kw)} className="hover:text-destructive font-bold leading-none">×</button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input value={newOther} onChange={(e) => setNewOther(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyword("other")}
                placeholder="e.g., Multiple Products"
                className="h-8 flex-1 rounded-md border border-border/60 bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
              <Button variant="outline" size="sm" onClick={() => addKeyword("other")} disabled={!newOther.trim()} className="h-8 px-2">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Computed Segments */}
      <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/40">
        <p className="text-sm font-bold uppercase tracking-widest text-foreground">Computed Segments</p>
        <p className="text-xs text-muted-foreground">These path levels are auto-computed — not read from a Monday column.</p>
        <div className="space-y-2">
          {INFO_ROWS.map(({ label, desc }) => (
            <div key={label} className="flex items-start gap-3 text-sm p-2 bg-card rounded border border-border/30">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              <div>
                <span className="font-semibold text-foreground">{label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save / Cancel */}
      {isDirty && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => onSave(boardId, draft)}>
            <Save className="h-3 w-3" /> Save Changes
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={() => setDraft(board)}>
            <X className="h-3 w-3" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
