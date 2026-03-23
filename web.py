"""
web.py — Web UI and programmatic workflows

Implements workflows used by the web UI:
- list_missing: Generate JSON list of tasks without Dropbox links
- run_items: Process specific items selected by user
- verify_link: Preview what folder path would be created for a task

Depends on: task.py, dashboard.py, monday_client.py, core.py, state.py
Used by: main.py
"""

import json
import sys

import monday_client
import core
import state
from dashboard import Board
from task import Task


def list_missing(config: dict) -> None:
    """
    List mode: Output JSON array of tasks missing Dropbox links.
    Used by the web UI's /api/tasks endpoint to populate the task list.

    Output format: [{ id, boardId, boardName, mediaType, name, mondayUrl, previewPath }, ...]
    """
    subdomain = config.get("monday_subdomain", "")
    results = []

    for board_id, board_config in config["boards"].items():
        board = Board(board_id, board_config)

        try:
            items = monday_client.get_new_items(board_id, "2000-01-01T00:00:00+00:00")

            for item in items:
                task = Task(item, board, subdomain)

                if task.has_folder or task.is_completed:
                    continue

                preview = ""
                try:
                    preview = board.build_path(task.raw_item(), config["dropbox_root"])
                except Exception:
                    pass

                results.append({
                    "id": task.id,
                    "boardId": task.board_id,
                    "boardName": task.board_name,
                    "mediaType": board.media_type,
                    "name": item["name"],  # Full raw name (not trimmed) for this list
                    "mondayUrl": task.monday_url,
                    "previewPath": preview,
                })

        except Exception as e:
            print(f"Error fetching {board.name}: {e}", file=sys.stderr)

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

    Returns dict with: success (bool), taskName, previewPath, or error message
    """
    config = state.load_config()
    board_config = config["boards"].get(board_id)

    if not board_config:
        return {"success": False, "error": f"Board {board_id} not found"}

    try:
        board = Board(board_id, board_config)
        item = monday_client.get_item_by_id(item_id)
        task = Task(item, board, config.get("monday_subdomain", ""))
        preview_path = board.build_path(task.raw_item(), config["dropbox_root"])

        return {
            "success": True,
            "taskName": task.task_name,
            "previewPath": preview_path,
            "boardId": board_id,
            "itemId": item_id,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}
