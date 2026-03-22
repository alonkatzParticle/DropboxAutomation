"""
main.py — Entry point for the Dropbox Automation app

Three ways to run this:

  1. POLLING MODE — check for new tasks created since the last run:
       python3 main.py

  2. MANUAL MODE — create a folder for one specific task by URL:
       python3 main.py --url "https://particle-for-men.monday.com/boards/.../pulses/..."
       Add --force to re-create even if a Dropbox link already exists.

  3. BACKFILL MODE — process ALL tasks across all boards that are missing a Dropbox link:
       python3 main.py --all

Additional modes:
  - python3 main.py --list-missing → Output JSON of tasks without Dropbox links (for web UI)
  - python3 main.py --items "5433027071:12345,8036329818:67890" → Process specific items

Depends on: state.py, core.py, web.py
"""

import sys
import state
import core
import web


def main():
    """Parse CLI arguments and dispatch to appropriate workflow."""
    try:
        config = state.load_config()
    except Exception as e:
        print(f"✗ Failed to load config: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        if "--url" in sys.argv:
            # Manual mode: process one task by URL
            url_index = sys.argv.index("--url") + 1
            if url_index >= len(sys.argv):
                print("✗ Please provide a URL after --url", file=sys.stderr)
                sys.exit(1)
            task_url = sys.argv[url_index]
            force = "--force" in sys.argv
            core.run_manual(task_url, config, force)

        elif "--all" in sys.argv:
            # Backfill mode: process all tasks missing links
            core.run_all(config)

        elif "--list-missing" in sys.argv:
            # List mode: output JSON of tasks missing links (for web UI)
            web.list_missing(config)

        elif "--items" in sys.argv:
            # Items mode: process specific items by boardId:itemId pairs
            items_index = sys.argv.index("--items") + 1
            if items_index >= len(sys.argv):
                print("✗ Please provide items after --items", file=sys.stderr)
                sys.exit(1)
            web.run_items(sys.argv[items_index], config)

        else:
            # Default: polling mode
            core.run_polling(config)

    except Exception as e:
        print(f"✗ Failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
