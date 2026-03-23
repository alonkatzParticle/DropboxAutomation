"""
dashboard.py — Dashboard configuration and path building logic.

Encapsulates all rule-processing and routing for a specific Monday.com board.
Replaces the old global folder_builder.py script.

Depends on: monday_client.py
Used by: core.py, web_auto_creator.py, web_folder_mover.py
"""

import re
import sys
from datetime import datetime
import monday_client

def _sanitize(name: str) -> str:
    """
    Clean a string so it's safe to use as a Dropbox folder name.
    Removes characters Dropbox doesn't allow: \\ * ? " < >
    """
    name = re.sub(r'[\\*?"<>]', "", name)
    return name.strip()

def _get_date_folder(now: datetime) -> str:
    """
    Compute the date folder name based on a running month index starting
    at January 2026 = 01.
    """
    base_year, base_month = 2026, 1
    months_elapsed = (now.year - base_year) * 12 + (now.month - base_month)
    index = months_elapsed + 1
    return f"{index:02d}_{now.strftime('%B')} {now.strftime('%Y')}"

class Board:
    """
    Represents a specific Monday.com board.
    Holds the board's settings, department rules, and path-building logic.
    """
    def __init__(self, board_id: str, config: dict):
        self.board_id = board_id
        self.config = config
        self.name = config.get("name", "Unknown Board")
        self.media_type = config.get("media_type", "")
        self.columns = config.get("columns", {})
        self.bundle_keywords = config.get("bundle_keywords", [])
        self.other_keywords = config.get("other_keywords", [])
        self.fallback = config.get("fallback_values", {})
        self.department_rules = config.get("department_rules", {})
        self.fixed_level_values = config.get("fixed_level_values", {})

        # Task-level settings — stored on Board so Task can read them via self.board
        self.dropbox_link_column = config.get("dropbox_link_column", "")
        self.status_column = config.get("status_column", "status")
        self.approved_label = config.get("approved_label", "Approved").lower()
        self.completed_labels = [
            lbl.lower() for lbl in config.get("completed_labels", ["Done"])
        ]
        self.form_requests_group = config.get("form_requests_group", "Form Requests").lower()

    def get_category(self, product_name: str) -> str:
        if product_name in self.other_keywords:
            return "Other"
        product_lower = product_name.lower()
        if any(kw.lower() in product_lower for kw in self.bundle_keywords):
            return "Bundles"
        return "Products"

    def get_department_rule(self, department_raw: str) -> dict:
        if department_raw in self.department_rules:
            return self.department_rules[department_raw]
        
        for key, val in self.department_rules.items():
            if key.lower() == department_raw.lower():
                return val

        print(f"  ⚠ Unknown department '{department_raw}' on board {self.board_id} — defaulting to fallback.", file=sys.stderr)
        return {
            "dropbox_folder": self.fallback.get("department", "Marketing Ads"),
            "path_template": ["dept_folder", "category", "product", "media_type", "platform", "date", "task_name"]
        }

    def is_ambiguous(self, department_raw: str) -> bool:
        if department_raw in self.department_rules:
            return False
        for key in self.department_rules.keys():
            if key.lower() == department_raw.lower():
                return False
        return True

    def get_path_template(self, rule: dict) -> list:
        return rule.get("path_template", [])

    def resolve_segment(self, segment: str, item: dict, rule: dict,
                        product_raw: str, department_raw: str) -> str:
        # ── Computed segments (not from a Monday column) ──────────────────────
        # dept_folder kept as backward-compat alias; new boards use "department" directly
        if segment == "dept_folder":
            return rule.get("dropbox_folder") or _sanitize(department_raw)

        if segment == "category":
            return self.get_category(product_raw)

        if segment == "media_type":
            return self.media_type

        if segment == "date":
            return _get_date_folder(datetime.utcnow())

        if segment == "task_name":
            raw_name = item.get("name", "Untitled Task")
            if " | " in raw_name:
                raw_name = raw_name.rsplit(" | ", 1)[1]
            return _sanitize(raw_name)

        # ── Fixed override from the department rule ───────────────────────────
        fixed = rule.get("fixed_values", {}).get(segment)
        if fixed:
            return _sanitize(fixed)

        # ── Board-level fixed value (set in the board-setup wizard) ───────────
        board_fixed = self.fixed_level_values.get(segment)
        if board_fixed:
            return _sanitize(board_fixed)

        # ── Dynamic: look up the Monday column mapped to this segment name ────
        col_id = self.columns.get(segment, "")
        if not col_id:
            return self.fallback.get(segment, "")
        raw = monday_client.get_column_value(item, col_id) or self.fallback.get(segment, "")

        # For the "department" segment: if the matched rule has a dropbox_folder
        # rename (e.g. "GT" → "Growth Team"), use that instead of the raw value.
        if segment == "department" and rule.get("dropbox_folder"):
            return _sanitize(rule["dropbox_folder"])

        return _sanitize(raw)


    def build_path(self, item: dict, dropbox_root: str) -> str:
        department_raw = monday_client.get_column_value(item, self.columns.get("department", "")) or self.fallback.get("department", "Unknown Dept")
        product_raw = monday_client.get_column_value(item, self.columns.get("product", "")) or self.fallback.get("product", "Unknown Product")

        rule = self.get_department_rule(department_raw)
        template = self.get_path_template(rule)

        parts = [dropbox_root]
        for seg in template:
            value = self.resolve_segment(seg, item, rule, product_raw, department_raw)
            if value:
                parts.append(value)

        return "/".join(parts)


# Backward-compatibility alias — existing callers using dashboard.Dashboard still work
Dashboard = Board
