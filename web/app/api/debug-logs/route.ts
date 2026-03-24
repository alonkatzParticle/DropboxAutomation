/**
 * api/debug-logs/route.ts — Returns the last N lines of the pm2 server logs.
 *
 * GET /api/debug-logs
 * Reads stdout and stderr logs written by pm2 for the web-dev process.
 * These logs contain the Next.js server output (API requests, errors, etc.).
 *
 * Used by: /debugger page
 */

import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

// pm2 stores logs in ~/.pm2/logs/ by default — one file per process per stream
const PM2_LOGS_DIR = path.join(os.homedir(), ".pm2", "logs");

/**
 * Reads the last N lines of a log file.
 * Returns an empty string if the file does not exist yet.
 *
 * @param filename - Name of the file inside the pm2 logs directory
 * @param lines - How many lines to return (default: 100)
 */
function readLogTail(filename: string, lines = 100): string {
  const p = path.join(PM2_LOGS_DIR, filename);
  if (!fs.existsSync(p)) return "";
  const content = fs.readFileSync(p, "utf-8");
  return content.split("\n").slice(-lines).join("\n").trim();
}

/**
 * GET /api/debug-logs
 * Returns { stdout, stderr } — last 100 lines of each pm2 log stream.
 */
export async function GET() {
  // pm2 logs are only available when running locally — return empty on Vercel
  if (process.env.VERCEL) {
    return NextResponse.json({ stdout: "", stderr: "(logs not available on Vercel)" });
  }
  return NextResponse.json({
    stdout: readLogTail("web-dev-out.log"),
    stderr: readLogTail("web-dev-error.log"),
  });
}
