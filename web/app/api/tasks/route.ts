/**
 * api/tasks/route.ts — Returns all Monday.com tasks that are missing a Dropbox link
 *
 * GET /api/tasks
 * Shells out to `python3 main.py --list-missing` which outputs a JSON array,
 * then returns that array to the UI so it can display the task list.
 *
 * Response: { tasks: [{ id, boardId, boardName, mediaType, name }] }
 */

import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

const PROJECT_ROOT = path.resolve(process.cwd(), "..");

export async function GET() {
  const result = await new Promise<{ output: string; success: boolean }>((resolve) => {
    exec(
      "python3 main.py --list-missing",
      { cwd: PROJECT_ROOT, timeout: 2 * 60 * 1000 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ output: stderr || error.message, success: false });
        } else {
          resolve({ output: stdout.trim(), success: true });
        }
      }
    );
  });

  if (!result.success) {
    return NextResponse.json({ error: result.output }, { status: 500 });
  }

  try {
    const tasks = JSON.parse(result.output);
    return NextResponse.json({ tasks });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse task list from Python", raw: result.output },
      { status: 500 }
    );
  }
}
