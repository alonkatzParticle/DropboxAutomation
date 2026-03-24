/**
 * lib/logger.ts — Structured activity logger
 *
 * Writes log entries (info / warn / error) to a ring buffer stored under the
 * "logs" key in storage (KV on Vercel, logs.json locally).
 * Max 500 entries — oldest are silently dropped when the buffer is full.
 *
 * Depends on: lib/storage.ts
 * Used by: lib/core.ts
 */

import { storageGet, storageSet } from "./storage";

export type LogLevel = "info" | "warn" | "error";

/** A single log entry stored in the ring buffer. */
export interface LogEntry {
  id: string;                          // Unique ID (timestamp + random suffix)
  ts: string;                          // ISO 8601 timestamp
  level: LogLevel;                     // Severity
  source: string;                      // Function or module name, e.g. "processItem"
  message: string;                     // Human-readable description
  context?: Record<string, unknown>;   // Optional extra data (task name, board, path…)
}

const MAX_ENTRIES = 500; // Ring buffer size — oldest entries are evicted first

/**
 * Append a log entry to the ring buffer.
 * level   — "info", "warn", or "error"
 * source  — name of the function or module writing this entry
 * message — plain-English description of what happened
 * context — optional key/value pairs for extra detail (task name, error, etc.)
 */
export async function log(
  level: LogLevel,
  source: string,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    level,
    source,
    message,
    ...(context ? { context } : {}),
  };

  // Load existing entries, append the new one, trim to ring-buffer size
  const existing = (await storageGet<LogEntry[]>("logs")) ?? [];
  const updated = [...existing, entry].slice(-MAX_ENTRIES);
  await storageSet("logs", updated);
}

/**
 * Return all stored log entries (oldest first).
 * Pass a level to filter — e.g. getLogs("error") returns only errors.
 */
export async function getLogs(level?: LogLevel): Promise<LogEntry[]> {
  const entries = (await storageGet<LogEntry[]>("logs")) ?? [];
  if (level) return entries.filter((e) => e.level === level);
  return entries;
}

/** Delete all log entries from storage. */
export async function clearLogs(): Promise<void> {
  await storageSet("logs", []);
}
