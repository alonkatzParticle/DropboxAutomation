# Dropbox Automation — App Bible

This document is a complete specification of the app. It covers every feature, every
business rule, and every design decision. Feed this file to any AI CLI to rebuild the
app faithfully from scratch.

---

## What This App Does

This app automatically creates organized Dropbox folders for creative tasks tracked in
Monday.com, then writes a shareable Dropbox link back into the Monday.com task. It
eliminates manual folder creation for a creative team managing video and design projects.

**The core loop:**
1. A new task is created in Monday.com (e.g. "Face Cream | META | Ad V1")
2. The app reads the task's column values (department, product, platform, etc.)
3. The app builds a Dropbox folder path from those values using a configurable template
4. The app creates the folder in Dropbox (if it doesn't already exist)
5. The app gets a shareable link for that folder
6. The app writes that link into the task's link column in Monday.com

---

## Tech Stack

- **Python 3.9+** — all backend automation and API communication
- **Next.js 16** with **React 19** and **TypeScript** — web UI (in the `web/` subfolder)
- **Tailwind CSS 4** — styling
- **shadcn/ui** — pre-built UI components (Button, Card, Switch, Checkbox, Skeleton, etc.)
- **@dnd-kit** — drag-and-drop for path level reordering
- **lucide-react** — icons
- **Monday.com GraphQL API** — task data source
- **Dropbox API v2** — folder storage
- **python-dotenv** — loads `.env` credentials into Python scripts

---

## File Structure

```
/                         ← project root (run Python scripts from here)
├── main.py               ← entry point; parse args and call core.py
├── core.py               ← run_polling / run_manual / run_all workflows
├── dashboard.py          ← Dashboard class: path building logic per board
├── monday_client.py      ← all Monday.com API calls (GraphQL)
├── monday_api.py         ← low-level GraphQL executor + auth headers
├── dropbox_client.py     ← all Dropbox API calls
├── state.py              ← load/save config.json and state.json
├── web.py                ← web-facing Python helpers (verify_link, list_missing, etc.)
├── web_auto_creator.py   ← get_pending_tasks_with_status, create_folder_at_path
├── web_folder_mover.py   ← check_task_folder, move_task_folder
├── get_dropbox_token.py  ← one-time OAuth2 setup script for Dropbox refresh token
├── config.json           ← board settings, column mappings, department rules
├── state.json            ← auto-created; tracks last-run timestamps + auto_enabled flag
├── .env                  ← secret API tokens (never commit)
├── .env.example          ← template showing which env vars are needed
├── requirements.txt      ← Python dependencies
├── CLAUDE.md             ← code style rules for AI assistants
├── RULES.md              ← business rules documentation
└── web/                  ← Next.js app
    ├── app/
    │   ├── page.tsx                        ← Home dashboard
    │   ├── auto-create/page.tsx            ← Auto-creator tool
    │   ├── folder-mover/page.tsx           ← Folder mover tool
    │   ├── hierarchy/page.tsx              ← Folder hierarchy editor
    │   ├── board-columns/page.tsx          ← Board column mapping viewer
    │   ├── board-setup/page.tsx            ← Board setup wizard
    │   ├── debugger/page.tsx               ← Debug log viewer
    │   └── api/
    │       ├── run/route.ts                ← trigger Python automation
    │       ├── tasks/route.ts              ← list tasks missing Dropbox links
    │       ├── auto/route.ts               ← read/write auto_enabled flag
    │       ├── auto-create/route.ts        ← pending tasks + create at custom path
    │       ├── verify-link/route.ts        ← preview path before creation
    │       ├── folder-mover/route.ts       ← move existing folders
    │       ├── config/route.ts             ← read/write config.json
    │       ├── board-import/route.ts       ← import new boards from Monday.com
    │       ├── monday-columns/route.ts     ← fetch column list from a board
    │       ├── monday-column-options/route.ts ← fetch dropdown options for a column
    │       ├── list-dropbox-folders/route.ts  ← browse Dropbox directory tree
    │       ├── history/route.ts            ← processing history log
    │       ├── debug-logs/route.ts         ← stream recent log output
    │       ├── status/route.ts             ← app health/status
    │       └── webhook/route.ts            ← receive Monday.com webhook events
    ├── components/
    │   ├── TaskList.tsx                    ← missing-link task list with filters
    │   ├── LinkVerifier.tsx                ← add Dropbox link to a single task
    │   ├── DeptCard.tsx                    ← department rule editor card (drag-and-drop chips)
    │   ├── FolderMoverCascade.tsx          ← cascading folder level selector
    │   └── ui/                             ← shadcn/ui primitive components
    └── package.json
```

---

## Credentials & Environment Variables

Stored in `.env` (never committed). Python reads them with `python-dotenv`.

```
MONDAY_API_TOKEN=...          # Monday.com API token (from monday.com developer section)

# Preferred Dropbox auth (never expires):
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
DROPBOX_REFRESH_TOKEN=...

# Fallback Dropbox auth (expires every 4 hours):
DROPBOX_ACCESS_TOKEN=...
```

The Next.js API routes shell out to Python scripts, so they inherit these from the
process environment. No separate `.env.local` is needed for the web layer.

---

## config.json — Schema and Purpose

This file controls all behavior. Operators edit it to add boards or change rules
without touching code.

```jsonc
{
  "dropbox_root": "/Creative 2026",        // top-level Dropbox folder; must start with /
  "monday_subdomain": "particle-for-men",  // used to build Monday.com task URLs in the UI

  "boards": {
    "<board_id>": {
      "name": "Video Projects",            // display name
      "media_type": "Video",               // fixed value injected into paths as "media_type" segment
      "dropbox_link_column": "link4__1",   // Monday column ID where Dropbox URL is written
      "status_column": "status",           // Monday column ID for task status

      "completed_labels": ["Completed"],   // tasks with these status values are hidden from UI lists
      "approved_label": "Approved",        // when status matches this, task is highlighted in auto-create

      "columns": {                         // maps segment name → Monday column ID
        "department": "label",
        "product":    "label9",
        "platform":   "single_selectu06tevn",
        "type":       "label4"             // optional extra columns
      },

      "bundle_keywords": ["Set", "Bundle", "Kit", "Pack", "Collection"],
      // if the product name contains any of these (case-insensitive), category = "Bundles"

      "other_keywords": ["Multiple Products", "Not a Product Task"],
      // if the product name exactly matches any of these, category = "Other"
      // otherwise category = "Products"

      "fallback_values": {                 // used when a column is empty
        "department": "Unknown",
        "product":    "Unknown Product",
        "platform":   ""
      },

      "fixed_level_values": {},            // board-wide overrides for any segment (rarely used)

      "department_rules": {
        "<Monday department label>": {
          "dropbox_folder": "Marketing Ads",  // the actual folder name used in the path
          "path_template": [                  // ordered list of segments to include in the path
            "dept_folder",
            "category",
            "product",
            "media_type",
            "platform",
            "date",
            "task_name"
          ],
          "fixed_values": {                   // optional: override specific segments for this department only
            "platform": "Gentleman Today"
          }
        }
      }
    }
  }
}
```

**Current boards in production:**
- `5433027071` — Video Projects (media_type: Video)
- `8036329818` — Design Projects (media_type: Image)

---

## state.json — Schema and Purpose

Auto-created on first run. Tracks polling timestamps and the auto-enable toggle.

```jsonc
{
  "auto_enabled": true,              // if false, polling exits immediately (toggled from web UI)
  "5433027071": "2026-03-15T...",    // ISO timestamp of last successful poll for each board
  "8036329818": "2026-03-15T..."
}
```

---

## Path Building Logic

This is the heart of the app. The `Dashboard` class in `dashboard.py` builds the
Dropbox folder path for a given Monday.com item.

### Segment Resolution Order

For each segment name in the `path_template`, the value is resolved in this order:

1. **Computed segments** (built-in, never from a column):
   - `dept_folder` → the `dropbox_folder` value from the matched department rule
   - `category` → computed from product name using bundle/other keywords (see below)
   - `media_type` → the board's fixed `media_type` value (e.g. "Video")
   - `date` → a running month index folder (e.g. "03_March 2026") based on current date
   - `task_name` → extracted from the Monday item name (see Task Name Rule below)

2. **Fixed override from the department rule** (`rule.fixed_values[segment]`)

3. **Board-level fixed override** (`board.fixed_level_values[segment]`)

4. **Dynamic: look up the Monday column** mapped to this segment name in `columns`,
   then call `get_column_value(item, column_id)`. Fall back to `fallback_values[segment]`.

### Category Computation

Given the raw product name from Monday:
- If it exactly matches an entry in `other_keywords` → `"Other"`
- Else if it contains any word from `bundle_keywords` (case-insensitive) → `"Bundles"`
- Otherwise → `"Products"`

### Date Folder Computation

Running month index starting at January 2026 = `01`.
Format: `{index:02d}_{MonthName} {Year}`

Examples:
- January 2026 → `01_January 2026`
- March 2026 → `03_March 2026`
- January 2027 → `13_January 2027`

### Task Name Rule

Use everything to the **right of the last ` | ` character** in the Monday item name.
If there is no ` | `, use the whole name.

Examples:
- `"Face Cream | META | Ad V1"` → `"Ad V1"`
- `"Face Cream | Ad V1"` → `"Ad V1"`
- `"Ad V1"` → `"Ad V1"`

**Why:** Monday task names often use ` | ` to embed metadata (product, platform). Since
those values already appear as separate path levels, the folder name should only contain
the actual task description.

### Department Rule Matching

The raw department value from Monday is matched against `department_rules` keys:
1. Exact match first
2. Case-insensitive match second
3. If no match → use fallback `dropbox_folder` and default template (logs a warning)

A task is **ambiguous** if no department rule matches. Ambiguous tasks appear in the
Auto-Creator page for manual placement.

### Full Example

Task: `"Face Cream | META | Ad V1"` on the Video Projects board
Department column value: `"Marketing/Media"`
Product column value: `"Face Cream"`
Platform column value: `"Meta"`

Matched rule: `Marketing/Media` → template: `[dept_folder, category, product, media_type, platform, date, task_name]`

Resolution:
- `dept_folder` → `"Marketing Ads"` (from rule's `dropbox_folder`)
- `category` → `"Products"` (Face Cream has no bundle keywords)
- `product` → `"Face Cream"` (from Monday column)
- `media_type` → `"Video"` (board-level fixed)
- `platform` → `"Meta"` (from Monday column)
- `date` → `"03_March 2026"` (current month)
- `task_name` → `"Ad V1"` (after last ` | `)

Final path: `/Creative 2026/Marketing Ads/Products/Face Cream/Video/Meta/03_March 2026/Ad V1`

---

## Python Backend — Module Responsibilities

### `main.py` — Entry Point

Parses command-line arguments and calls the appropriate workflow in `core.py`.

Arguments:
- *(no args)* → polling mode (check for new tasks since last run)
- `--all` → backfill mode (process ALL tasks missing links across all boards)
- `--url <monday_url>` → manual mode (process one specific task by URL)
- `--url <url> --force` → manual mode, overwrite existing link
- `--items "boardId:itemId,boardId:itemId"` → process specific items (called from web UI)
- `--list-missing` → print JSON list of all tasks missing Dropbox links (called from web UI)

### `core.py` — Workflows

**`process_item(item, board_id, board_config, config, force=False)`**
The single-item pipeline:
1. Check if link column already has a value → skip unless force=True
2. Build path with `Dashboard.build_path()`
3. `dropbox_client.create_folder(path)`
4. `dropbox_client.get_shared_link(path)`
5. `monday_client.update_dropbox_link(item_id, board_id, link_column, url)`
6. Any exception → log and raise (caller catches per-item and continues)

**`run_polling(config)`**
- Loads `state.json`
- Checks `auto_enabled` flag — exits early if False
- For each board, fetches items created since `state[board_id]` timestamp
- Calls `process_item` for each, catching per-item errors
- Saves new timestamps to `state.json`

**`run_manual(url, config, force)`**
- Parses Monday URL to extract board_id and item_id
- Calls `process_item` with force flag

**`run_all(config)`**
- Same as polling but uses `"2000-01-01"` as the since-date to get all items
- Does NOT update `state.json`

### `dashboard.py` — Dashboard Class

See the "Path Building Logic" section above for full details.

Key methods:
- `build_path(item, dropbox_root)` → returns the complete Dropbox path string
- `is_ambiguous(department_raw)` → True if no department rule matches
- `get_category(product_name)` → "Products", "Bundles", or "Other"
- `resolve_segment(segment, item, rule, product_raw, department_raw)` → one path level value

### `monday_client.py` — Monday.com API

All communication with the Monday.com GraphQL API.

Key functions:
- `get_new_items(board_id, since_iso)` → items created after a timestamp
- `get_item_by_id(item_id)` → single item by ID
- `get_item_by_url(url)` → parse Monday URL, return (board_id, item_id, item)
- `get_items_by_ids(item_ids)` → multiple items in one query
- `get_column_value(item, column_id)` → extract a column's display value from item dict
- `update_dropbox_link(item_id, board_id, column_id, link_url)` → write link back to Monday
  - Display text is always `"Dropbox Link"` (the clickable text shown in Monday)

### `monday_api.py` — Low-Level GraphQL

- `get_headers()` → auth headers using `MONDAY_API_TOKEN` from env
- `run_query(query, variables)` → execute any GraphQL query, return parsed JSON

### `dropbox_client.py` — Dropbox API

- `create_folder(path)` → creates folder idempotently (ignores "already exists" error)
- `get_shared_link(path)` → returns existing shared link or creates a new one
- `get_folder_path_from_link(shared_link_url)` → resolves a shared link to its actual path
- `move_folder(from_path, to_path)` → moves folder in Dropbox
- `list_subfolder_names(path)` → returns list of immediate subfolder names

Auth: prefers refresh token flow (`DROPBOX_REFRESH_TOKEN` + `DROPBOX_APP_KEY` +
`DROPBOX_APP_SECRET`). Falls back to `DROPBOX_ACCESS_TOKEN` if refresh token not set.

### `state.py` — Config and State Management

- `load_config()` → reads and returns `config.json` as a dict
- `load_state()` → reads and returns `state.json` as a dict (creates file if missing)
- `save_state(state_dict)` → writes dict to `state.json`

### `web.py` — Web-Facing Helpers

Helper functions called by the Next.js API routes via `python3 -c "import web; web.xyz()"`.

Key functions:
- `list_missing_tasks()` → prints JSON array of all tasks without Dropbox links
- `verify_link(monday_url)` → prints JSON with preview path for a given task URL
- `run_selected(items_str)` → process specific `boardId:itemId` pairs

### `web_auto_creator.py` — Auto-Creator Helpers

- `get_pending_tasks_with_status()` → classifies all missing-link tasks as ready/ambiguous/approvedWithFolder; prints JSON
- `create_folder_at_path(board_id, item_id, custom_path)` → create folder at a manually chosen path

### `web_folder_mover.py` — Folder Mover Helpers

- `check_task_folder(board_id, item_id)` → returns current folder info + proposed new path
- `move_task_folder(board_id, item_id, new_path)` → moves folder in Dropbox + updates Monday link

### `get_dropbox_token.py` — One-Time OAuth2 Setup

Run once to generate `DROPBOX_REFRESH_TOKEN`:
1. User provides App Key + App Secret
2. Script prints an authorization URL
3. User approves in browser, pastes the auth code back
4. Script exchanges code for refresh token and prints it

---

## Next.js Web UI — Pages

### Home (`/`)

The main dashboard. Contains:
- **Link Verifier panel** at the top — paste a Monday.com task URL, click Verify, preview
  the computed folder path, optionally force-create even if a link already exists
- **ACTIONS section** with two buttons:
  - "Run Poll" — triggers `main.py` with no args (poll mode)
  - "Run Backfill" — triggers `main.py --all`
  - "Auto-create" toggle — reads/writes `state.json` `auto_enabled` flag via `/api/auto`
- **MISSING LINKS section** — lists all tasks without Dropbox links via `TaskList.tsx`
  - Video / Image filter toggles
  - Checkbox multi-select to run automation on specific tasks
  - Output panel showing live stdout from Python

### Auto-Creator (`/auto-create`)

Smart task classification and batch folder creation.

Shows three sections:
1. **Ready tasks** — tasks where the department rule matched; shows the computed path preview.
   User can select and create all in one click.
2. **Ambiguous tasks** — tasks where no department rule matched. User manually chooses
   where to create the folder using a cascading Dropbox folder browser.
3. **Approved with folder** — tasks already approved and with a folder (shown for reference only).

A task is "Approved" if its status column matches the board's `approved_label` value.
Approved tasks without folders are flagged at the top of their respective sections.

### Folder Mover (`/folder-mover`)

Move an existing task's Dropbox folder to a new location.

Flow:
1. User pastes a Monday task URL
2. App fetches current folder path and proposed (correctly computed) path
3. User can either:
   - Accept the proposed path
   - Use the cascading folder browser to pick a custom destination
4. On confirm: folder is moved in Dropbox, Monday link is updated

### Folder Hierarchy (`/hierarchy`)

Visual editor for `department_rules` in `config.json`.

- Board selector sidebar (one board at a time)
- Each department rule shown as a `DeptCard` component:
  - Rule name input (the Monday department label to match)
  - Dropbox folder name input
  - Draggable chips for path segments (using @dnd-kit)
  - `dept_folder` chip is fixed/locked (always first, cannot be moved or removed)
  - Live path preview below the chips
  - Save/Cancel buttons appear only when there are unsaved changes
- "Add Department Rule" button
- "Save All Rules" button writes all rules to `config.json` via `/api/config`

**Chip colors** (built-in segments):
- `dept_folder` → blue
- `category` → purple
- `product` → green
- `media_type` → orange
- `platform` → yellow
- `date` → teal
- `task_name` → red
- Custom/user-defined segments → cycle through green/orange/yellow/indigo/pink/gray

### Board Columns (`/board-columns`)

Read-only viewer showing the column ID → segment name mappings for each board.
Helps operators identify the right column IDs when setting up a new board.

### Board Setup (`/board-setup`)

Wizard for adding a new Monday.com board to `config.json`.

Steps:
1. Enter board ID → fetch available columns from Monday.com API
2. Map each column to a segment name (department, product, platform, etc.)
3. Set board-level options (name, media type, link column, status column, etc.)
4. Saves to `config.json` via `/api/config`

### Debugger (`/debugger`)

Streams recent log output from the Python backend. Shows the last N lines of the
development log, with auto-refresh. Useful for diagnosing issues without SSH access.

---

## Next.js API Routes

All routes shell out to Python using Node's `child_process.exec()`. The working
directory for all Python calls is the project root (one level above `web/`).

| Route | Method | What it does |
|---|---|---|
| `/api/run` | POST | Run `main.py` with args (`poll`, `all`, `url`, `items`) |
| `/api/tasks` | GET | Run `main.py --list-missing`, return JSON task list |
| `/api/auto` | GET/POST | Read/write `auto_enabled` in `state.json` |
| `/api/auto-create` | GET | Run `web_auto_creator.get_pending_tasks_with_status()` |
| `/api/auto-create` | POST | Run `web_auto_creator.create_folder_at_path()` |
| `/api/verify-link` | POST | Run `web.verify_link(url)`, return path preview |
| `/api/folder-mover` | GET | Run `web_folder_mover.check_task_folder()` |
| `/api/folder-mover` | POST | Run `web_folder_mover.move_task_folder()` |
| `/api/config` | GET | Read and return `config.json` |
| `/api/config` | POST | Deep-merge incoming JSON into `config.json`, save |
| `/api/board-import` | POST | Fetch board metadata from Monday, add to `config.json` |
| `/api/monday-columns` | GET | Return all columns for a Monday board |
| `/api/monday-column-options` | GET | Return dropdown options for a specific column |
| `/api/list-dropbox-folders` | GET | Return subfolder names at a Dropbox path |
| `/api/history` | GET | Return recent processing history |
| `/api/debug-logs` | GET | Return recent log lines |
| `/api/status` | GET | Return app health info |
| `/api/webhook` | POST | Handle Monday.com webhook events |

---

## Key Components

### `TaskList.tsx`

Renders the missing-links task list on the Home page.

Props:
- Fetches from `/api/tasks` on load
- Video/Image filter toggles (controlled by Switch components)
- Checkbox per task for selection
- "Run Selected" button calls `/api/run` with `{ mode: "items", items: [...] }`
- Polls for output until the Python process finishes

### `DeptCard.tsx`

Per-department rule editor used on the Hierarchy page.

- Each card manages its own draft state independently
- Changes are not committed until Save is clicked
- Cancel reverts to last saved values
- Trash icon requires a second click to confirm deletion
- Drag-and-drop uses `@dnd-kit/core` and `@dnd-kit/sortable`
- `dept_folder` chip is rendered as a `FixedChip` (non-draggable, locked)
- All other chips are `SortableChip` components
- Live path preview updates as chips are reordered

### `FolderMoverCascade.tsx`

Cascading path selector for the Folder Mover page.

- Starts from `dropbox_root`
- Each level shows a dropdown of subfolders fetched from `/api/list-dropbox-folders`
- Selecting a folder at one level fetches the next level's options
- User can also type a custom folder name at each level
- Emits the final constructed path to the parent

### `LinkVerifier.tsx`

Paste a Monday.com task URL, preview the computed path, optionally force-create.
Calls `/api/verify-link` for preview and `/api/run` with `{ mode: "url" }` to execute.

---

## Code Style Rules

*(These rules are in `CLAUDE.md` and must be followed by anyone maintaining the code.)*

1. **File header comment** — every file starts with a multi-line comment explaining what
   the file does, how it fits the system, and what it depends on.

2. **Function comment** — every function has a comment above it explaining what it does,
   what it expects, and what it returns or does as a side effect.

3. **Inline comments** — any line that isn't self-explanatory gets a short comment.
   Write as if the reader has never seen Python before.

4. **Max 150 lines per file** — if a file grows beyond 150 lines, split it into two
   smaller focused files.

5. **Graceful error handling** — catch exceptions per-item, log clearly, and continue.
   Never let one failure crash the whole run.

6. **No hidden dependencies** — only import modules the file actually uses.

7. **Config over hardcoding** — board IDs, column IDs, folder paths, and API keys must
   live in `config.json` or `.env`, never hardcoded in `.py` files.

---

## Setup From Scratch

1. Clone the repo and `cd` into it.
2. Copy `.env.example` to `.env` and fill in credentials.
3. Run `python3 get_dropbox_token.py` if you don't have a Dropbox refresh token yet.
4. Run `python3 -m pip install -r requirements.txt`.
5. `cd web && npm install`.
6. `cd web && npm run dev` to start the web UI at `http://localhost:3000`.
7. To run polling manually: `cd ..` and `python3 main.py`.
8. To backfill all tasks: `python3 main.py --all`.
9. To process one task: `python3 main.py --url "https://..."`.

For scheduled polling (production), set up a cron job or a Monday.com webhook that
POSTs to `/api/webhook`, which triggers the poll automatically.

---

## What "Ambiguous" Means

A task is ambiguous when the value in its department column does not match any key in
the board's `department_rules`. This usually means the creative team has added a new
department label in Monday.com that hasn't been configured yet.

Ambiguous tasks appear in the Auto-Creator page under their own section. The user can
manually browse the Dropbox folder tree and place the folder wherever it belongs. After
that, the new department should be added to `config.json` so future tasks are handled
automatically.

---

## What "Approved" Means

Each board has an `approved_label` value in `config.json` (default: `"Approved"`).
When a task's status column matches this label, the Auto-Creator page flags it
prominently — these are tasks that the team has signed off on and that most urgently
need a Dropbox folder.

Tasks that are Approved and already have a folder are shown separately in a collapsed
"Approved with folder" section, for reference.
