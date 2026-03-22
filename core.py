"""
core.py — Core processing workflows

Implements the main automation workflows:
- Polling: Check for new tasks and process them
- Manual: Process a single task by URL
- Backfill: Process ALL tasks missing links

Depends on: monday_client.py, dropbox_client.py, folder_builder.py, state.py
Used by: main.py
"""

import sys
from datetime import datetime, timezone

import monday_client
import dropbox_client
import dashboard
import state


def process_item(item: dict, board_id: str, board_config: dict, config: dict, force: bool = False) -> None:
    """
    Run the complete automation for a single Monday.com item:
    1. Check if Dropbox link exists (skip unless --force)
    2. Build folder path from column values
    3. Create folder in Dropbox
    4. Get shareable link
    5. Write link back to Monday.com
    """
    item_id = item["id"]
    item_name = item["name"]
    link_column = board_config["dropbox_link_column"]

    # Skip if link already exists (unless forced)
    existing_link = monday_client.get_column_value(item, link_column)
    if existing_link and not force:
        print(f"  ↷ Skipping '{item_name}' — Dropbox link already set.")
        return

    print(f"\n→ Processing: {item_name}")

    try:
        # Build the Dropbox folder path
        db = dashboard.Dashboard(board_id, board_config)
        path = db.build_path(item, config["dropbox_root"])
        print(f"  Path: {path}")

        # Create the folder in Dropbox
        dropbox_client.create_folder(path)

        # Get a shareable link
        link_url = dropbox_client.get_shared_link(path)
        print(f"  Link: {link_url}")

        # Write the link back to Monday.com
        monday_client.update_dropbox_link(item_id, board_id, link_column, link_url)
        print(f"  ✓ Link written to Monday.com task.")

    except Exception as e:
        print(f"  ✗ Error: {e}", file=sys.stderr)
        raise


def run_polling(config: dict) -> None:
    """
    Polling mode: Check all boards for new tasks created since last run.
    Updates state.json at the end. Respects auto_enabled flag from web UI.
    """
    st = state.load_state()

    # Respect auto_enabled flag set by web UI
    if st.get("auto_enabled") is False:
        print("Auto-create is disabled. Enable in the web UI to resume.")
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    for board_id, board_config in config["boards"].items():
        board_name = board_config["name"]
        since = st.get(board_id, "2000-01-01T00:00:00+00:00")
        print(f"\n[{board_name}] Checking for new items since {since}...")

        try:
            items = monday_client.get_new_items(board_id, since)
            print(f"  Found {len(items)} new item(s).")

            for item in items:
                try:
                    process_item(item, board_id, board_config, config)
                except Exception as e:
                    print(f"  ✗ Error processing '{item.get('name', item['id'])}': {e}", file=sys.stderr)

        except Exception as e:
            print(f"  ✗ Could not fetch items from {board_name}: {e}", file=sys.stderr)

    # Update timestamps for next run
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
    for board_id, board_config in config["boards"].items():
        board_name = board_config["name"]
        print(f"\n[{board_name}] Fetching all items...")

        try:
            # Very old date returns all items
            items = monday_client.get_new_items(board_id, "2000-01-01T00:00:00+00:00")
            print(f"  Found {len(items)} item(s) total.")

            for item in items:
                try:
                    process_item(item, board_id, board_config, config)
                except Exception as e:
                    print(f"  ✗ Error processing '{item.get('name', item['id'])}': {e}", file=sys.stderr)

        except Exception as e:
            print(f"  ✗ Could not fetch items from {board_name}: {e}", file=sys.stderr)

    print("\nDone.")
