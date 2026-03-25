/**
 * lib/storage.ts — Persistent storage abstraction
 *
 * Automatically selects the right backend:
 *   - On Vercel (KV_REST_API_URL is set): uses @vercel/kv (Redis-based)
 *   - Locally: reads/writes JSON files from the project root directory
 *
 * Keys used by this app: "config", "state", "history"
 * Each key maps to config.json, state.json, history.json locally.
 *
 * Depends on: @vercel/kv (only in Vercel environment)
 * Used by: lib/core.ts, all API routes that read/write app state
 */

// True when running on Vercel (KV env vars are injected automatically)
// Note: fs/path are NOT imported at the top level — they are lazily required
// inside local-filesystem functions only, so this file is safe to import in
// Edge Runtime context (instrumentation.ts) without triggering Node.js warnings.
const USE_KV = Boolean(process.env.KV_REST_API_URL);

/** Returns the absolute path for a given storage key's JSON file. */
function localFilePath(key: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require("path") as typeof import("path");
  // On Vercel, /var/task is read-only — only /tmp is writable.
  // Locally, store files one level above the web/ folder (the project root).
  if (process.env.VERCEL) {
    return nodePath.join("/tmp", `${key}.json`);
  }
  const projectRoot = nodePath.resolve(process.cwd(), "..");
  return nodePath.join(projectRoot, `${key}.json`);
}

/**
 * Read a stored value by key.
 * Returns null if the key has no value.
 */
export async function storageGet<T = unknown>(key: string): Promise<T | null> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    return kv.get<T>(key);
  }
  // Local: read from <key>.json (e.g. "config" → config.json)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require("fs") as typeof import("fs");
  const filePath = localFilePath(key);
  if (!nodeFs.existsSync(filePath)) return null;
  try {
    return JSON.parse(nodeFs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Write a value for the given key.
 */
export async function storageSet(key: string, value: unknown): Promise<void> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, value);
    return;
  }
  // Local: write to <key>.json
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require("fs") as typeof import("fs");
  const filePath = localFilePath(key);
  nodeFs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

/**
 * Load the app config. On first Vercel load, seeds from the bundled config.json.
 * Always returns a valid config dict or throws if config is missing everywhere.
 */
export async function loadConfig(): Promise<Record<string, unknown>> {
  let config = await storageGet<Record<string, unknown>>("config");

  // On Vercel, seed KV from a local file or the CONFIG_JSON env var if KV is empty
  if (!config && USE_KV) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeFs = require("fs") as typeof import("fs");
    const configPath = localFilePath("config");
    if (nodeFs.existsSync(configPath)) {
      // Local file present (e.g. during build)
      config = JSON.parse(nodeFs.readFileSync(configPath, "utf-8"));
    } else if (process.env.CONFIG_JSON) {
      // Vercel first deploy: seed from the CONFIG_JSON environment variable.
      // Paste the full contents of your config.json as this env var in Vercel's
      // project settings. After the first request it will be stored in KV and
      // this branch will no longer run.
      config = JSON.parse(process.env.CONFIG_JSON);
    }
    if (config) await storageSet("config", config);
  }

  // Last resort: check CONFIG_JSON env var (works even if KV is not connected)
  if (!config && process.env.CONFIG_JSON) {
    config = JSON.parse(process.env.CONFIG_JSON);
    if (config && USE_KV) await storageSet("config", config);
  }

  if (!config) throw new Error("config.json not found. Please add your board configuration.");
  return config;
}

/**
 * Load app state (last-checked timestamps, auto_enabled flag).
 * Returns an empty object on first run.
 */
export async function loadState(): Promise<Record<string, unknown>> {
  return (await storageGet<Record<string, unknown>>("state")) ?? {};
}

/** Save app state. */
export async function saveState(state: Record<string, unknown>): Promise<void> {
  await storageSet("state", state);
}
