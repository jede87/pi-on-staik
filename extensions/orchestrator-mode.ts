import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Orchestrator mode — a MECHANICAL gate that forces decomposition AND keeps the
// delegated work small.
//
// The dev.md "Orchestrate large builds" rule asks the main agent to delegate
// implementation to FRESH workers, but two things slip when left as guidance:
//   1. the agent codes/builds/commits inline (context balloons in the orchestrator),
//   2. it spawns workers with `context: fork`, which inherit the whole conversation
//      and balloon in the CHILD (seen on shortlink14: a `worker [fork]` hit 642k
//      tokens — the context bomb just moved into the worker).
// `--orchestrator` makes three things mechanical:
//   - write/edit/bash from the MAIN agent are hard-blocked (`tool_call` → block),
//   - every `subagent` spawn is forced to `context: "fresh"` (args mutated in place),
//   - every `subagent` spawn gets a default `timeoutMs` watchdog (args mutated in place),
// so the orchestrator stays tiny, no child can fork-inherit a huge context, and a hung
// subagent can't freeze the whole build.
//
// Why block (not setActiveTools): setActiveTools only de-advertises — and pi then
// answers a stray call with the unhelpful "Tool bash not found", which confuses the
// model instead of telling it to delegate. The `tool_call` block lets bash stay
// visible, intercepts the call, and hands back a reason that steers it to the right
// tools/subagents.
//
// Why the watchdog: with write/edit/bash blocked the orchestrator can do nothing
// itself, so a single hung subagent = a hard freeze (it waits on the call forever).
// pi-subagents already supports a per-run `timeoutMs` — a real wall-clock setTimeout
// that SIGTERM→SIGKILLs the subagent child (so it fires even mid-HTTP, e.g. a stuck
// gateway read) and returns "Subagent timed out after Xms" to unblock the chain. But
// it's per-call only with no default → a "remember to pass timeoutMs" rule, which (per
// the project thesis) slips every time. So we inject a default mechanically. It's a
// FLOOR, not a ceiling: an explicit timeoutMs/maxRuntimeMs on the call is respected.
// app-booting agents (qa/docs/design-critic boot + install + run playwright×2) get a
// longer leash than a code-slice worker. Seen: shortlink15 worker hung 28 min.
//
// Opt-in: only active with `--orchestrator`. bash is blocked too (not just
// write/edit) — otherwise `echo > file` writes around the gate and verbose
// build/test output still lands in the window. File inspection uses read/ls/find/grep.

const BLOCKED_TOOLS = new Set(["write", "edit", "bash"]);

// Subagent hang watchdog. A code-slice worker finishes well under 10 min; agents that
// boot/install/screenshot the app (build + playwright×2) need a longer leash.
const SLOW_AGENTS = new Set(["qa", "docs", "design-critic"]);
const DEFAULT_TIMEOUT_MS = 600_000; // 10 min — workers and everything else
const SLOW_TIMEOUT_MS = 1_200_000; // 20 min — qa/docs/design-critic

const BLOCK_REASON =
  "Orchestrator mode: this tool is disabled for the main agent. Do NOT implement, run shell, " +
  "or commit inline. To INSPECT files use the read / ls / find / grep tools (not bash). To make " +
  "ANY change — write code, build, run tests, or git — delegate to a subagent per the dev.md " +
  '"Orchestrate large builds" rule: a `worker` for code/git, `qa` for build + e2e. Workers are ' +
  "forced to fresh context automatically, so just describe the slice and what files to read.";

const ORCHESTRATOR_NOTE = `

# Orchestrator mode — write/edit/bash are blocked
You CANNOT implement code, run builds/tests, or commit directly — those calls are rejected.
- To INSPECT the repo: use the read / ls / find / grep tools (NOT bash).
- To CHANGE anything: delegate to a subagent per the dev.md "Orchestrate large builds" rule —
  context-builder → context.md, planner → plan.md, then a \`worker\` per vertical slice (which
  reads context.md+plan.md), and \`qa\` for build + e2e. A worker also does git init/commits/push.
- All subagent spawns run with fresh context automatically; hand each one a tight task + the files
  to read. You read files and orchestrate; subagents do all writing, shell, and verification.
- Each subagent has a watchdog timeout (workers ~10 min, qa/docs/design-critic ~20 min). Keep every
  slice tight enough to finish inside that. For a genuinely long one, pass an explicit \`timeoutMs\`.`;

export default function (pi: ExtensionAPI) {
  pi.registerFlag("orchestrator", {
    description:
      "Orchestrator mode: hard-block write/edit/bash and force subagents to fresh context, so the main agent must delegate",
    type: "boolean",
    default: false,
  });

  const active = (): boolean => pi.getFlag("orchestrator") === true;

  pi.on("session_start", (_event, ctx) => {
    if (active()) ctx.ui.setStatus("orchestrator", "orchestrator");
  });

  pi.on("tool_call", (event) => {
    if (!active()) return;

    // Mutate subagent SPAWN args in place (allowed: pi applies the mutation before
    // execution) to make the gate self-correcting.
    if (event.toolName === "subagent") {
      const input = event.input as Record<string, unknown>;
      if (input && input.agent && input.action !== "list") {
        // Force fresh context — no fork context bombs.
        if (input.context !== "fresh") input.context = "fresh";
        // Fix the file-only-without-output footgun: pi-subagents errors when
        // outputMode is "file-only" but no output path is set. Fall back to inline
        // (workers are fresh/small, so a concise inline summary keeps us tiny anyway).
        if (input.outputMode === "file-only" && !input.output) input.outputMode = "inline";
        // Hang watchdog: a default timeout floor so a stuck subagent can't freeze the
        // build. Only fill when the call set none — an explicit value is the model's
        // own call and is respected.
        if (input.timeoutMs == null && input.maxRuntimeMs == null) {
          const agentName = typeof input.agent === "string" ? input.agent : "";
          input.timeoutMs = SLOW_AGENTS.has(agentName) ? SLOW_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
        }
      }
      return;
    }

    // Hard-block inline implementation tools and steer the model to delegate.
    if (BLOCKED_TOOLS.has(event.toolName)) {
      return { block: true, reason: BLOCK_REASON };
    }
  });

  pi.on("before_agent_start", (event) => {
    if (!active()) return;
    return { systemPrompt: `${event.systemPrompt}${ORCHESTRATOR_NOTE}` };
  });
}
