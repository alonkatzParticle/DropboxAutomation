"use client";

/**
 * DeptCard.tsx — Per-department card for the Hierarchy editor.
 *
 * Each card manages its own draft state. Changes are not committed until
 * the user clicks Save. Cancel reverts to the last saved values.
 * The trash icon requires a second click to confirm before deleting.
 * Chips are drag-and-drop sortable using @dnd-kit.
 *
 * Depends on: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
 */

import { useState, useEffect } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, GripHorizontal, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DeptRule {
  key: string;
  dropbox_folder: string;
  path_template: string[];
}

// Built-in segments with display label, example value, and colour.
// User-defined custom level names will also be shown dynamically via the customSegments prop.
const SEGMENTS: Record<string, { label: string; example: string; color: string }> = {
  dept_folder: { label: "Dept. Folder",  example: "Marketing Ads",  color: "bg-blue-100 text-blue-800 border-blue-200" },
  category:    { label: "Category",      example: "Products",       color: "bg-purple-100 text-purple-800 border-purple-200" },
  product:     { label: "Product",       example: "Face Cream",     color: "bg-green-100 text-green-800 border-green-200" },
  media_type:  { label: "Media Type",    example: "Video",          color: "bg-orange-100 text-orange-800 border-orange-200" },
  platform:    { label: "Platform",      example: "Meta",           color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  date:        { label: "Date",          example: "03_March 2026",  color: "bg-teal-100 text-teal-800 border-teal-200" },
  task_name:   { label: "Task Name",     example: "Ad Creative V1", color: "bg-red-100 text-red-800 border-red-200" },
};

// Colour palette for dynamically-named user levels (cycles through)
const DYNAMIC_COLORS = [
  "bg-green-100 text-green-800 border-green-200",
  "bg-orange-100 text-orange-800 border-orange-200",
  "bg-yellow-100 text-yellow-800 border-yellow-200",
  "bg-indigo-100 text-indigo-800 border-indigo-200",
  "bg-pink-100 text-pink-800 border-pink-200",
  "bg-gray-100 text-gray-700 border-gray-200",
];

function getChipStyle(seg: string, allCustom: string[]): string {
  if (seg in SEGMENTS) return SEGMENTS[seg].color;
  const idx = allCustom.indexOf(seg);
  return DYNAMIC_COLORS[idx % DYNAMIC_COLORS.length];
}

// Fixed (non-draggable) chip — used for dept_folder which must stay in place
function FixedChip({ seg, allCustom }: { seg: string; allCustom: string[] }) {
  const style = getChipStyle(seg, allCustom);
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-xs font-medium select-none opacity-80 ${style}`}>
      {SEGMENTS[seg]?.label ?? seg}
      <span className="ml-0.5 text-[10px] opacity-40" title="This level is always first">🔒</span>
    </span>
  );
}

// A single draggable chip for one path segment
function SortableChip({ seg, allCustom, onRemove }: { seg: string; allCustom: string[]; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seg });
  const style = getChipStyle(seg, allCustom);
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-xs font-medium select-none ${style}`}
    >
      {/* Drag handle */}
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing opacity-40 hover:opacity-80 mr-0.5">
        <GripHorizontal className="h-3 w-3" />
      </span>
      {SEGMENTS[seg]?.label ?? seg}
      {/* Remove chip */}
      <button onClick={onRemove} className="opacity-50 hover:opacity-100 ml-0.5 leading-none">×</button>
    </span>
  );
}

interface DeptCardProps {
  rule: DeptRule;          // committed (saved) state from parent
  dropboxRoot: string;
  customSegments?: string[]; // extra segment names from board column mappings (e.g. user-added keys)
  onSave: (updated: DeptRule) => void; // called only when Save is clicked
  onDelete: () => void;
}

export default function DeptCard({ rule, dropboxRoot, customSegments = [], onSave, onDelete }: DeptCardProps) {
  // draft = what's currently shown in the card (may differ from saved rule)
  const [draft, setDraft] = useState<DeptRule>(rule);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Keep draft in sync if parent updates the rule (e.g. after save)
  useEffect(() => { setDraft(rule); }, [JSON.stringify(rule)]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(rule);

  // Reorder chips after a drag ends (dept_folder is excluded from sorting)
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Work only on the sortable portion (everything except dept_folder)
    const sortable = draft.path_template.filter((s) => s !== "dept_folder");
    const oldIdx = sortable.indexOf(String(active.id));
    const newIdx = sortable.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sortable, oldIdx, newIdx);
    // Restore dept_folder at its original position in the full template
    const deptIdx = draft.path_template.indexOf("dept_folder");
    const full = deptIdx === -1 ? reordered : [
      ...reordered.slice(0, deptIdx),
      "dept_folder",
      ...reordered.slice(deptIdx),
    ];
    setDraft({ ...draft, path_template: full });
  }

  // Remove a chip by segment name
  function removeChip(seg: string) {
    setDraft({ ...draft, path_template: draft.path_template.filter((s) => s !== seg) });
  }

  // Add a segment from the dropdown
  function addSegment(seg: string) {
    if (!seg || draft.path_template.includes(seg)) return;
    setDraft({ ...draft, path_template: [...draft.path_template, seg] });
  }

  // Merge built-in computed segments with any user-defined custom level names.
  // customSegments contains the names the user set in the board-setup wizard.
  const allCustom = customSegments;
  const allSegmentKeys = [
    ...Object.keys(SEGMENTS),
    ...customSegments.filter((k) => !(k in SEGMENTS)),
  ];
  const available = allSegmentKeys.filter((s) => !draft.path_template.includes(s));

  // Live preview path: show example for built-in segments, or the level name for custom ones
  const preview = [dropboxRoot, ...draft.path_template.map((s) => {
    if (s === "dept_folder") return draft.dropbox_folder || "Dept. Folder";
    return SEGMENTS[s]?.example ?? `<${s}>`;
  })].join(" › ");

  return (
    <div className="border border-border/60 rounded-xl p-4 space-y-3 bg-card">
      {/* Row 1: rule name + dropbox folder inputs + delete button */}
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-0.5">
          <label className="text-xs text-muted-foreground">Rule name <span className="opacity-60">(Monday dept label)</span></label>
          <input value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            placeholder="e.g. Marketing, GT"
            className="w-full h-8 rounded-md border border-border/60 bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex-1 space-y-0.5">
          <label className="text-xs text-muted-foreground">Dropbox folder name</label>
          <input value={draft.dropbox_folder}
            onChange={(e) => setDraft({ ...draft, dropbox_folder: e.target.value })}
            placeholder="e.g. Marketing Ads"
            className="w-full h-8 rounded-md border border-border/60 bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        {/* Delete — requires confirmation */}
        <div className="shrink-0 flex items-center gap-1.5 self-end mb-0.5">
          {confirmDelete ? (
            <>
              <span className="text-xs text-destructive font-medium">Delete?</span>
              <button onClick={onDelete} className="text-xs text-destructive underline hover:no-underline">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted-foreground underline hover:no-underline">No</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:text-destructive transition-colors" title="Delete department">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: draggable path chips */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Path levels — drag to reorder</p>
        <div className="flex flex-wrap gap-1.5 items-center">
          {/* dept_folder is always first and cannot be moved or removed */}
          {draft.path_template.includes("dept_folder") && <FixedChip seg="dept_folder" allCustom={allCustom} />}
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={draft.path_template.filter((s) => s !== "dept_folder")}
              strategy={horizontalListSortingStrategy}>
              {draft.path_template.filter((s) => s !== "dept_folder").map((seg) => (
                <SortableChip key={seg} seg={seg} allCustom={allCustom} onRemove={() => removeChip(seg)} />
              ))}
            </SortableContext>
          </DndContext>
          {available.length > 0 && (
            <select value="" onChange={(e) => addSegment(e.target.value)}
              className="h-6 rounded border border-dashed border-border/60 bg-background px-1.5 text-xs text-muted-foreground focus:outline-none cursor-pointer">
              <option value="">+ Add…</option>
              {available.map((seg) => (
                <option key={seg} value={seg}>
                  {SEGMENTS[seg]?.label ?? seg}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Row 3: live path preview */}
      <p className="text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2.5 py-1.5 truncate" title={preview}>{preview}</p>

      {/* Row 4: Save / Cancel — only shown when there are unsaved changes */}
      {isDirty && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => onSave(draft)}>
            <Save className="h-3 w-3" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={() => setDraft(rule)}>
            <X className="h-3 w-3" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
