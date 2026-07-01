import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Auto-resume after a turn that ended abnormally (e.g. the Staik endpoint dropped
// the turn with an empty completion) so you don't have to type "continue" by hand.
//
// Why this finally works (earlier versions silently didn't): at `agent_end` the
// agent loop is still `isStreaming` — it only checks `hasQueuedMessages()` AFTER
// the handlers run (agent-session.js:695). A bare `sendUserMessage("continue")`
// with no `deliverAs` hits `prompt()`'s guard and THROWS "Agent is already
// processing", and that throw is swallowed by the runtime's `.catch`, so nothing
// resumes. The fix is to QUEUE the message with `deliverAs: "followUp"`: pi's
// agent-loop continuation then picks it up and runs the next turn. No setTimeout,
// no idle-polling — just hand pi a queued follow-up and let its own continuation
// mechanism drive.
//
// Safe by construction: a hard cap means it can never loop forever, a turn that
// ends with a normal assistant text conclusion is treated as done/asking and left
// alone, and we never clobber input you've already queued.
//
// Not handled here: a *hung* call that never returns — it never fires `agent_end`,
// so there's no event to react to. That's the gateway's timeout/retry job, not the
// client's. We deliberately don't abort a long in-flight turn (the thinking model
// legitimately reasons for >150s).

const MAX_AUTO_CONTINUES = 3;
const RESUME_TEXT = "continue";

let autoCount = 0;
let enabled = true;

function endedWithTextConclusion(last: unknown): boolean {
  if (!last || typeof last !== "object") return false;
  const m = last as { role?: string; content?: unknown };
  if (m.role !== "assistant") return false;
  const c = m.content;
  if (typeof c === "string") return c.trim().length > 0;
  if (Array.isArray(c)) {
    return c.some(
      (p) =>
        p && typeof p === "object" &&
        (p as { type?: string }).type === "text" &&
        String((p as { text?: string }).text ?? "").trim().length > 0,
    );
  }
  return false;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("autocontinue", {
    description: "Toggle auto-resume after an interrupted turn (on/off)",
    handler: async (args, ctx) => {
      const a = (args || "").trim().toLowerCase();
      enabled = a === "off" ? false : a === "on" ? true : !enabled;
      autoCount = 0;
      ctx.ui.setStatus("autocontinue", enabled ? undefined : "autocontinue:off");
      ctx.ui.notify(
        `Auto-continue: ${enabled ? "on" : "off"} (max ${MAX_AUTO_CONTINUES} in a row)`,
        "info",
      );
    },
  });

  pi.on("agent_end", (event, ctx) => {
    if (!enabled) return;
    const msgs = event.messages ?? [];
    const last = msgs[msgs.length - 1];

    // Normal end (the agent wrote a concluding message — done, or asking you
    // something): leave it alone and reset the counter.
    if (endedWithTextConclusion(last)) {
      autoCount = 0;
      return;
    }
    // You've already queued input — don't step on it; let your message drive.
    if (ctx.hasPendingMessages()) {
      autoCount = 0;
      return;
    }
    // Hit the safety cap: give up and let the user take over.
    if (autoCount >= MAX_AUTO_CONTINUES) {
      autoCount = 0;
      ctx.ui.notify(
        `Turn keeps ending early (${MAX_AUTO_CONTINUES}× auto-continue) — over to you.`,
        "warning",
      );
      return;
    }

    autoCount++;
    ctx.ui.notify(
      `Turn ended early — auto-continuing (${autoCount}/${MAX_AUTO_CONTINUES})`,
      "info",
    );
    // Queue as a follow-up so pi's agent_end continuation runs the next turn.
    // `deliverAs: "followUp"` is required — a bare send throws (and is swallowed)
    // because the loop is still streaming at agent_end.
    try {
      pi.sendUserMessage(RESUME_TEXT, { deliverAs: "followUp" });
    } catch {
      /* agent may have moved on; ignore */
    }
  });
}
