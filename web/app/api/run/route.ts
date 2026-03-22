/**
 * api/run/route.ts — API route for triggering Python automation scripts
 *
 * POST /api/run
 * Body: { mode: "poll" | "all" | "manual" | "selected", url?: string, force?: boolean,
 *         items?: { boardId: string, itemId: string }[] }
 *
 * Shells out to the Python scripts in the parent directory and streams stdout/stderr
 * back as a JSON response. This lets the UI trigger runs without duplicating logic.
 */

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

// The Python project root is one level above this Next.js app
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

function runPython(args: string[]): Promise<{ output: string; success: boolean }> {
  return new Promise((resolve) => {
    const cmd = ["python3", "main.py", ...args].join(" ");
    exec(cmd, { cwd: PROJECT_ROOT, timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join("\n").trim();
      resolve({ output, success: !error });
    });
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { mode, url, force, items } = body as {
    mode: string;
    url?: string;
    force?: boolean;
    // items: array of { boardId, itemId } pairs for "selected" mode
    items?: { boardId: string; itemId: string }[];
  };

  let args: string[] = [];

  if (mode === "manual") {
    if (!url) return NextResponse.json({ error: "url is required for manual mode" }, { status: 400 });
    args = ["--url", url, ...(force ? ["--force"] : [])];
  } else if (mode === "all") {
    args = ["--all"];
  } else if (mode === "selected") {
    if (!items?.length) return NextResponse.json({ error: "items is required for selected mode" }, { status: 400 });
    // Build comma-separated "boardId:itemId" string for the Python --items flag
    const itemsArg = items.map((i) => `${i.boardId}:${i.itemId}`).join(",");
    args = ["--items", itemsArg];
  } else {
    // poll (default)
    args = [];
  }

  const { output, success } = await runPython(args);
  return NextResponse.json({ output, success }, { status: success ? 200 : 500 });
}
