# App Restructuring Plan

This document outlines the planned refactoring and functional changes for the Dropbox Automation app.

---

## Phase 1 — Per-Board Dashboard Architecture ✅ COMPLETE

- **`dashboard.py`** — `Dashboard` class created, encapsulates per-board rules and path building
- **`config.json`** — Migrated: `department_rules`, `bundle_keywords`, `other_keywords`, `fallback_values` moved inside each board's block
- **`core.py`, `web.py`, `web_folder_mover.py`, `web_auto_creator.py`** — All refactored to use `Dashboard`
- **`folder_builder.py`** — Deleted
- **Web UI** — `board-columns`, `hierarchy`, `auto-create` pages all updated for per-board schema

---

## Phase 2 — Board Import & Custom Path Level Builder 🔄 PLANNING

### Goal
Allow any Monday.com board to be fully configured from scratch via the web UI, with no hard-coded path segment names. The user defines what path levels are called and maps them to Monday columns.

### Feature: "Import / Configure Board" flow

**Step 1 — Paste a board URL**
- User pastes a Monday.com board URL (e.g. `https://company.monday.com/boards/12345678`)
- App extracts the board ID and fetches its column list from the Monday API
- If the board already exists in `config.json`, pre-populate all fields (reconfigure mode)
- If it's new, start blank (add board mode)

**Step 2 — Define custom path levels**
- User creates named path levels — any name they choose (e.g. `campaign`, `region`, `product_line`)
- Four levels are always available as computed options (not mapped to a column):
  - `dept_folder` — resolved from the department rule
  - `category` — Products / Bundles / Other (based on keywords)
  - `date` — auto-computed from current month
  - `task_name` — from the Monday item name
- For all other levels, user maps a fetched Monday column → that level name via drag-and-drop

**Step 3 — Define department rules**
- Same concept as now: map a department column value to a Dropbox folder name
- Path template uses the **user-defined level names** from Step 2 (not hardcoded names)
- Multiple rules per board, each with its own path template

**Step 4 — Set keywords & fallbacks**
- Bundle keywords, Other keywords (per board — already in place)
- Fallback values for any level that returns empty

**Step 5 — Save**
- Writes the complete board block into `config.json` under `boards[boardId]`
- Immediately available to the polling engine

---

### What changes

#### Web UI
- **New page `/board-setup`** (or modal): the full 5-step import wizard
- **`DeptCard.tsx`** — Remove hardcoded `SEGMENTS` constant; chips generated from the board's own user-defined level names instead
- **`PathBuilder.tsx`** — Update to use board's custom level names when offering path levels

#### Python Backend
- **`dashboard.py`** — `resolve_segment()` currently has hardcoded `if segment == "product"` etc. These built-in handlers stay for the four computed levels (`dept_folder`, `category`, `date`, `task_name`). All other segments already fall through to the dynamic column lookup — no change needed there.
- No changes needed to `core.py`, `web.py`, or other scripts

#### Config (`config.json`)
No schema change — the existing structure already supports arbitrary segment names in `path_template` and arbitrary keys in `columns`. The change is purely in the UI giving users control over naming them.

---

### What stays the same
- Polling engine — unchanged
- Department rules concept — still exists, per board
- `Dashboard` class — minor update to `resolve_segment()` to drop hardcoded non-computed handlers
- All other pages

---

## Verification Plan
1. Paste a real Monday board URL → confirm columns are fetched and displayed
2. Create a board with 2 custom levels + 2 computed levels, configure 1 department rule, save
3. Confirm `config.json` has the correct structure
4. Run the polling engine and confirm a task from that board generates the correct path
