"""
web_auto_creator.py — Auto-creator web UI helpers

Fetches all Monday.com tasks missing a Dropbox link and classifies
each as 'ready' (department rule found) or 'ambiguous' (no matching rule).
Also handles creating a Dropbox folder at a custom path for ambiguous tasks.

Depends on: task.py, dashboard.py, monday_client.py, dropbox_client.py, state.py, core.py
Used by: web/app/api/auto-create/route.ts (via python3 -c)
"""

import json
import sys
from datetime import datetime

import monday_client
import dropbox_client
import state
import core
from dashboard import Board
from task import Task


def get_pending_tasks_with_status() -> None:
    """
    Fetch all tasks missing Dropbox links from all boards, then classify each.
    Prints JSON: { "ready": [...], "ambiguous": [...] }

    ready task fields:    id, boardId, boardName, taskName, mondayUrl, previewPath
    ambiguous task fields: id, boardId, boardName, taskName, mondayUrl, department, columnValues
    """
    config = state.load_config()
    subdomain = config.get("monday_subdomain", "")
    ready = []
    ambiguous = []
    approved_with_folder = []
    group_warnings = []

    for board_id, board_config in config["boards"].items():
        board = Board(board_id, board_config)

        try:
            items = monday_client.get_new_items(board_id, "2000-01-01T00:00:00+00:00")

            # Validate that the configured form_requests_group exists on this board
            found_groups = {
                (item.get("group") or {}).get("title", "")
                for item in items
                if (item.get("group") or {}).get("title")
            }
            if found_groups and not any(
                g.lower() == board.form_requests_group for g in found_groups
            ):
                group_warnings.append({
                    "boardId": board_id,
                    "boardName": board.name,
                    "configured": board_config.get("form_requests_group", "Form Requests"),
                    "foundGroups": sorted(found_groups),
                })

            for item in items:
                task = Task(item, board, subdomain)

                if task.has_folder:
                    # Already has a folder — surface if Approved (not completed)
                    if task.is_approved and not task.is_completed:
                        approved_with_folder.append({
                            "id": task.id,
                            "boardId": task.board_id,
                            "boardName": task.board_name,
                            "taskName": task.task_name,
                            "mondayUrl": task.monday_url,
                            "dropboxLink": task.dropbox_link,
                        })
                    continue

                if task.is_completed:
                    continue

                if board.is_ambiguous(task.department):
                    category = board.get_category(task.product) if task.product else ""
                    from dashboard import _get_date_folder
                    date_folder = _get_date_folder(datetime.utcnow())

                    ambiguous.append({
                        "id": task.id,
                        "boardId": task.board_id,
                        "boardName": task.board_name,
                        "taskName": task.task_name,
                        "mondayUrl": task.monday_url,
                        "department": task.department,
                        "status": task.status,
                        "isApproved": task.is_approved,
                        "isNew": task.is_new,
                        "createdAt": task.created_at,
                        "columnValues": {
                            "product": task.product,
                            "platform": task.platform,
                            "category": category,
                            "media_type": board.media_type,
                            "date": date_folder,
                        },
                    })
                else:
                    preview = ""
                    try:
                        preview = board.build_path(task.raw_item(), config["dropbox_root"])
                    except Exception:
                        pass

                    ready.append({
                        "id": task.id,
                        "boardId": task.board_id,
                        "boardName": task.board_name,
                        "taskName": task.task_name,
                        "mondayUrl": task.monday_url,
                        "previewPath": preview,
                        "status": task.status,
                        "isApproved": task.is_approved,
                        "isNew": task.is_new,
                        "createdAt": task.created_at,
                    })

        except Exception as e:
            print(f"Error fetching {board.name}: {e}", file=sys.stderr)

    print(json.dumps({
        "ready": ready,
        "ambiguous": ambiguous,
        "approvedWithFolder": approved_with_folder,
        "groupWarnings": group_warnings,
    }))


def auto_create_ready_task(board_id: str, item_id: str) -> None:
    """
    Auto-create a Dropbox folder for a ready task (department rule matched)
    by calling the same process_item() used everywhere else in the app.
    Prints JSON: { "success": bool, "path": str } or { "success": false, "error": str }
    """
    config = state.load_config()
    board_config = config["boards"].get(board_id)

    if not board_config:
        print(json.dumps({"success": False, "error": f"Board {board_id} not found in config"}))
        return

    try:
        board = Board(board_id, board_config)
        item = monday_client.get_item_by_id(item_id)
        path = board.build_path(item, config["dropbox_root"])
        core.process_item(item, board_id, board_config, config)
        print(json.dumps({"success": True, "path": path}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


def create_folder_at_path(board_id: str, item_id: str, custom_path: str) -> None:
    """
    Create a Dropbox folder at a manually-chosen path for an ambiguous task,
    then write the shared link back to the Monday.com item.
    Prints JSON: { "success": bool, "link": str } or { "success": false, "error": str }
    """
    config = state.load_config()
    board_config = config["boards"].get(board_id)

    if not board_config:
        print(json.dumps({"success": False, "error": f"Board {board_id} not found in config"}))
        return

    try:
        board = Board(board_id, board_config)
        dropbox_client.create_folder(custom_path)
        link_url = dropbox_client.get_shared_link(custom_path)
        monday_client.update_dropbox_link(item_id, board_id, board.dropbox_link_column, link_url)
        print(json.dumps({"success": True, "link": link_url}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
