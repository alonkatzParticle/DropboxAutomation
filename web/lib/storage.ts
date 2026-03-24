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

import fs from "fs";
import path from "path";

// The project root is one level above the Next.js web/ folder
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

// True when running on Vercel (KV env vars are injected automatically)
const USE_KV = Boolean(process.env.KV_REST_API_URL);

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
  const filePath = path.join(PROJECT_ROOT, `${key}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
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
  const filePath = path.join(PROJECT_ROOT, `${key}.json`);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

/**
 * Load the app config. On first Vercel load, seeds from the bundled config.json.
 * Always returns a valid config dict or throws if config is missing everywhere.
 */
export async function loadConfig(): Promise<Record<string, unknown>> {
  let config = await storageGet<Record<string, unknown>>("config");

  // On Vercel, seed KV from the bundled file if KV is empty
  if (!config && USE_KV) {
    const bundledPath = path.join(PROJECT_ROOT, "config.json");
    if (fs.existsSync(bundledPath)) {
      config = JSON.parse(fs.readFileSync(bundledPath, "utf-8"));
      await storageSet("config", config);
    }
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
