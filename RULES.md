# Folder Naming & Automation Rules

## Task Name Folder Rule

**Location:** `folder_builder.py` line 162-172

The task name used for the final Dropbox folder is extracted from the Monday.com task name using this rule:

**Rule:** Use everything to the right of the **last `|` character**. If there's no `|`, use the whole task name.

### Examples:
- `"Face Cream | META | Ad V1"` → Folder: `"Ad V1"`
- `"Face Cream | Ad V1"` → Folder: `"Ad V1"`
- `"Ad V1"` → Folder: `"Ad V1"`

### Why this rule exists:
Monday.com task names often use `|` as a delimiter to separate metadata (product, platform, etc.) from the actual task description. Since the folder path already includes product, platform, and other metadata as separate levels, the final task folder should only contain the task description itself (the part after the last delimiter).

---

## Link Display Text Rule

**Location:** `monday_client.py` line 117

When writing a Dropbox link back to Monday.com, the display text is:

```
"Dropbox Link"
```

This text appears in the Monday.com link column as the clickable text (not the raw URL).

If you need to change this in the future, update line 117 in `monday_client.py`.

---

## Folder Structure

The complete Dropbox path follows this template (from `config.json`):

```
{dropbox_root} / {department} / {category} / {product} / {media_type} / {platform} / {date} / {task_name}
```

Where:
- **dropbox_root** — Top-level folder (e.g., `/Creative 2026`)
- **department** — From Monday.com `department` column (e.g., `Marketing Ads`)
- **category** — Auto-computed from product name (Products, Bundles, or Other)
- **product** — From Monday.com `product` column (e.g., `Face Cream`)
- **media_type** — Board-level setting (Image or Video)
- **platform** — From Monday.com `platform` column (e.g., `Meta`)
- **date** — Month index folder (e.g., `03_March 2026`)
- **task_name** — Final folder, extracted per the Task Name Folder Rule above

---

## Monday.com Column Mappings

**Video Projects** (board `5433027071`):
- Department: `label` column
- Product: `label9` column
- Platform: `single_selectu06tevn` column
- Dropbox Link (update target): `link4__1` column

**Design Projects** (board `8036329818`):
- Department: `status_1__1` column
- Product: `label9` column
- Platform: `single_selectrz7230p` column
- Dropbox Link (update target): `link0__1` column

---

## How to Change These Rules

1. **Task Name Extraction:** Edit `folder_builder.py`, function `_resolve_segment()`, segment `"task_name"`
2. **Link Display Text:** Edit `monday_client.py`, function `update_dropbox_link()`, line 117
3. **Folder Path Template:** Edit `config.json`, `department_rules[*].path_template` array
4. **Column Mappings:** Edit `config.json`, `boards[boardId].columns` object

Always update this file when you change any of these rules.
