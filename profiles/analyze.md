# Codebase analysis — read-only, decompose, grounded

A **stance**, not a build: produce ONE grounded document about a codebase you did **not** write.
Never modify, build, test, or commit anything — the deliverable is understanding, written down and
verifiable. (v1, distilled from the first analysis run, `tv-clients-react-html-legacy`. Two failures
there became the two hard rules below: the decompose discipline slipped to reading source inline, and
some `file:line` refs were guessed — `routes.js` claimed 27 lines, was 51.)

## What you produce
ONE markdown document under **`agent-docs/`** (create the directory if it doesn't exist), **untracked
— do not commit it**. Keeping all agent output in one folder keeps the repo root clean and won't collide
with the project's own `docs/`. Pick the shape from the task:
- **Architecture & onboarding map** (default → `agent-docs/ARCHITECTURE.md`): what the app is + which
  targets it ships to; the tech stack and **why** each key library is there; entry points & boot/render
  flow; a module map (how the tree is organized and how the parts relate); the domain's defining
  concerns; the build/deploy topology; key conventions; a numbered **"start here" reading path**.
- **Tech-debt & risk audit** (`agent-docs/AUDIT.md`): outdated/abandoned deps, dead code, complexity
  hotspots, fragile/under-tested areas, footguns — **prioritized**, each with its evidence.
- **Testability map** (`agent-docs/TESTABILITY.md`): what it takes to add a test suite to an under-tested codebase.
  Cover: the **existing test infra** (runner, config, DB handling) or that there is none; a **Tier
  A/B/C classification** of the code — A = pure logic **worth unit-testing**, B = hard-to-test but worth
  protecting, **C = NOT worth unit-testing** (glue/UI/platform-coupled — say *why*, e.g. needs a real
  device/player); current **coverage by area**; the **highest-value untested units, prioritized** (with
  `file:line` refs and why each matters — compliance/security/fragile-first); the **dependency-injection
  refactor** each hard-to-test unit needs to become testable; and a **phased plan**. Pairs with `dev` to
  drive the test pass — see [PROFILES.md] → Workflows ("Map an untested web app, then add a test suite").
- **Modernization plan** (`agent-docs/MODERNIZATION.md`): concrete upgrade/refactor steps, ordered, built
  on an architecture understanding, with the risk and blast radius of each step.
- **Specific question** (`agent-docs/ANSWER.md`): answer one targeted question by tracing the real code
  path that answers it — not a general tour.

## Method — decompose, don't swallow the codebase
1. **Recon (inline, cheap).** Map the territory before delegating: read **manifests/config/entry only**
   — `package.json`/`pyproject.toml`/`go.mod`/etc., the dir tree (`ls`, `find -maxdepth`), routing/entry
   files, build config, `git log`, `README`. From this, detect the stack, build system, size, and the
   **subsystems**. Do NOT read source modules in this step.
2. **Fan out — one fresh `scout` per subsystem.** You, the main agent, **do not read source files
   inline.** That is the failure mode: it keeps the whole codebase in your window and you end up
   summarizing from a bloated context (the first run read 29 files itself and spawned only 2 scouts).
   Delegate each subsystem to a `scout` (fresh context). **Scale the count to size:** a small repo
   (≲150 source files) → ~3–5 scouts; a large one (>1000) → more, grouped by area, in waves. Never
   "just read it myself".
   - **Spawn each scout as its OWN single `subagent` call** (`agent: "scout"`, `task: "…"`, `context:
     "fresh"`) — do **NOT** use the parallel `tasks: [...]` array form. The model serializes that array
     as a JSON string and the call fails validation (`tasks.0: must be object`). One call per scout,
     sequential, is fine — decomposition is about *where the reading happens* (in fresh scouts, not your
     window), not about speed.
   - **Scouts RETURN their summary inline — never into the repo.** The scout's result comes back to
     you as the tool result; do **NOT** point a scout's `output` at a repo path. A leaked `scout-*.md`
     (or `context.md`) in the repo root is litter and breaks read-only — the **only** file written into
     the working tree is your final synthesized document under `agent-docs/`. If a scout must write
     scratch at all, send it to `$TMPDIR`, not the working tree.
   - **Scout output contract:** a distilled, grounded summary — the subsystem's responsibility; key
     files with **real `path:line` refs**; the main patterns/abstractions; entry points and how it
     connects to neighbouring subsystems; gotchas and risks. Never a raw file dump.
3. **Synthesize** the scout summaries into the chosen deliverable. Your job is the map and the
   connections **between** subsystems; the scouts supply the grounded detail inside each.

## Grounding — every claim is verifiable (hard rule)
The first run mixed real reads (`Player.js`: claimed 2081 lines, actually 2081 ✓) with guesses
(`routes.js` 27 vs 51 ✗, `App.js` 700 vs 914 ✗). A reading path with wrong line counts loses a new
dev's trust on the first click. So:
- Every `file` / `path:line` / "N lines" / symbol claim must come from an **actual read** (a scout's
  findings or your own recon read), **never estimated**. If you didn't see it, don't state it.
- **Verification pass — a required gate before "done":** for every file the document cites, confirm it
  exists and that any line count/ref is real (`wc -l`, re-read the cited lines). **Fix or delete every
  claim that doesn't check out.** Then state explicitly what you could NOT verify.
- Use "~N" only when you actually counted and rounded — never invent a number to look precise.

## Boundaries
- **Read-only.** Use read/grep/find/ls (and scouts) to understand; never edit, build, run, or commit.
  The only file you create is the analysis document under `agent-docs/`. Never modify an existing file
  (including a prior analysis doc you read for orientation) — only create the one new deliverable.
- **No hand-waving.** "Probably / likely / I assume" → either verify it or label it an **open question**.
  An honest gap beats a confident guess.
- **Speak the codebase's own language** — use its real product/module names (the first run correctly
  recovered "Viaplay Telenor"); don't impose generic labels.

## If the decompose rule slips
If you catch yourself reading the Nth source file inline, stop — that is the build loop's "implementing
inline" failure in analysis form. The mechanical fix (when the rule alone isn't enough) is an `--analyze`
gate that **blocks `read` on source files from the main agent**, forcing scout delegation — the analysis
twin of `--orchestrator`. Build it the same way once we've confirmed the rule slips across more runs.
