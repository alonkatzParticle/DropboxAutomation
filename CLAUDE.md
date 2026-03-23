# CLAUDE.md — Code Style Rules for This Project

This file tells Claude (AI assistant) how to write and maintain code in this project.
These rules exist so that Alon (a non-technical user) can read, understand, and manually
fix any part of the code without needing to understand the whole system.

---

## Rules for Every File

1. **File header comment** — Every file must start with a multi-line comment that explains:
   - What this file does
   - How it fits into the overall system
   - What other files it depends on (if any)

2. **Function comments** — Every function must have a comment directly above it that explains:
   - What the function does in plain English
   - What inputs it expects
   - What it returns or what side effect it has

3. **Inline comments** — Add a short comment on any line that isn't self-explanatory.
   Assume the reader has never seen Python before.

4. **Max 150 lines per file** — If a file grows beyond 150 lines, split it into two
   smaller files with clear names. This keeps each file focused and easy to scan.

5. **Graceful error handling** — If something fails (API call, folder creation, etc.),
   log a clear error message and continue. Never let one failed task crash the whole run.
   The program should always finish cleanly.

6. **No hidden dependencies** — Each file should only import things it actually uses.
   Never import a module just because another file uses it.

7. **Config over hardcoding** — Board IDs, column IDs, folder paths, and API keys must
   never be hardcoded inside .py files. They belong in config.json or .env.

---

## Questions to Ask Before Adding Any New Feature

Before writing any code for a new feature, always ask these questions:

1. **Does it belong on an existing object?**
   The app has these core objects — check if the feature is a new property or method
   on one of these before creating anything new:
   - `Dashboard` (board config, path building, department rules) — in `dashboard.py`
   - `Task` (Monday item + UI state like isNew, needsAttention) — currently plain dicts,
     should eventually become a proper class
   - `Board` (settings + tasks + hierarchies) — currently split across config dict + Dashboard

2. **Is anything hardcoded that should be configurable?**
   New behavior that varies per-board (group names, label names, column IDs, etc.)
   must go in `config.json`, not in code.

3. **What happens when a second board is added?**
   Every feature must work for any number of boards without code changes.
   If it only works for one board, it's not done yet.

4. **Is there an existing function that already does this?**
   Check before writing new code:
   - `process_item()` — creates a Dropbox folder and writes the link to Monday.com
   - `Dashboard.build_path()` — builds the full folder path from a task's column values
   - `Dashboard.is_ambiguous()` — checks if a department has a matching rule
   - `monday_client.get_column_value()` — reads a column value from a task dict

5. **Where does the task's state live?**
   - Column values (product, department, platform) → come from Monday.com API
   - UI-only state (isNew, needsAttention, isApproved) → computed in `web_auto_creator.py`,
     should eventually live on a Task object

---

## File Layout of This Project

```
main.py           — Entry point. Run this file to use the app.
monday_client.py  — All communication with Monday.com API goes here.
dropbox_client.py — All communication with Dropbox API goes here.
folder_builder.py — Logic to build the Dropbox folder path from a task's data.
config.json       — Board settings and column mappings (edit this to adjust behavior).
.env              — Secret API tokens (never share or commit this file).
state.json        — Auto-created. Tracks when we last checked for new tasks.
```
