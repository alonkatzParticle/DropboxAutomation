"""
web_auto_creator.py — Auto-creator web UI helpers

Fetches all Monday.com tasks missing a Dropbox link and classifies
each as 'ready' (department rule found) or 'ambiguous' (no matching rule).
Also handles creating a Dropbox folder at a custom path for ambiguous tasks.

Depends on: monday_client.py, dropbox_client.py, folder_builder.py, state.py
Used by: web/app/api/auto-create/route.ts (via python3 -c)
"""

import json
import sys
from datetime import datetime

import monday_client
import dropbox_client
import dashboard
import state


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
    approved_with_folder = []  # Tasks that are Approved but already have a Dropbox folder

    for board_id, board_config in config["boards"].items():
        link_col = board_config["dropbox_link_column"]
        status_col = board_config.get("status_column", "status")
        completed = [lbl.lower() for lbl in board_config.get("completed_labels", ["Done"])]
        approved_label = board_config.get("approved_label", "Approved").lower()
        columns = board_config["columns"]
        
        db = dashboard.Dashboard(board_id, board_config)

        try:
            items = monday_client.get_new_items(board_id, "2000-01-01T00:00:00+00:00")

            for item in items:
                existing_link = monday_client.get_column_value(item, link_col)
                status_val = monday_client.get_column_value(item, status_col).lower()

                if existing_link:
                    # Task already has a folder — if it's Approved (and not completed), surface it
                    # so the user knows we skipped creating a new one for it.
                    if status_val == approved_label and status_val not in completed:
                        raw_name = item.get("name", "Untitled Task")
                        if " | " in raw_name:
                            raw_name = raw_name.rsplit(" | ", 1)[1]
                        monday_url = f"https://{subdomain}.monday.com/boards/{board_id}/pulses/{item['id']}"
                        approved_with_folder.append({
                            "id": item["id"],
                            "boardId": board_id,
                            "boardName": board_config["name"],
                            "taskName": raw_name.strip(),
                            "mondayUrl": monday_url,
                            "dropboxLink": existing_link,
                        })
                    continue  # Either way, skip normal ready/ambiguous flow

                # Skip if the task is marked as completed
                if status_val in completed:
                    continue

                monday_url = f"https://{subdomain}.monday.com/boards/{board_id}/pulses/{item['id']}"
                dept = monday_client.get_column_value(item, columns.get("department", "")) or db.fallback.get("department", "")
                product = monday_client.get_column_value(item, columns.get("product", "")) or ""
                platform = monday_client.get_column_value(item, columns.get("platform", "")) or ""

                # Task name = rightmost segment after the last " | " in the full name
                raw_name = item.get("name", "Untitled Task")
                if " | " in raw_name:
                    raw_name = raw_name.rsplit(" | ", 1)[1]
                task_name = raw_name.strip()

                if db.is_ambiguous(dept):
                    # Compute extra column values used by PathBuilder to pre-fill each segment
                    category = db.get_category(product) if product else ""
                    date_folder = dashboard._get_date_folder(datetime.utcnow())
                    media_type = board_config.get("media_type", "")

                    ambiguous.append({
                        "id": item["id"],
                        "boardId": board_id,
                        "boardName": board_config["name"],
                        "taskName": task_name,
                        "mondayUrl": monday_url,
                        "department": dept,
                        "status": status_val,
                        "isApproved": status_val == approved_label,
                        "createdAt": item.get("created_at", ""),
                        "columnValues": {
                            "product": product,
                            "platform": platform,
                            "category": category,
                            "media_type": media_type,
                            "date": date_folder,
                        },
                    })
                else:
                    # Build the preview path for ready tasks
                    preview = ""
                    try:
                        preview = db.build_path(item, config["dropbox_root"])
                    except Exception:
                        pass

                    ready.append({
                        "id": item["id"],
                        "boardId": board_id,
                        "boardName": board_config["name"],
                        "taskName": task_name,
                        "mondayUrl": monday_url,
                        "previewPath": preview,
                        "status": status_val,
                        "isApproved": status_val == approved_label,
                        "createdAt": item.get("created_at", ""),
                    })

        except Exception as e:
            print(f"Error fetching {board_config['name']}: {e}", file=sys.stderr)

    print(json.dumps({"ready": ready, "ambiguous": ambiguous, "approvedWithFolder": approved_with_folder}))


def create_folder_at_path(board_id: str, item_id: str, custom_path: str) -> None:
    """
    Create a Dropbox folder at a manually-chosen path for an ambiguous task,
    then write the shared link back to the Monday.com item.
    Prints JSON: { "success": bool, "link": str } or { "success": false, "error": str }

    board_id    — Monday.com board ID
    item_id     — Monday.com item ID
    custom_path — Full Dropbox path chosen by the user (e.g. /Creative 2026/New Dept/Ad V1)
    """
    config = state.load_config()
    board_config = config["boards"].get(board_id)

    if not board_config:
        print(json.dumps({"success": False, "error": f"Board {board_id} not found in config"}))
        return

    try:
        dropbox_client.create_folder(custom_path)
        link_url = dropbox_client.get_shared_link(custom_path)
        link_col = board_config["dropbox_link_column"]
        monday_client.update_dropbox_link(item_id, board_id, link_col, link_url)
        print(json.dumps({"success": True, "link": link_url}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
