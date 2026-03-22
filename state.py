"""
state.py — Configuration and state management

Handles loading and saving app configuration and processing state.
Manages the config.json and state.json files.

Used by: main.py, workflows.py
"""

import json
import os


def get_base_path() -> str:
    """Get the directory containing this script (project root)."""
    return os.path.dirname(os.path.abspath(__file__))


def load_config() -> dict:
    """
    Load the application configuration from config.json.

    Returns a dict with board configs, department rules, keywords, etc.
    Raises FileNotFoundError if config.json is missing.
    Raises json.JSONDecodeError if config.json is malformed.
    """
    config_path = os.path.join(get_base_path(), "config.json")
    try:
        with open(config_path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"config.json not found at {config_path}")
    except json.JSONDecodeError as e:
        raise json.JSONDecodeError(f"Invalid JSON in config.json: {e.msg}", e.doc, e.pos)


def load_state() -> dict:
    """
    Load the processing state from state.json.

    The state file tracks:
    - Last checked timestamp per board (for polling mode)
    - auto_enabled flag (whether auto-create is enabled)

    If state.json doesn't exist, returns an empty dict (first run).
    """
    state_path = os.path.join(get_base_path(), "state.json")
    if not os.path.exists(state_path):
        return {}
    try:
        with open(state_path, "r") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"Warning: Invalid JSON in state.json, starting fresh. Error: {e}")
        return {}


def save_state(state: dict) -> None:
    """
    Save the processing state to state.json.

    Creates or overwrites state.json with the given state dict.
    Raises IOError if the file cannot be written.
    """
    state_path = os.path.join(get_base_path(), "state.json")
    try:
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2)
    except IOError as e:
        raise IOError(f"Failed to save state to {state_path}: {e}")
