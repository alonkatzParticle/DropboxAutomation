"""
core.py — Core processing workflows

Implements the main automation workflows:
- Polling: Check for new tasks and process them
- Manual: Process a single task by URL
- Backfill: Process ALL tasks missing links

Depends on: task.py, dashboard.py, monday_client.py, dropbox_client.py, state.py
Used by: main.py
"""

import sys
from datetime import datetime, timezone

import monday_client
import dropbox_client
import state
from dashboard import Board
from task import Task


def process_item(item: dict, board_id: str, board_config: dict, config: dict, force: bool = False) -> None:
    """
    Run the complete automation for a single Monday.com item:
    1. Check if Dropbox link exists (skip unless --force)
    2. Build folder path from column values
    3. Create folder in Dropbox
    4. Get shareable link
    5. Write link back to Monday.com

    item         — Raw item dict from monday_client
    board_id     — Monday.com board ID string
    board_config — The board's config block from config.json
    config       — Full config dict (needed for dropbox_root)
    force        — If True, re-create even if a link already exists
    """
    board = Board(board_id, board_config)
    task = Task(item, board, config.get("monday_subdomain", ""))

    if task.has_folder and not force:
        print(f"  ↷ Skipping '{task.task_name}' — Dropbox link already set.")
        return

    print(f"\n→ Processing: {task.task_name}")

    try:
        path = board.build_path(task.raw_item(), config["dropbox_root"])
        print(f"  Path: {path}")

        dropbox_client.create_folder(path)

        link_url = dropbox_client.get_shared_link(path)
        print(f"  Link: {link_url}")

        monday_client.update_dropbox_link(
            task.id, board.board_id, board.dropbox_link_column, link_url
        )
        print(f"  ✓ Link written to Monday.com task.")

    except Exception as e:
        print(f"  ✗ Error: {e}", file=sys.stderr)
        raise


def run_polling(config: dict) -> None:
    """
    Polling mode: Check all boards for new tasks since last run.
    For each task in the Form Requests group with no Dropbox link:
      - Department recognized → auto-create folder immediately
      - Department unrecognized → log it (shows in Needs Attention in the web UI)
    Updates state.json timestamps at the end.
    Respects auto_enabled flag from web UI.
    """
    st = state.load_state()

    if st.get("auto_enabled") is False:
        print("Auto-create is disabled. Enable in the web UI to resume.")
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    subdomain = config.get("monday_subdomain", "")

    for board_id, board_config in config["boards"].items():
        board = Board(board_id, board_config)
        since = st.get(board_id, "2000-01-01T00:00:00+00:00")
        print(f"\n[{board.name}] Checking for new items since {since}...")

        try:
            items = monday_client.get_new_items(board_id, since)
            print(f"  Found {len(items)} new item(s).")

            for item in items:
                task = Task(item, board, subdomain)

                if not task.is_new:
                    print(f"  → Skipping '{task.task_name}' (group: '{task.group_title}')")
                    continue

                if task.has_folder:
                    print(f"  ↷ Skipping '{task.task_name}' — already has a Dropbox link.")
                    continue

                if board.is_ambiguous(task.department):
                    print(f"  ⚠ '{task.task_name}' — department '{task.department}' not recognized, needs manual review.")
                    continue

                try:
                    process_item(item, board_id, board_config, config)
                except Exception as e:
                    print(f"  ✗ Failed to auto-create folder for '{task.task_name}': {e}", file=sys.stderr)

        except Exception as e:
            print(f"  ✗ Could not fetch items from {board.name}: {e}", file=sys.stderr)

    for board_id in config["boards"]:
        st[board_id] = now_iso

    state.save_state(st)
    print("\nDone. state.json updated.")


def run_manual(url: str, config: dict, force: bool) -> None:
    """
    Manual mode: Create a Dropbox folder for a specific task by URL.
    Automatically looks up the board config from the URL.
    """
    print(f"Manual mode: fetching task from URL...")

    try:
        board_id, item_id, item = monday_client.get_item_by_url(url)
    except Exception as e:
        print(f"✗ Could not parse URL: {e}", file=sys.stderr)
        raise

    board_config = config["boards"].get(board_id)
    if not board_config:
        raise ValueError(f"Board {board_id} not configured in config.json")

    process_item(item, board_id, board_config, config, force=force)
    print("\nDone.")


def run_all(config: dict) -> None:
    """
    Backfill mode: Process ALL items across all boards that are missing a Dropbox link.
    Items that already have links are skipped automatically by process_item.
    Does not update state.json.
    """
    subdomain = config.get("monday_subdomain", "")

    for board_id, board_config in config["boards"].items():
        board = Board(board_id, board_config)
        print(f"\n[{board.name}] Fetching all items...")

        try:
            items = monday_client.get_new_items(board_id, "2000-01-01T00:00:00+00:00")
            print(f"  Found {len(items)} item(s) total.")

            for item in items:
                task = Task(item, board, subdomain)
                try:
                    process_item(item, board_id, board_config, config)
                except Exception as e:
                    print(f"  ✗ Error processing '{task.task_name}': {e}", file=sys.stderr)

        except Exception as e:
            print(f"  ✗ Could not fetch items from {board.name}: {e}", file=sys.stderr)

    print("\nDone.")
