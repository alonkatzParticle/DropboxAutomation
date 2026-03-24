/**
 * lib/dropbox-auth.ts — Dropbox OAuth2 access token management
 *
 * Obtains a short-lived Dropbox access token using the stored refresh token.
 * Caches the token in memory so we only refresh when it expires.
 *
 * Prefers refresh token auth (never expires).
 * Falls back to a legacy DROPBOX_ACCESS_TOKEN if refresh creds are not set.
 *
 * Depends on: DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET env vars
 * Used by: lib/dropbox-client.ts
 */

// In-memory token cache — valid for a single serverless instance lifetime
let cachedToken: string | null = null;
let tokenExpiry = 0; // Unix ms timestamp when the cached token expires

/**
 * Return a valid Dropbox access token, refreshing via OAuth2 if needed.
 * Throws if no credentials are configured.
 */
export async function getDropboxToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 60-second safety margin)
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;

  // Preferred: use OAuth2 refresh token — never expires
  if (refreshToken && appKey && appSecret) {
    const res = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      }),
    });

    if (!res.ok) {
      throw new Error(`Dropbox token refresh failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    cachedToken = data.access_token as string;
    // expires_in is in seconds; cache it minus a 60s buffer
    tokenExpiry = now + (data.expires_in - 60) * 1000;
    return cachedToken;
  }

  // Fallback: legacy short-lived access token (expires every 4 hours)
  const legacyToken = process.env.DROPBOX_ACCESS_TOKEN;
  if (legacyToken) {
    console.warn("Using DROPBOX_ACCESS_TOKEN which expires every 4 hours. Set up refresh token for production.");
    cachedToken = legacyToken;
    tokenExpiry = now + 3 * 60 * 60 * 1000; // assume 3h left
    return cachedToken;
  }

  throw new Error(
    "No Dropbox credentials found. Set DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + DROPBOX_APP_SECRET in environment variables."
  );
}
