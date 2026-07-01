# Rationale — why this setup looks the way it does

Every rule and agent here came from an **observed failure** in a real build, not from theory.
This file records what we saw and what it taught us, so the setup stays principled if it's
edited later.

---

## The core thesis

> **Mechanical, verifiable rules bite. "Remember to do X" rules slip — even with a strong model.**

A rule like *"after tests, run `git status`; if a new file appears, teardown is broken"* lands
every time, because it's a concrete check the model can't fudge. A rule like *"run the qa
subagent"* keeps getting skipped, because it relies on the model choosing to. So the setup
phrases every gate as a concrete, runnable check, and uses subagents for the parts that genuinely
need a separate set of eyes.

A second finding: the model is the bottleneck for *judgment* rules, not mechanical ones. We ran
the same build with thinking on vs off — mechanical rules (e.g. `force-dynamic`) survived without
thinking; judgment rules (test isolation+cleanup, abstraction, coverage) collapsed. → **run code
on `qwen3.5:35b-a3b-thinking`.**

---

## How we validated: a live build loop

We didn't trust the rules — we tested them by repeatedly building the *same* app (a URL
shortener / linktree clone) and then adding features and a bugfix, reviewing each result by
actually running it (curl, `npx playwright test`, screenshots), and feeding every failure back
into the rules. The setup is the residue of that loop.

---

## Failure → rule (the timeline)

| What we observed | What it produced |
|------------------|------------------|
| `models.json` claimed 262k context for a model the server caps at 98k → 400s | declarations must match what the Staik endpoint serves |
| gemma (non-reasoning) stopped early, hallucinated a `web_search` tool | default to `qwen3.5:35b-a3b-thinking`; "no web_search tool — it's server-side" |
| Build #1: redirect rendered a blank 200 (handler in `page.tsx`, not `route.ts`); passed all unit tests + build | **"verify the running app, not just tests"** + qa agent |
| Build #2: tests wiped the real `dev.db`; left a temp DB in the repo | temp DBs outside the repo; **`git status` after tests** |
| Build #3: e2e suite shipped but never ran green (no `webServer`); qa only used its own curl harness | e2e needs `webServer` + run green; qa must run the project's suite |
| Build #4 (clean sweep): all layers bit — redirect works, isolated e2e green, shadcn UI, granular commits, README verified | confirmed the model can self-correct (found a path typo + the redirect assertion on its own) |
| Feature (custom slug): code excellent, but e2e flaky (fixed slugs collide on rerun) and qa skipped | **run `npx playwright test` twice**; reframe qa as a *safety net*, not a mandatory duplicate |
| Bugfix (URL length): reproduced with a failing test *before* the fix (verified in the log) | bugfix = **reproduce-first (hard rule)** held |
| UI styling: shadcn themes gave a strong baseline, but a stray navbar line + flat cards slipped | shadcn themes as default; **design-critic** to catch functional-but-ugly |
| Builds ballooned to 212k–233k context (verbose e2e/`[WebServer]` output dumped inline) → over-thinking, empty completions, stalls | **dev.md "Orchestrate large builds"**: decompose via fresh subagents + file-handoff; verbose work in `qa`. Cut peak context to ~26k |
| Same prompt: shortlink12 decomposed, shortlink13 ignored the rule and coded inline | the rule slips → **`--orchestrator` mechanical gate** (hard-block write/edit/bash via `tool_call`, not `setActiveTools`) |
| A force-fresh worker still ran away to 4.8M tokens on a too-broad task; a hung `web_search` subagent jammed a whole build | fresh ≠ bounded → **hangs + runaway workers are the open problems**; tight slices + per-run timeout/cap |
| Under `--orchestrator` a hung subagent froze the whole build (orchestrator can't act, so it waits forever); pi-subagents has a per-run `timeoutMs` (a real wall-clock SIGTERM→SIGKILL, fires even mid-HTTP) but only per-call → "remember to pass it" slipped | **hang fix: inject a default `timeoutMs` watchdog in `orchestrator-mode`** (600s worker / 1200s qa·docs·design-critic), a floor not a ceiling — same mechanical args-mutation trick as force-fresh |
| Model hallucinated a `todo` tool and a `web_search` subagent (ignoring AGENTS.md's "no web_search") | **give it the tool it reaches for** — `todo-tool` + a timeout-bounded `web_search` (SearXNG) — rather than re-asserting a rule it slips |
| The builtin `context-builder` declares `web_search` in its `tools:` but the extension tool only exists on the **main** agent — a spawned subagent doesn't have it. Primed by the declaration, it emitted a malformed native `<tool_call>web_search…` as text, and since the agent's `output: context.md`, that garbage **became the whole `context.md`** → corrupt handoff (seen in shortlink-202606262325) | **give it the tool for real, don't de-advertise** via `subagents.agentOverrides` in `settings.json`: register `web_search` in the subagent (`subagentOnlyExtensions: [web-search-tool.ts]`) **and keep it in `tools`**, plus add `mcp` (context7). Key realization: **a spawned subagent gets neither the user's extension tools nor MCP by default** — `mcp` must be in its `tools:`, and an extension passed via `subagentOnlyExtensions` (an `--extension <path>`). (First attempt *dropped* web_search — wrong; the next row shows why.) |
| `researcher` declares `web_search` + two **phantom** tools (`fetch_content`/`get_search_content` — not in pi-core or any installed package) → same leak risk, and it had no MCP either | **give it the tools for real** (research *wants* them): `web_search` via `subagentOnlyExtensions` (the SearXNG extension) + `mcp` (context7/shadcn/playwright), and drop the two phantoms. The "give it the tool it reaches for" rule — applied to a subagent. |
| Next build: the orchestrator used **`scout`** (not context-builder) to write `context.md`, and scout **leaked `web_search` too — even though scout doesn't even declare it** (seen in shortlink-202606270005) | **proves de-advertising can't stop the leak** — the model reaches for `web_search` when researching a greenfield stack regardless of the `tools:` line. So give the tool **for real** to every agent that scouts/builds context: `scout` + `context-builder` both get `web_search` (`subagentOnlyExtensions` + in `tools`) + `mcp`. A registered tool yields a *parsed* call, not leaked native XML. (`planner`/`oracle` are next if they show the same leak.) |
| After "done = `smoke`, e2e deferred", a from-scratch build STILL planned + todo'd a full e2e suite + a final `qa` pass (shortlink-202606262325) — the planner read the new dev.md but the "deeper pass — run after it boots, **or on request**" wording read as "do it at the end of this build" | the soft reframe slipped → **make it mechanical in dev.md**: the build loop *ends at `smoke`-green + push*; `qa`/`e2e`/`test-critic`/`design-critic`/`docs` are explicitly **not build steps** and run **only when the user asks**. `smoke` is the from-scratch verification subagent, never `qa`. (Another "explicit-but-soft rule slips → tie it to a hard boundary" data point.) |
| **New task type — codebase analysis** (not building). First run (`tv-clients-react-html-legacy`) slipped two ways: the **decompose discipline collapsed to inline reading** (main agent read 29 files itself, spawned only 2 scouts), and **`file:line` refs were partly guessed** (`routes.js` claimed 27, was 51) | the build loop's lesson applies to comprehension → a new **`analyze.md` profile** (the analysis twin of dev.md) with two hard rules: (1) main agent reads only manifests/structure, **delegates each subsystem to a fresh `scout`** — never reads source inline; (2) **a grounding-verification pass** — every cited `file:line` re-checked against the real file before "done", no estimated numbers. |
| `analyze.md` run on a 2nd stack (`tv-clients-react-native-tvos`, RN/tvOS, nested `src/` root, 2× bigger): scout fan-out via the **parallel `tasks: [...]`** form **failed validation** — Qwen serialized the array as a JSON string (`tasks.0: must be object`), same quirk `todo-tool` already tolerates | **rule: spawn each scout as its own single `subagent` call** (`agent`+`task`, no `tasks` array) — single-mode has no array arg to stringify. Doesn't cost decomposition (scouts still fresh), only parallelism. With this, v2 fixed BOTH v1 failures: 5 scouts / 16 inline reads, and 8/8 spot-checked line refs exact (`routes.js` now correct at 51). Validated across 2 stacks → profile is real, not theory. |
| Two scout intermediate outputs leaked into the repo root as scratch files (`context.md`, then a 279-line `scout-player.md`) — the main agent pointed scouts' `output` at repo paths; litter that breaks read-only | **rule: scouts RETURN their summary inline, never into the repo** (scratch → `$TMPDIR`); only the final doc lands in the working tree. Next run (TESTABILITY pass on tv-legacy) confirmed: 7 scouts, **zero leaked files**. |
| The TESTABILITY-map prompt (run for the "map → add TDD" workflow) produced a 962-line, immediately-actionable doc — Tier A/B/C classification (incl. **what's NOT worth unit-testing**), a prioritized backlog, a DI-refactor list, and a phased plan | the lens proved itself → **promote it to a first-class `analyze.md` deliverable** (`TESTABILITY.md`) so it needn't be hand-prompted. (Lesson for the analyst *and the human*: a `M ARCHITECTURE.md` was first misread as an agent read-only slip — it was a prior **uncommitted human edit**; the agent made 0 edits / 1 write. Verify attribution before concluding — the profile's own "ground it, don't guess" rule.) |

---

## Architecture decisions (and why)

- **Layered AGENTS.md, dev rules symlinked into code roots.** Global stays universal; dev
  discipline auto-loads by *location* so you can't forget to "turn it on", while `dev.md` is a
  single source of truth.
- **Profiles for personas, not task types.** research/ops/data/spec are different *stances*
  (different rules). feature/change/bugfix are the *same* coding work → a section in `dev.md`,
  not separate profiles (which would duplicate dev rules or reintroduce a manual switch).
- **Subagents for separable, verifiable concerns; rules for ambient discipline; not chains.**
  qa/test-critic/docs/design-critic each own a concern and *run* it. Cadence-type discipline
  (commit-per-step) stayed as rules — we considered a build *chain* but rejected it as too
  rigid for the gain.
- **qa = safety net, not mandatory duplicate.** It kept getting skipped on feature changes, and
  a green, re-runnable e2e suite covering the flows already does its job. So the hard gate is the
  mechanical e2e check; qa is run when e2e is thin/missing or for risky work.

---

## The verification model (what "done" means now)

Split into a **light done-gate** and a **deeper pass run after it boots** — because the full e2e
loop's verbose `[WebServer]`/test output dumped inline was the #1 cause of the 233k context balloon
(see the timeline). Making "done" a *boot* check, not a full e2e run, keeps the verifying agent's
output small while still proving the app actually runs.

**Done-bar** (the build loop is "done" when these pass, with command output shown):
1. unit tests green, testing the **real shipped code**, isolated, leaving the repo clean (`git status`);
2. production build run and read (data-driven pages **dynamic**, not `○ Static`);
3. the app **boots and every top-level route serves** — the `smoke` subagent: build → start → GET each
   route (non-5xx) → Playwright loads home (200, no error overlay). Proves *liveness*, not correctness.
4. git history shows the steps (`git log --oneline`), no secrets/DBs committed. The `pre-push` hook gates
   on the **build passing**, not e2e.

**Deeper pass** (a SEPARATE pass the user initiates — **not** a build step; the build loop never schedules it; proves *correctness*):
- a green, re-runnable `e2e/` Playwright suite (**passes twice**, webServer, per-test isolation, HTTP
  asserts via the request API) + the `qa` subagent as adversarial safety net;
- `test-critic` on core logic; `design-critic` on UI work; `docs` verifies the README from a clean clone.

For changes, the done-bar is the same (build + boot), **plus** the changed *behaviour*'s own flow must be
exercised (qa or e2e for that flow) since `smoke` only proves liveness; bugfixes reproduce-first.

Why the split (and the risk): a `smoke` boot check is cheap and catches "compiles but won't boot / a route
500s", but it does **not** catch a wrong-but-alive app — including a wholesale **copy** of a neighbouring
build (seen: a worker `cp -r`'d the finished sibling when it got stuck, and a copy boots green). Liveness
is the fast gate; the deeper pass and the build-isolation/anti-copy work are what catch correctness.

---

## If you edit this setup later

Keep gates **mechanical and runnable**. When a rule keeps getting skipped, don't shout louder —
either tie it to a concrete check, or move the work to a subagent that *runs* it. And when you
tighten something, do it because you *saw* it fail, the way everything here was.
