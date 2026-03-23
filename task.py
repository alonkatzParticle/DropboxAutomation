"""
task.py — Task object representing a single Monday.com item

A Task wraps the raw API dict returned by Monday.com and holds a reference
to the Board it belongs to (has-a relationship). All derived properties
(task name, department, status, UI state) are computed here in one place
instead of being scattered across web_auto_creator.py, core.py, etc.

Depends on: dashboard.py (Board), monday_client.py
Used by: web_auto_creator.py, core.py, web.py
"""

import monday_client


class Task:
    """
    Represents a single Monday.com task item.

    A Task belongs to a Board (has-a) and reads its board's settings
    through that reference. Callers create a Board first, then wrap
    each raw item dict in a Task using that board.
    """

    def __init__(self, item: dict, board, subdomain: str = ""):
        """
        Create a Task from a raw Monday.com item dict and its Board.

        item      — Raw item dict from monday_client.get_new_items() or get_item_by_id()
        board     — The Board object this task belongs to
        subdomain — Monday.com subdomain (e.g. "particle-for-men") for building URLs
        """
        # Store the raw item so callers that need it (e.g. build_path) can get it
        self._item = item

        # Has-a: this task belongs to a board
        self.board = board
        self.board_id = board.board_id
        self.board_name = board.name
        self.subdomain = subdomain

        # ── Raw Monday.com fields ──────────────────────────────────────────────
        self.id = item["id"]
        self.created_at = item.get("created_at", "")

        # Group title — lowercased for easy comparison
        self.group_title = (item.get("group") or {}).get("title", "").lower()

        # ── Task name — use the segment after the last " | " if present ────────
        raw_name = item.get("name", "Untitled Task")
        if " | " in raw_name:
            raw_name = raw_name.rsplit(" | ", 1)[1]
        self.task_name = raw_name.strip()

        # ── Column values — read using the board's column ID mappings ──────────
        self.department = (
            monday_client.get_column_value(item, board.columns.get("department", ""))
            or board.fallback.get("department", "")
        )
        self.product = (
            monday_client.get_column_value(item, board.columns.get("product", ""))
            or board.fallback.get("product", "")
        )
        self.platform = (
            monday_client.get_column_value(item, board.columns.get("platform", ""))
            or board.fallback.get("platform", "")
        )
        self.status = monday_client.get_column_value(item, board.status_column).lower()
        self.dropbox_link = monday_client.get_column_value(item, board.dropbox_link_column)

    # ── UI state properties — derived from board settings ─────────────────────

    @property
    def has_folder(self) -> bool:
        """True if this task already has a Dropbox link written to Monday.com."""
        return bool(self.dropbox_link)

    @property
    def is_new(self) -> bool:
        """True if this task is in the board's configured Form Requests group."""
        return self.group_title == self.board.form_requests_group

    @property
    def is_approved(self) -> bool:
        """True if this task's status matches the board's approved label."""
        return self.status == self.board.approved_label

    @property
    def is_completed(self) -> bool:
        """True if this task's status is one of the board's completed labels."""
        return self.status in self.board.completed_labels

    @property
    def monday_url(self) -> str:
        """Full Monday.com URL to this task."""
        return f"https://{self.subdomain}.monday.com/boards/{self.board_id}/pulses/{self.id}"

    def raw_item(self) -> dict:
        """
        Return the original raw item dict from the Monday.com API.
        Used by Board.build_path() which still expects the raw format.
        """
        return self._item

    def __repr__(self) -> str:
        return f"Task(id={self.id}, name={self.task_name!r}, board={self.board_name!r})"
