"""
dropbox_client.py — Dropbox API communication

This file handles all interactions with Dropbox:
creating folders, listing existing folders, generating shareable links,
and moving folders (used by the Folder Mover web page).

Depends on: .env (for DROPBOX_ACCESS_TOKEN)
Used by: folder_builder.py, main.py, web_folder_mover.py
"""

import os
import sys
import dropbox
from dropbox.exceptions import ApiError
from dropbox.files import CreateFolderError, FolderMetadata
from dropbox.sharing import CreateSharedLinkWithSettingsError
from dotenv import load_dotenv

# Load DROPBOX_ACCESS_TOKEN from the .env file
load_dotenv()


def _get_client() -> dropbox.Dropbox:
    """
    Create and return an authenticated Dropbox client.

    Prefers the new OAuth2 refresh-token method (DROPBOX_REFRESH_TOKEN +
    DROPBOX_APP_KEY + DROPBOX_APP_SECRET), which never expires.

    Falls back to a legacy DROPBOX_ACCESS_TOKEN if the refresh credentials
    are not yet configured. Run get_dropbox_token.py once to get a refresh token.
    """
    refresh_token = os.getenv("DROPBOX_REFRESH_TOKEN")
    app_key = os.getenv("DROPBOX_APP_KEY")
    app_secret = os.getenv("DROPBOX_APP_SECRET")

    # Preferred: use refresh token so auth never expires
    if refresh_token and app_key and app_secret:
        return dropbox.Dropbox(
            oauth2_refresh_token=refresh_token,
            app_key=app_key,
            app_secret=app_secret,
        )

    # Fallback: legacy short-lived access token (expires every 4 hours)
    token = os.getenv("DROPBOX_ACCESS_TOKEN")
    if token:
        print(
            "  ⚠ Using DROPBOX_ACCESS_TOKEN which expires every 4 hours. "
            "Run get_dropbox_token.py to set up a permanent refresh token.",
            file=sys.stderr,
        )
        return dropbox.Dropbox(token)

    raise EnvironmentError(
        "No Dropbox credentials found. Add DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + "
        "DROPBOX_APP_SECRET to .env, or run get_dropbox_token.py."
    )


def create_folder(path: str) -> bool:
    """
    Create a folder at the given Dropbox path (including any missing parent folders).
    Returns True if the folder was created, False if it already existed.

    path — Full Dropbox path, e.g. '/Creative Production/Marketing/Face Cream/Video/Meta/001_March_2026/My Task'
    """
    dbx = _get_client()
    try:
        dbx.files_create_folder_v2(path)
        print(f"  ✓ Created folder: {path}", file=sys.stderr)
        return True
    except ApiError as e:
        # If the folder already exists, that's fine — not an error
        if isinstance(e.error, CreateFolderError) and e.error.is_path() and e.error.get_path().is_conflict():
            print(f"  ℹ Folder already exists: {path}", file=sys.stderr)
            return False
        raise  # Re-raise any other unexpected errors


def get_shared_link(path: str) -> str:
    """
    Get a shareable Dropbox link for the folder at the given path.
    If a link already exists, it returns the existing one instead of creating a duplicate.

    path — Full Dropbox path of the folder
    Returns the shareable URL as a string.
    """
    dbx = _get_client()
    try:
        # Try to create a new shared link
        result = dbx.sharing_create_shared_link_with_settings(path)
        return result.url
    except ApiError as e:
        # If a shared link already exists for this path, fetch and return it
        if isinstance(e.error, CreateSharedLinkWithSettingsError) and e.error.is_shared_link_already_exists():
            existing = dbx.sharing_list_shared_links(path=path, direct_only=True)
            if existing.links:
                return existing.links[0].url
        raise  # Re-raise anything else unexpected


def get_folder_path_from_link(shared_link_url: str) -> "str | None":
    """
    Get the actual Dropbox folder path from a shared link URL.
    Uses the Dropbox sharing API to look up metadata for the link.

    shared_link_url — A Dropbox shared link, e.g. 'https://www.dropbox.com/scl/fo/...'

    Returns the folder's display path (e.g. '/Creative 2026/Marketing Ads/...'),
    or None if the lookup fails.
    """
    dbx = _get_client()
    try:
        # FolderLinkMetadata has path_lower but not path_display
        link_meta = dbx.sharing_get_shared_link_metadata(shared_link_url)
        path_lower = link_meta.path_lower
        # Use files_get_metadata to resolve the properly-cased display path
        file_meta = dbx.files_get_metadata(path_lower)
        return file_meta.path_display
    except Exception as e:
        print(f"  ✗ Could not get path from shared link: {e}", file=sys.stderr)
        return None


def move_folder(from_path: str, to_path: str) -> bool:
    """
    Move a Dropbox folder from one location to another.
    The folder and all its contents are preserved — only the location changes.

    from_path — Current full path, e.g. '/Creative 2026/Marketing Ads/.../Old Name'
    to_path   — Destination full path, e.g. '/Creative 2026/Marketing Ads/.../New Name'

    Returns True on success, False if the move failed.
    """
    dbx = _get_client()
    try:
        dbx.files_move_v2(from_path, to_path)
        print(f"  ✓ Moved folder: {from_path} → {to_path}", file=sys.stderr)
        return True
    except Exception as e:
        print(f"  ✗ Failed to move folder: {e}", file=sys.stderr)
        return False


def list_subfolder_names(path: str) -> list:
    """
    List the names of all direct subfolders inside a given Dropbox path.
    Returns an empty list if the folder doesn't exist yet or has no subfolders.

    path — Full Dropbox path to inspect
    Used by folder_builder.py to compute the next sequential date index.
    """
    dbx = _get_client()
    try:
        result = dbx.files_list_folder(path)
        # Return only folder names (not files)
        return [
            entry.name
            for entry in result.entries
            if isinstance(entry, FolderMetadata)
        ]
    except ApiError:
        # If the folder doesn't exist yet, return an empty list (no entries = index starts at 1)
        return []
