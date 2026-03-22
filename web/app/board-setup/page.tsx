"use client";

/**
 * board-setup/page.tsx — Board Import & Configuration Wizard
 *
 * A 5-step flow for adding a new board or reconfiguring an existing one:
 *   1. Paste Monday.com board URL → fetch board name & columns
 *   2. Define custom path levels + map Monday columns to them
 *   3. Define department rules (which column value → which folder)
 *   4. Set keywords & fallback values
 *   5. Review & save to config.json
 *
 * Depends on: /api/board-import (GET), /api/config (POST)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, ArrowRight, ArrowLeft, Save, CheckCircle2,
  Link as LinkIcon, Columns2, FolderTree, Tag, Eye, GripHorizontal
} from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Colour palette cycles for custom level chips
const CHIP_COLORS = [
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-purple-100 text-purple-800 border-purple-200",
  "bg-green-100 text-green-800 border-green-200",
  "bg-yellow-100 text-yellow-800 border-yellow-200",
  "bg-orange-100 text-orange-800 border-orange-200",
  "bg-teal-100 text-teal-800 border-teal-200",
  "bg-pink-100 text-pink-800 border-pink-200",
  "bg-indigo-100 text-indigo-800 border-indigo-200",
  "bg-red-100 text-red-800 border-red-200",
];

function chipColor(name: string, allNames: string[]) {
  const idx = allNames.indexOf(name);
  return CHIP_COLORS[idx % CHIP_COLORS.length];
}

// Draggable chip for a path template segment
function SortableTemplateChip({ seg, allNames, onRemove }: { seg: string; allNames: string[]; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seg });
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-xs font-mono font-medium select-none ${chipColor(seg, allNames)}`}
    >
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing opacity-40 hover:opacity-80">
        <GripHorizontal className="h-3 w-3" />
      </span>
      {seg}
      <button onClick={onRemove} className="opacity-50 hover:opacity-100 ml-0.5 leading-none">×</button>
    </span>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface MondayColumn { id: string; title: string; type: string; }

// A user-defined path level
interface PathLevel {
  uid: string;
  name: string;           // user-chosen name, e.g. "campaign", "region"
  source: "column" | "computed" | "fixed";
  columnId: string;       // filled when source === "column"
  computed: string;       // filled when source === "computed"
  fixedValue: string;     // filled when source === "fixed" — a static folder name
}

// A department rule: maps a Monday department value to a Dropbox folder + path template
interface DeptRule {
  key: string;            // e.g. "Marketing"
  dropbox_folder: string; // e.g. "Marketing Ads"
  path_template: string[]; // ordered list of PathLevel names
}

// Segments that are always auto-computed (not from a Monday column)
const COMPUTED_OPTIONS = [
  { value: "category",    label: "Category",       desc: "Products / Bundles / Other based on keywords" },
  { value: "media_type",  label: "Media Type",     desc: "Board-level media type (e.g. Image, Video)" },
  { value: "date",        label: "Date",            desc: "Auto-computed from current month" },
  { value: "task_name",   label: "Task Name",       desc: "The Monday.com item name" },
];

function uid() { return Math.random().toString(36).slice(2); }

// ─── Step indicators ─────────────────────────────────────────────────────────

const STEPS = ["Import Board", "Path Levels", "Department Rules", "Keywords", "Review & Save"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
          <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
            i < current ? "bg-primary text-primary-foreground" :
            i === current ? "bg-primary/20 text-primary border-2 border-primary" :
            "bg-muted text-muted-foreground"
          }`}>
            {i < current ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={`text-xs truncate ${i === current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && <div className="h-px bg-border flex-1 mx-1" />}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BoardSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1 state
  const [boardUrl, setBoardUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [boardId, setBoardId] = useState("");
  const [boardName, setBoardName] = useState("");
  const [mondayColumns, setMondayColumns] = useState<MondayColumn[]>([]);
  const [isReconfigure, setIsReconfigure] = useState(false);

  // Step 2 state: path levels
  const [pathLevels, setPathLevels] = useState<PathLevel[]>([]);

  // Step 3 state: department rules
  const [deptColId, setDeptColId] = useState("");   // which Monday column is "department"
  const [deptRules, setDeptRules] = useState<DeptRule[]>([]);
  const [deptColumnOptions, setDeptColumnOptions] = useState<string[]>([]); // possible values for the dept column
  const [dropboxTopFolders, setDropboxTopFolders] = useState<string[]>([]);  // top-level Dropbox folders
  const [step3Loading, setStep3Loading] = useState(false);

  // Fetch dept column options + top-level Dropbox folders when entering Step 3
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchStep3Data = async (deptCol: string, bid: string) => {
    setStep3Loading(true);
    try {
      const [optRes, folderRes] = await Promise.all([
        deptCol && bid
          ? fetch(`/api/monday-column-options?boardIds=${bid}&columnIds=${deptCol}`)
          : Promise.resolve(null),
        fetch(`/api/list-dropbox-folders?path=`),
      ]);
      if (optRes) {
        const optData = await optRes.json();
        const opts: string[] = optData?.[bid]?.[deptCol] ?? [];
        setDeptColumnOptions(opts);
      }
      if (folderRes?.ok) {
        const folderData = await folderRes.json();
        setDropboxTopFolders(folderData.folders ?? []);
      }
    } catch { /* silently degrade */ }
    setStep3Loading(false);
  };

  // Step 4 state
  const [bundleKeywords, setBundleKeywords] = useState<string[]>(["Set", "Bundle", "Kit", "Pack", "Collection"]);
  const [otherKeywords, setOtherKeywords] = useState<string[]>(["Multiple Products"]);
  const [newBundle, setNewBundle] = useState("");
  const [newOther, setNewOther] = useState("");
  const [mediaType, setMediaType] = useState("Image");
  const [dropboxLinkColumn, setDropboxLinkColumn] = useState("");
  const [statusColumn, setStatusColumn] = useState("status");

  // Final save state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);

  // ── Step 1: Import board ──────────────────────────────────────────────────

  async function importBoard() {
    setLoading(true);
    setImportError("");
    try {
      const res = await fetch(`/api/board-import?url=${encodeURIComponent(boardUrl)}`);
      const data = await res.json();
      if (!res.ok) { setImportError(data.error ?? "Unknown error"); return; }

      setBoardId(data.boardId);
      setBoardName(data.boardName);
      setMondayColumns(data.columns);

      if (data.existingConfig) {
        // Pre-populate from existing config
        setIsReconfigure(true);
        const cfg = data.existingConfig;
        setMediaType(cfg.media_type ?? "Image");
        setDropboxLinkColumn(cfg.dropbox_link_column ?? "");
        setStatusColumn(cfg.status_column ?? "status");
        setBundleKeywords(cfg.bundle_keywords ?? []);
        setOtherKeywords(cfg.other_keywords ?? []);

        // Rebuild path levels from columns mapping
        const cols: Record<string, string> = cfg.columns ?? {};
        const fixedVals: Record<string, string> = cfg.fixed_level_values ?? {};
        const computedNames = new Set(COMPUTED_OPTIONS.map(o => o.value));
        const levels: PathLevel[] = [];
        // Column-mapped levels
        for (const [name, colId] of Object.entries(cols)) {
          levels.push({ uid: uid(), name, source: "column", columnId: colId, computed: "", fixedValue: "" });
        }
        // Fixed-value levels
        for (const [name, val] of Object.entries(fixedVals)) {
          levels.push({ uid: uid(), name, source: "fixed", columnId: "", computed: "", fixedValue: val });
        }
        // Computed levels from first dept rule template
        const firstRule = Object.values(cfg.department_rules ?? {})[0] as { path_template?: string[] } | undefined;
        for (const seg of (firstRule?.path_template ?? [])) {
          if (computedNames.has(seg) && !levels.find(l => l.name === seg)) {
            levels.push({ uid: uid(), name: seg, source: "computed", columnId: "", computed: seg, fixedValue: "" });
          }
        }
        setPathLevels(levels);

        // Rebuild dept rules
        const rules: DeptRule[] = Object.entries(cfg.department_rules ?? {}).map(([key, val]: [string, any]) => ({
          key, dropbox_folder: val.dropbox_folder ?? key, path_template: val.path_template ?? [],
        }));
        setDeptRules(rules);
        setDeptColId(cols.department ?? "");
      } else {
        setIsReconfigure(false);
        // Sensible defaults for new board
        setPathLevels([
          { uid: uid(), name: "department", source: "column",   columnId: mondayColumns[0]?.id ?? "", computed: "", fixedValue: "" },
          { uid: uid(), name: "category",   source: "computed", columnId: "", computed: "category",   fixedValue: "" },
          { uid: uid(), name: "task_name",  source: "computed", columnId: "", computed: "task_name",  fixedValue: "" },
        ]);
        setDeptRules([{ key: "", dropbox_folder: "", path_template: [] }]);
      }
      setStep(1);
    } catch (e) {
      setImportError(`Network error: ${e}`);
    }
    setLoading(false);
  }

  // ── Step 2 helpers ────────────────────────────────────────────────────────

  function addLevel() {
    setPathLevels(p => [...p, { uid: uid(), name: "", source: "column", columnId: mondayColumns[0]?.id ?? "", computed: "", fixedValue: "" }]);
  }

  function updateLevel(uid: string, patch: Partial<PathLevel>) {
    setPathLevels(p => p.map(l => l.uid === uid ? { ...l, ...patch } : l));
  }

  function removeLevel(uid: string) {
    setPathLevels(p => p.filter(l => l.uid !== uid));
  }

  function moveLevel(uid: string, dir: -1 | 1) {
    setPathLevels(p => {
      const i = p.findIndex(l => l.uid === uid);
      if ((dir === -1 && i === 0) || (dir === 1 && i === p.length - 1)) return p;
      const next = [...p];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  }

  // ── Step 3 helpers ────────────────────────────────────────────────────────

  function addRule() {
    setDeptRules(p => [...p, { key: "", dropbox_folder: "", path_template: pathLevels.map(l => l.name).filter(Boolean) }]);
  }

  function updateRule(i: number, patch: Partial<DeptRule>) {
    setDeptRules(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function removeRule(i: number) {
    setDeptRules(p => p.filter((_, idx) => idx !== i));
  }

  function toggleTemplateLevel(ruleIdx: number, levelName: string) {
    setDeptRules(p => p.map((r, i) => {
      if (i !== ruleIdx) return r;
      const has = r.path_template.includes(levelName);
      return {
        ...r,
        path_template: has ? r.path_template.filter(s => s !== levelName) : [...r.path_template, levelName],
      };
    }));
  }

  // ── Step 4 helpers ────────────────────────────────────────────────────────

  function addKeyword(list: "bundle" | "other", val: string) {
    if (!val.trim()) return;
    if (list === "bundle") { setBundleKeywords(p => [...p, val.trim()]); setNewBundle(""); }
    else { setOtherKeywords(p => [...p, val.trim()]); setNewOther(""); }
  }

  // ── Step 5: Save ──────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    setSaveResult(null);

    // Build columns map: name → columnId (only "column" source levels)
    const columns: Record<string, string> = {};
    for (const l of pathLevels) {
      if (l.source === "column" && l.name && l.columnId) columns[l.name] = l.columnId;
    }
    // Always ensure department column is mapped
    if (deptColId) columns.department = deptColId;

    // Build fixed_level_values for "fixed" source levels
    const fixed_level_values: Record<string, string> = {};
    for (const l of pathLevels) {
      if (l.source === "fixed" && l.name && l.fixedValue) fixed_level_values[l.name] = l.fixedValue;
    }

    // Build department_rules
    const department_rules: Record<string, { dropbox_folder: string; path_template: string[] }> = {};
    for (const r of deptRules) {
      if (r.key.trim()) {
        department_rules[r.key.trim()] = { dropbox_folder: r.dropbox_folder, path_template: r.path_template };
      }
    }

    const boardConfig = {
      name: boardName,
      media_type: mediaType,
      dropbox_link_column: dropboxLinkColumn,
      status_column: statusColumn,
      completed_labels: ["Completed"],
      approved_label: "Approved",
      columns,
      fixed_level_values,
      bundle_keywords: bundleKeywords,
      other_keywords: otherKeywords,
      fallback_values: { department: "Unknown", product: "Unknown Product", platform: "" },
      department_rules,
    };

    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boards: { [boardId]: boardConfig } }),
    });

    if (res.ok) {
      setSaveResult("success");
      setTimeout(() => router.push("/"), 800);
    } else {
      setSaveResult("error");
    }
    setSaving(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const allLevelNames = pathLevels.map(l => l.name).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Board Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import any Monday.com board and define its folder path structure from scratch.
        </p>
      </div>

      <StepBar current={step} />

      {/* ── Step 0: Import ── */}
      {step === 0 && (
        <Card className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <LinkIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold">Paste a Monday.com Board URL</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                We'll fetch the board's name and columns automatically. If this board is already configured, the existing settings will be pre-filled.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={boardUrl}
              onChange={e => setBoardUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && boardUrl && importBoard()}
              placeholder="https://company.monday.com/boards/12345678"
              className="flex-1 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
            <Button onClick={importBoard} disabled={!boardUrl.trim() || loading}>
              {loading ? "Importing…" : "Import"}
            </Button>
          </div>
          {importError && <p className="text-xs text-destructive">{importError}</p>}
        </Card>
      )}

      {/* ── Step 1: Path Levels ── */}
      {step === 1 && (
        <div className="space-y-5">
          {isReconfigure && (
            <div className="text-xs text-primary bg-primary/10 rounded-md px-3 py-2 border border-primary/20">
              Pre-populated from existing config for <strong>{boardName}</strong>. Edit as needed.
            </div>
          )}
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Columns2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Define Path Levels</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Each level becomes one folder in the Dropbox path. Name it whatever you like,
                  then choose whether it maps to a Monday column or is auto-computed.
                </p>
              </div>
            </div>

            {/* Column header */}
            <div className="grid grid-cols-[1fr_120px_1fr_28px] gap-x-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-2 pb-1 border-b border-border/40">
              <span>Level Name</span>
              <span>Source</span>
              <span>Value</span>
              <span />
            </div>

            <div className="divide-y divide-border/30">
              {pathLevels.map((lvl) => (
                <div key={lvl.uid} className="grid grid-cols-[1fr_120px_1fr_28px] gap-x-2 items-center py-1.5 px-2 hover:bg-muted/30 transition-colors">
                  {/* Level name */}
                  <input
                    value={lvl.name}
                    onChange={e => updateLevel(lvl.uid, { name: e.target.value.replace(/\s+/g, "_").toLowerCase() })}
                    placeholder="level_name"
                    className="h-7 rounded border border-border/50 bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring w-full"
                  />
                  {/* Source toggle */}
                  <select
                    value={lvl.source}
                    onChange={e => updateLevel(lvl.uid, {
                      source: e.target.value as PathLevel["source"],
                      columnId: mondayColumns[0]?.id ?? "",
                      computed: COMPUTED_OPTIONS[0].value,
                      fixedValue: "",
                    })}
                    className="h-7 rounded border border-border/50 bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="column">Column</option>
                    <option value="computed">Computed</option>
                    <option value="fixed">Fixed Value</option>
                  </select>
                  {/* Value picker based on source */}
                  {lvl.source === "column" && (
                    <select value={lvl.columnId} onChange={e => updateLevel(lvl.uid, { columnId: e.target.value })}
                      className="h-7 rounded border border-border/50 bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-full">
                      {mondayColumns.map(col => (
                        <option key={col.id} value={col.id}>{col.title}</option>
                      ))}
                    </select>
                  )}
                  {lvl.source === "computed" && (
                    <select value={lvl.computed} onChange={e => updateLevel(lvl.uid, { computed: e.target.value, name: e.target.value })}
                      className="h-7 rounded border border-border/50 bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-full">
                      {COMPUTED_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                      ))}
                    </select>
                  )}
                  {lvl.source === "fixed" && (
                    <input
                      value={lvl.fixedValue}
                      onChange={e => updateLevel(lvl.uid, { fixedValue: e.target.value })}
                      placeholder="e.g. 2026, EMEA"
                      className="h-7 rounded border border-border/50 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-full"
                    />
                  )}
                  {/* Delete */}
                  <button onClick={() => removeLevel(lvl.uid)}
                    className="flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={addLevel} className="gap-1.5 text-xs border-dashed w-full">
              <Plus className="h-3.5 w-3.5" /> Add Level
            </Button>

            {/* Preview */}
            {pathLevels.length > 0 && (
              <div className="bg-muted/30 rounded-md px-3 py-2 text-xs font-mono text-muted-foreground">
                /Dropbox Root / {pathLevels.map(l => l.name || "?").join(" / ")}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Step 2: Department Rules ── */}
      {step === 2 && (
        <div className="space-y-5">
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <FolderTree className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Department Rules</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  First, pick which Monday column holds the department value. Then map each department value to a Dropbox folder and choose which path levels apply.
                </p>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              {deptRules.map((rule, i) => (
                <div key={i} className="border border-border/40 rounded-lg p-4 space-y-3 bg-muted/10">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Department Value — dropdown from Monday column options */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground font-medium">Department Value</label>
                      {deptColumnOptions.length > 0 ? (
                        <select
                          value={rule.key}
                          onChange={e => updateRule(i, { key: e.target.value })}
                          className="w-full h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">— select department —</option>
                          {deptColumnOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={rule.key}
                          onChange={e => updateRule(i, { key: e.target.value })}
                          placeholder={step3Loading ? "Loading options…" : "e.g. Marketing, GT"}
                          className="w-full h-8 rounded-md border border-border/60 bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      )}
                    </div>
                    {/* Dropbox Folder Name — dropdown from top-level Dropbox folders */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground font-medium">Dropbox Folder Name</label>
                      {dropboxTopFolders.length > 0 ? (
                        <select
                          value={rule.dropbox_folder}
                          onChange={e => updateRule(i, { dropbox_folder: e.target.value })}
                          className="w-full h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">— select folder —</option>
                          {dropboxTopFolders.map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={rule.dropbox_folder}
                          onChange={e => updateRule(i, { dropbox_folder: e.target.value })}
                          placeholder={step3Loading ? "Loading folders…" : "e.g. Marketing Ads"}
                          className="w-full h-8 rounded-md border border-border/60 bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">Path template — drag to reorder</label>

                    {/* Draggable chips */}
                    <div className="flex flex-wrap gap-1.5 items-center min-h-[28px] p-2 bg-muted/20 rounded-md border border-border/30">
                      {rule.path_template.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">Add levels below…</span>
                      )}
                      <DndContext
                        collisionDetection={closestCenter}
                        onDragEnd={(event: DragEndEvent) => {
                          const { active, over } = event;
                          if (!over || active.id === over.id) return;
                          const oldIdx = rule.path_template.indexOf(String(active.id));
                          const newIdx = rule.path_template.indexOf(String(over.id));
                          if (oldIdx === -1 || newIdx === -1) return;
                          updateRule(i, { path_template: arrayMove(rule.path_template, oldIdx, newIdx) });
                        }}
                      >
                        <SortableContext items={rule.path_template} strategy={horizontalListSortingStrategy}>
                          {rule.path_template.map(seg => (
                            <SortableTemplateChip
                              key={seg}
                              seg={seg}
                              allNames={allLevelNames}
                              onRemove={() => updateRule(i, { path_template: rule.path_template.filter(s => s !== seg) })}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>

                    {/* Add available levels as dashed chips */}
                    {allLevelNames.filter(n => !rule.path_template.includes(n)).length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-[10px] text-muted-foreground">Add:</span>
                        {allLevelNames.filter(n => !rule.path_template.includes(n)).map(name => (
                          <button key={name}
                            onClick={() => updateRule(i, { path_template: [...rule.path_template, name] })}
                            className="px-2 py-0.5 rounded border border-dashed border-border/60 text-xs font-mono text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                            + {name}
                          </button>
                        ))}
                      </div>
                    )}

                    {rule.path_template.length > 0 && (
                      <p className="text-[10px] font-mono text-muted-foreground/60">
                        {rule.path_template.join(" / ")}
                      </p>
                    )}
                  </div>

                  <button onClick={() => removeRule(i)} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Remove rule
                  </button>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addRule} className="gap-1.5 text-xs border-dashed w-full">
                <Plus className="h-3.5 w-3.5" /> Add Department Rule
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Step 3: Keywords & Board Settings ── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Tag className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
              <h2 className="text-sm font-semibold">Board Settings & Keywords</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Media Type</label>
                <select value={mediaType} onChange={e => setMediaType(e.target.value)}
                  className="w-full h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                  <option>Image</option>
                  <option>Video</option>
                  <option>Audio</option>
                  <option>Document</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Dropbox Link Column</label>
                <select value={dropboxLinkColumn} onChange={e => setDropboxLinkColumn(e.target.value)}
                  className="w-full h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">— select column —</option>
                  {mondayColumns.map(col => (
                    <option key={col.id} value={col.id}>{col.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t pt-4 grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold">Bundle Keywords <span className="text-muted-foreground font-normal">(→ Bundles/)</span></h3>
                <div className="flex flex-wrap gap-1.5">{bundleKeywords.map(kw => (
                  <Badge key={kw} variant="secondary" className="gap-1 pr-1 text-xs">{kw}
                    <button onClick={() => setBundleKeywords(p => p.filter(k => k !== kw))} className="hover:text-destructive font-bold">×</button>
                  </Badge>
                ))}</div>
                <div className="flex gap-1.5">
                  <input value={newBundle} onChange={e => setNewBundle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addKeyword("bundle", newBundle)}
                    placeholder="Add keyword…"
                    className="flex-1 h-7 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                  <Button variant="outline" size="sm" onClick={() => addKeyword("bundle", newBundle)} className="h-7 px-2"><Plus className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold">Other Keywords <span className="text-muted-foreground font-normal">(→ Other/)</span></h3>
                <div className="flex flex-wrap gap-1.5">{otherKeywords.map(kw => (
                  <Badge key={kw} variant="outline" className="gap-1 pr-1 text-xs">{kw}
                    <button onClick={() => setOtherKeywords(p => p.filter(k => k !== kw))} className="hover:text-destructive font-bold">×</button>
                  </Badge>
                ))}</div>
                <div className="flex gap-1.5">
                  <input value={newOther} onChange={e => setNewOther(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addKeyword("other", newOther)}
                    placeholder="Add keyword…"
                    className="flex-1 h-7 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                  <Button variant="outline" size="sm" onClick={() => addKeyword("other", newOther)} className="h-7 px-2"><Plus className="h-3 w-3" /></Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Step 4: Review & Save ── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Review & Save</h2>
                <p className="text-xs text-muted-foreground">{isReconfigure ? "Reconfiguring" : "Adding"} board <strong>{boardName}</strong> (ID: {boardId})</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-muted/20 rounded-lg p-3 border border-border/40">
                <p className="font-semibold mb-1">Path Levels ({pathLevels.length})</p>
                <div className="font-mono text-muted-foreground">/Dropbox Root / {pathLevels.map(l => l.name || "?").join(" / ")}</div>
              </div>

              <div className="bg-muted/20 rounded-lg p-3 border border-border/40">
                <p className="font-semibold mb-2">Department Rules ({deptRules.filter(r => r.key).length})</p>
                {deptRules.filter(r => r.key).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-foreground">{r.key}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{r.dropbox_folder}</span>
                    <span className="text-muted-foreground/60">({r.path_template.join(" / ")})</span>
                  </div>
                ))}
              </div>

              <div className="bg-muted/20 rounded-lg p-3 border border-border/40 grid grid-cols-2 gap-2">
                <div>
                  <p className="font-semibold mb-1">Bundle Keywords</p>
                  <div className="flex flex-wrap gap-1">{bundleKeywords.map(k => <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>)}</div>
                </div>
                <div>
                  <p className="font-semibold mb-1">Other Keywords</p>
                  <div className="flex flex-wrap gap-1">{otherKeywords.map(k => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t">
              <Button onClick={save} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : isReconfigure ? "Save Changes" : "Add Board"}
              </Button>
              {saveResult === "success" && (
                <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Saved to config.json
                </span>
              )}
              {saveResult === "error" && (
                <span className="text-xs text-destructive">Save failed — check the console</span>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Navigation buttons ── */}
      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < 4 && (
          <Button
            onClick={() => {
              const next = step + 1;
              // When moving to Step 3 (index 2), pre-fetch dept options + Dropbox folders
              if (next === 2) {
                // Derive dept column ID from the level named "department" in Step 2
                const deptLevel = pathLevels.find(l => l.name === "department" && l.source === "column");
                const colId = deptLevel?.columnId ?? deptColId;
                setDeptColId(colId);
                fetchStep3Data(colId, boardId);
              }
              setStep(next);
            }}
            disabled={step === 0}
            className="gap-1.5"
          >
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
