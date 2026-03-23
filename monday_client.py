"""
monday_client.py — Monday.com business logic and public API

Provides high-level functions for fetching items and writing data back to Monday.com.
Uses the monday_api module for low-level GraphQL communication.

Depends on: monday_api.py
Used by: main.py
"""

import re
import json
import monday_api

# Column IDs we need to fetch for both boards
COLUMN_IDS = [
    "label", "label9", "single_selectu06tevn", "status_1__1",
    "single_selectrz7zhou", "single_selectrz7230p", "link4__1", "link0__1", "status"
]


def get_new_items(board_id: str, since_iso: str) -> list:
    """
    Fetch all items created on a board after a given timestamp.

    board_id   — Monday.com board ID (string)
    since_iso  — ISO 8601 timestamp string, e.g. '2026-03-18T00:00:00Z'

    Returns list of item dicts with: id, name, created_at, column_values
    """
    query = """
    query ($boardId: ID!, $columnIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: 100) {
          items {
            id
            name
            created_at
            group {
              title
            }
            column_values(ids: $columnIds) {
              id
              text
              value
            }
          }
        }
      }
    }
    """
    data = monday_api.run_query(query, {"boardId": board_id, "columnIds": COLUMN_IDS})
    all_items = data["boards"][0]["items_page"]["items"]

    # Filter to only items created after the given timestamp
    return [item for item in all_items if item["created_at"] > since_iso]


def get_item_by_id(item_id: str) -> dict:
    """
    Fetch a specific item by its Monday.com item ID.

    item_id — Monday.com item ID string

    Returns item dict with: id, name, created_at, column_values
    Raises RuntimeError if item is not found.
    """
    query = """
    query ($itemId: ID!, $columnIds: [String!]) {
      items(ids: [$itemId]) {
        id
        name
        created_at
        column_values(ids: $columnIds) {
          id
          text
          value
        }
      }
    }
    """
    data = monday_api.run_query(query, {"itemId": item_id, "columnIds": COLUMN_IDS})
    items = data.get("items", [])

    if not items:
        raise RuntimeError(f"No item found with ID {item_id}")

    return items[0]


def get_item_by_url(url: str) -> tuple:
    """
    Fetch a specific item by its Monday.com task URL.

    Example URL: https://particle-for-men.monday.com/boards/5433027071/pulses/11510130424

    Returns tuple of (board_id, item_id, item_dict)
    Raises ValueError if URL format is invalid.
    """
    match = re.search(r"/boards/(\d+)/pulses/(\d+)", url)
    if not match:
        raise ValueError(f"Invalid Monday.com URL format: {url}")

    board_id = match.group(1)
    item_id = match.group(2)
    item = get_item_by_id(item_id)

    return board_id, item_id, item


def update_dropbox_link(item_id: str, board_id: str, column_id: str, link_url: str) -> None:
    """
    Write a Dropbox folder URL back to a Monday.com item's link column.

    item_id   — Monday.com item ID
    board_id  — Monday.com board ID (required by API)
    column_id — Column ID to update (e.g. 'link4__1')
    link_url  — Dropbox shared folder URL
    """
    column_value = json.dumps({"url": link_url, "text": "Dropbox Link"})

    mutation = """
    mutation ($itemId: ID!, $boardId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(item_id: $itemId, board_id: $boardId, column_id: $columnId, value: $value) {
        id
      }
    }
    """
    monday_api.run_query(
        mutation,
        {"itemId": item_id, "boardId": board_id, "columnId": column_id, "value": column_value}
    )


def get_items_by_ids(item_ids: list) -> list:
    """
    Fetch multiple items by their Monday.com item IDs.

    item_ids — List of item ID strings

    Returns list of item dicts with: id, name, created_at, column_values
    """
    query = """
    query ($itemIds: [ID!], $columnIds: [String!]) {
      items(ids: $itemIds) {
        id
        name
        created_at
        column_values(ids: $columnIds) {
          id
          text
          value
        }
      }
    }
    """
    data = monday_api.run_query(query, {"itemIds": item_ids, "columnIds": COLUMN_IDS})
    return data.get("items", [])


def get_column_value(item: dict, column_id: str) -> str:
    """
    Extract the text value of a specific column from an item dict.

    item      — Item dict returned by get_new_items or get_item_by_url
    column_id — Monday.com column ID to look up

    Returns the column value as a string, or empty string if not found.
    """
    for col in item.get("column_values", []):
        if col["id"] == column_id:
            return (col.get("text") or "").strip()
    return ""
