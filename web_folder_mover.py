"""
web_folder_mover.py — Backend logic for the Folder Mover web page.

Handles two operations:
  1. check_task_folder: Read a task, get its current Dropbox folder path (if any),
     and compute a proposed new path from its column values.
  2. move_task_folder: Move the folder in Dropbox and update the Monday.com link.

Split from web.py to keep each file under 150 lines (per CLAUDE.md rules).

Depends on: monday_client.py, dropbox_client.py, dashboard.py, state.py
"""

import json
import monday_client
import dropbox_client
import state
from dashboard import Board


def _get_link_url(item: dict, column_id: str) -> str:
    """
    Extract the URL from a Monday.com link-type column.
    Link columns store JSON like {"url": "https://...", "text": "Dropbox Link"}.
    The plain get_column_value() function returns the text, not the URL.

    item      — Item dict from monday_client
    column_id — The link column ID (e.g. 'link4__1')

    Returns the URL string, or empty string if not set.
    """
    for col in item.get("column_values", []):
        if col.get("id") == column_id:
            raw = col.get("value")
            if raw:
                try:
                    return json.loads(raw).get("url", "")
                except Exception:
                    pass
    return ""


def check_task_folder(board_id: str, item_id: str) -> dict:
    """
    Read a task's current state and return everything the Folder Mover page needs.

    board_id — Monday.com board ID string
    item_id  — Monday.com item ID string

    Returns dict with:
      success, taskName, boardId, itemId, hasFolder, proposedPath, dropboxRoot
      If hasFolder is True: also currentLink, currentPath, currentFolderName
    """
    config = state.load_config()
    board_config = config["boards"].get(str(board_id))

    if not board_config:
        return {"success": False, "error": f"Board {board_id} not found in config"}

    try:
        item = monday_client.get_item_by_id(item_id)
    except Exception as e:
        return {"success": False, "error": f"Could not fetch task: {e}"}

    board = Board(str(board_id), board_config)

    try:
        proposed_path = board.build_path(item, config["dropbox_root"])
    except Exception as e:
        proposed_path = ""

    current_link = _get_link_url(item, board.dropbox_link_column)

    result = {
        "success": True,
        "taskName": item["name"],
        "boardId": str(board_id),
        "itemId": str(item_id),
        "hasFolder": bool(current_link),
        "proposedPath": proposed_path,
        "dropboxRoot": config.get("dropbox_root", ""),
    }

    if current_link:
        result["currentLink"] = current_link
        # Try to resolve the shared link to its actual folder path
        current_path = dropbox_client.get_folder_path_from_link(current_link)
        if current_path:
            result["currentPath"] = current_path
            # The folder's own name is the last segment of its path
            result["currentFolderName"] = current_path.rstrip("/").split("/")[-1]

    return result


def move_task_folder(board_id: str, item_id: str, new_path: str) -> dict:
    """
    Move a task's Dropbox folder to a new path, then update the Monday.com link.

    board_id — Monday.com board ID string
    item_id  — Monday.com item ID string
    new_path — Full Dropbox destination path (e.g. '/Creative/Marketing Ads/001_Jan/Task Name')

    Returns dict with: success, newLink, newPath — or success, error
    """
    config = state.load_config()
    board_config = config["boards"].get(str(board_id))

    if not board_config:
        return {"success": False, "error": f"Board {board_id} not found in config"}

    try:
        item = monday_client.get_item_by_id(item_id)
    except Exception as e:
        return {"success": False, "error": f"Could not fetch task: {e}"}

    board = Board(str(board_id), board_config)
    current_link = _get_link_url(item, board.dropbox_link_column)

    if not current_link:
        return {"success": False, "error": "This task has no existing Dropbox folder to move"}

    old_path = dropbox_client.get_folder_path_from_link(current_link)
    if not old_path:
        return {"success": False, "error": "Could not determine the current folder path from the Dropbox link"}

    if not dropbox_client.move_folder(old_path, new_path):
        return {"success": False, "error": "Dropbox folder move failed — check that the destination path is valid"}

    new_link = dropbox_client.get_shared_link(new_path)
    if not new_link:
        return {"success": False, "error": "Folder moved but could not generate a new shared link"}

    monday_client.update_dropbox_link(item_id, str(board_id), board.dropbox_link_column, new_link)

    return {"success": True, "newLink": new_link, "newPath": new_path}
