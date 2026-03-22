"""
web.py — Web UI and programmatic workflows

Implements workflows used by the web UI:
- list_missing: Generate JSON list of tasks without Dropbox links
- run_items: Process specific items selected by user

Depends on: monday_client.py, dropbox_client.py, folder_builder.py, core.py
Used by: main.py
"""

import json
import sys

import monday_client
import dashboard
import core
import state


def list_missing(config: dict) -> None:
    """
    List mode: Output JSON array of tasks missing Dropbox links.
    Used by the web UI's /api/tasks endpoint to populate the task list.

    Output format: [{ id, boardId, boardName, mediaType, name, mondayUrl, previewPath }, ...]
    """
    subdomain = config.get("monday_subdomain", "")
    results = []

    for board_id, board_config in config["boards"].items():
        link_col = board_config["dropbox_link_column"]
        status_col = board_config.get("status_column", "status")
        completed = [lbl.lower() for lbl in board_config.get("completed_labels", ["Done"])]

        try:
            items = monday_client.get_new_items(board_id, "2000-01-01T00:00:00+00:00")

            for item in items:
                # Skip if already has a link
                if monday_client.get_column_value(item, link_col):
                    continue

                # Skip if status is completed
                status_val = monday_client.get_column_value(item, status_col).lower()
                if status_val in completed:
                    continue

                # Compute preview path
                preview = ""
                try:
                    db = dashboard.Dashboard(board_id, board_config)
                    preview = db.build_path(item, config["dropbox_root"])
                except Exception:
                    pass  # Silently omit preview if it fails

                results.append({
                    "id": item["id"],
                    "boardId": board_id,
                    "boardName": board_config["name"],
                    "mediaType": board_config["media_type"],
                    "name": item["name"],
                    "mondayUrl": f"https://{subdomain}.monday.com/boards/{board_id}/pulses/{item['id']}",
                    "previewPath": preview,
                })

        except Exception as e:
            print(f"Error fetching {board_config['name']}: {e}", file=sys.stderr)

    print(json.dumps(results))


def run_items(items_arg: str, config: dict) -> None:
    """
    Items mode: Process specific items given as comma-separated 'boardId:itemId' pairs.
    Used by the web UI when user selects individual tasks.

    items_arg — String like '5433027071:12345,8036329818:67890'
    """
    pairs = [p.strip() for p in items_arg.split(",") if p.strip()]

    if not pairs:
        print("✗ No items provided", file=sys.stderr)
        return

    for pair in pairs:
        try:
            board_id, item_id = pair.split(":", 1)
        except ValueError:
            print(f"✗ Invalid format '{pair}' — expected boardId:itemId", file=sys.stderr)
            continue

        board_config = config["boards"].get(board_id)
        if not board_config:
            print(f"✗ Board {board_id} not found in config.json", file=sys.stderr)
            continue

        try:
            items = monday_client.get_items_by_ids([item_id])
            if not items:
                print(f"✗ Item {item_id} not found", file=sys.stderr)
                continue

            core.process_item(items[0], board_id, board_config, config, force=False)

        except Exception as e:
            print(f"✗ Error processing item {item_id}: {e}", file=sys.stderr)

    print("\nDone.")


def verify_link(board_id: str, item_id: str) -> dict:
    """
    Verify a Monday.com task and return the folder path that would be created.

    Used by the web UI's /api/verify-link endpoint for preview before creation.

    board_id  — Monday.com board ID
    item_id   — Monday.com item ID

    Returns dict with: success (bool), taskName, previewPath, or error message
    """
    config = state.load_config()
    board_config = config["boards"].get(board_id)

    if not board_config:
        return {"success": False, "error": f"Board {board_id} not found"}

    try:
        item = monday_client.get_item_by_id(item_id)
        db = dashboard.Dashboard(board_id, board_config)
        preview_path = db.build_path(item, config["dropbox_root"])

        return {
            "success": True,
            "taskName": item["name"],
            "previewPath": preview_path,
            "boardId": board_id,
            "itemId": item_id
        }

    except Exception as e:
        return {"success": False, "error": str(e)}
