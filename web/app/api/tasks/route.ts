/**
 * app/api/tasks/route.ts — Returns all Monday.com tasks missing a Dropbox link
 *
 * GET /api/tasks
 * Fetches tasks from all configured boards and returns those without a Dropbox link.
 * Response: { tasks: [{ id, boardId, boardName, mediaType, name, mondayUrl, previewPath }] }
 *
 * Depends on: lib/monday-client.ts, lib/board.ts, lib/task.ts, lib/storage.ts
 */

import { NextResponse } from "next/server";
import { getNewItems } from "@/lib/monday-client";
import { Board, BoardConfig } from "@/lib/board";
import { Task } from "@/lib/task";
import { loadConfig } from "@/lib/storage";

export async function GET() {
  try {
    const config = await loadConfig();
    const subdomain = (config.monday_subdomain as string) ?? "";
    const boards = config.boards as Record<string, BoardConfig>;
    const results = [];

    for (const [boardId, boardConfig] of Object.entries(boards)) {
      const board = new Board(boardId, boardConfig);
      try {
        const items = await getNewItems(boardId, "2000-01-01T00:00:00+00:00");
        for (const item of items) {
          const task = new Task(item, board, subdomain);
          if (task.hasFolder || task.isCompleted) continue;
          let preview = "";
          try { preview = board.buildPath(task.rawItem(), config.dropbox_root as string); } catch { /* ignore */ }
          results.push({
            id: task.id,
            boardId: task.boardId,
            boardName: task.boardName,
            mediaType: board.mediaType,
            name: item.name,
            mondayUrl: task.mondayUrl,
            previewPath: preview,
          });
        }
      } catch (e) {
        console.error(`Error fetching ${board.name}:`, e);
      }
    }

    return NextResponse.json({ tasks: results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
