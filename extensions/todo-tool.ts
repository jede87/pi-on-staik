import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// A `todo` tool for pi.
//
// qwen3.5 reaches for a `todo`/task-tracking tool on multi-step work (a habit from
// harnesses like Claude Code that ship a TodoWrite tool). pi has no such tool, so
// the call failed with "Tool todo not found" and wasted turns (seen twice in the
// shortlink13 build: an initial `create` and a later `update`). Registering a real
// one satisfies that instinct and gives the agent a lightweight running plan —
// useful for keeping big builds organized.
//
// The model calls it as: { action: "create"|"update", items: "<JSON string>" } where
// items is a JSON array of {content, status}. create/update both just SET the full
// list (matches how the model uses it — it re-sends the whole list with new statuses).

type Status = "pending" | "in_progress" | "completed";
interface Todo {
  content: string;
  status: Status;
}

const VALID: ReadonlySet<string> = new Set(["pending", "in_progress", "completed"]);
const MARK: Record<Status, string> = {
  completed: "[x]",
  in_progress: "[~]",
  pending: "[ ]",
};

let todos: Todo[] = [];
// Anti-regression: content (normalized) of every item ever marked completed. When
// the model re-sends/re-plans its list (which replaces the whole thing), a task that
// was already done stays done instead of silently dropping back to pending — that's
// the "it destroyed its todo" regression (10/14 done → 5/10) we're guarding against.
const everCompleted = new Set<string>();
const norm = (s: string): string => s.trim().toLowerCase();

// Accept the items payload as a JSON string (how the model sends it) or an array.
// Returns null if it isn't a usable list.
function parseItems(raw: unknown): Todo[] | null {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  const out: Todo[] = [];
  for (const it of arr) {
    if (it && typeof it === "object") {
      const rec = it as Record<string, unknown>;
      const content = String(rec.content ?? rec.task ?? rec.text ?? "").trim();
      const s = String(rec.status ?? "pending").trim();
      const status = (VALID.has(s) ? s : "pending") as Status;
      if (content) out.push({ content, status });
    }
  }
  return out;
}

function render(list: Todo[]): string {
  if (list.length === 0) return "Todo list is empty.";
  const done = list.filter((t) => t.status === "completed").length;
  const lines = list.map((t) => `${MARK[t.status]} ${t.content}`);
  return `Todo (${done}/${list.length} done):\n${lines.join("\n")}`;
}

function updateStatus(ctx: ExtensionContext): void {
  const done = todos.filter((t) => t.status === "completed").length;
  ctx.ui.setStatus("todo", todos.length ? `todo ${done}/${todos.length}` : undefined);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Track a task checklist for multi-step work. `action`: 'create' or 'update' to SET the full " +
      "list, 'list' to view, 'clear' to reset. Pass `items` as a JSON array string of " +
      '{content, status}, status one of pending|in_progress|completed. ' +
      'Example: items=\'[{"content":"Scaffold app","status":"in_progress"},{"content":"Add tests","status":"pending"}]\'',
    promptSnippet: "todo — track a task checklist for multi-step work",
    parameters: Type.Object({
      action: Type.String({
        description: "create | update | list | clear (create/update set the full list)",
      }),
      items: Type.Optional(
        Type.String({
          description:
            "JSON array of {content, status} — status: pending|in_progress|completed. Required for create/update.",
        }),
      ),
    }),
    async execute(_toolCallId, params: { action?: string; items?: unknown }, _signal, _onUpdate, ctx) {
      const action = String(params.action ?? "list").toLowerCase();

      if (action === "clear") {
        todos = [];
        everCompleted.clear();
      } else if (action === "create" || action === "update" || action === "set" || action === "write") {
        const parsed = parseItems(params.items);
        if (parsed === null) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "todo: `items` must be a JSON array of {content, status} " +
                  "(status: pending|in_progress|completed).",
              },
            ],
            details: { error: "bad_items" },
          };
        }
        // Preserve progress across re-plans: anything ever completed stays completed.
        for (const t of parsed) {
          if (everCompleted.has(norm(t.content))) t.status = "completed";
          if (t.status === "completed") everCompleted.add(norm(t.content));
        }
        todos = parsed;
      }
      // "list" (or anything else) just renders the current list.

      updateStatus(ctx);
      return {
        content: [{ type: "text" as const, text: render(todos) }],
        details: { todos },
      };
    },
  });
}
