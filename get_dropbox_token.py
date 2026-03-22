"""
get_dropbox_token.py — One-time setup script to get a Dropbox refresh token.

Run this script ONCE to exchange your Dropbox App Key + App Secret for a
long-lived refresh token. After this you never need to manually renew tokens
again — the Dropbox SDK refreshes them automatically.

Before running:
  1. Open https://www.dropbox.com/developers/apps → your app → Settings
  2. Copy "App key" → add to .env as DROPBOX_APP_KEY
  3. Copy "App secret" → add to .env as DROPBOX_APP_SECRET
  4. Run: python3 get_dropbox_token.py
  5. Copy the printed refresh token → add to .env as DROPBOX_REFRESH_TOKEN

Depends on: .env (DROPBOX_APP_KEY, DROPBOX_APP_SECRET), dropbox SDK
"""

import os
import sys
from dotenv import load_dotenv
import dropbox
from dropbox import DropboxOAuth2FlowNoRedirect

# Load the app key and secret from .env
load_dotenv()

APP_KEY = os.getenv("DROPBOX_APP_KEY")
APP_SECRET = os.getenv("DROPBOX_APP_SECRET")

if not APP_KEY or not APP_SECRET:
    print("✗ DROPBOX_APP_KEY and DROPBOX_APP_SECRET must be set in your .env file.")
    print("  Find them at: https://www.dropbox.com/developers/apps → your app → Settings")
    sys.exit(1)

# Start the OAuth2 flow — no redirect URL needed for local apps
auth_flow = DropboxOAuth2FlowNoRedirect(
    consumer_key=APP_KEY,
    consumer_secret=APP_SECRET,
    token_access_type="offline",  # 'offline' gives a refresh token that never expires
)

# Step 1: Build the authorization URL and ask the user to open it
authorize_url = auth_flow.start()
print("\n=== Dropbox Token Setup ===\n")
print("Step 1: Open this URL in your browser:\n")
print(f"  {authorize_url}\n")
print("Step 2: Click 'Allow' to grant access, then copy the authorization code shown.\n")

# Step 2: Get the auth code from the user
auth_code = input("Paste the authorization code here: ").strip()

if not auth_code:
    print("✗ No code entered. Exiting.")
    sys.exit(1)

# Step 3: Exchange the code for tokens
try:
    oauth_result = auth_flow.finish(auth_code)
except Exception as e:
    print(f"✗ Failed to exchange code for token: {e}")
    sys.exit(1)

refresh_token = oauth_result.refresh_token

print("\n✓ Success! Your refresh token is:\n")
print(f"  {refresh_token}\n")
print("Step 3: Add this line to your .env file:\n")
print(f"  DROPBOX_REFRESH_TOKEN={refresh_token}\n")
print("You can also keep DROPBOX_ACCESS_TOKEN in .env — it's used as a fallback.")
print("From now on, the app will use the refresh token and never expire.\n")
