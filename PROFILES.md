# Using the pi profiles — a practical guide

The profiles are **role/stance prompts** layered on top of the universal global `AGENTS.md`
(persistence, subagents, honesty rules stay in force — a profile only adds a *stance*). This file is
the **how-to**: how to activate each one, when to use it, and example prompts. For the snapshot/restore
mechanics see [README.md](README.md); for *why* each rule exists see [RATIONALE.md](RATIONALE.md).

---

## Activating a profile — three ways

1. **At launch (alias):** `pi-research`, `pi-data`, `pi-spec`, `pi-analyze`.
   Needs a shell that has sourced `profiles.sh` — run `source ~/.zshrc` after adding a new alias.
2. **Mid-session:** `/profile` to pick from a list, or `/profile <name>` directly (the `profile-switcher`
   extension; the status bar then shows `profile:<name>`).
3. **`dev` auto-loads — no alias needed.** It's symlinked as `AGENTS.md` into the code roots
   (`~/projekt`, `~/ai_llm`, `~/Code`), so just `cd` into any project there and run `pi` — the dev rules
   apply by *location*. Elsewhere it's selectable as `/profile dev`.

> Profiles **append** a stance; they don't replace the universal rules. You can switch stance
> mid-session with `/profile` without restarting.

### Make sure it's actually on (easy to forget)

**Gotcha:** inside a code root (`~/projekt`, `~/ai_llm`, `~/Code`), a plain `pi` silently loads **`dev`**
(the `AGENTS.md` symlink), *not* the profile you meant. So for `analyze` (or any non-dev profile) in a
code root you **must** activate it explicitly — `pi-analyze`, or `/profile analyze` — or you'll quietly
get dev instead, with none of the profile's discipline. (This is exactly how an analysis run can come
out without decompose/grounding/`agent-docs/`.)

**Verify before you prompt:**
- The **status bar shows `profile:<name>`** (e.g. `profile:analyze`). If it doesn't, the profile isn't on.
- If `pi-analyze` isn't found, the shell hasn't sourced `profiles.sh` → `source ~/.zshrc` first.
- For `analyze` specifically, the signs it's working once running: it **fans out `scout` subagents**
  (rather than reading source inline) and writes its doc to **`agent-docs/`** (not the repo root).

---

## The profiles

### `dev` — build & change code  *(auto-loads in code roots)*
The master software-engineering discipline: strict TDD, decompose large builds, shadcn UI, verify via
the **`smoke`** gate, commit per step. Applies automatically anywhere under `~/projekt` / `~/ai_llm` /
`~/Code`.

- **Launch:** `cd <code-root>/<project> && pi`. For a **big from-scratch build**, add `--orchestrator`
  — it hard-blocks inline write/edit/bash from the main agent, forcing decomposition into fresh workers
  + the smoke gate (keeps context small; stops runaway/copy shortcuts).
- **Use it for:** writing or changing any code.
- **Example prompts:**
  - *Build:* `Build a <thing> from scratch, then push it to a new private GitHub repo. Stack: … Features: … Orchestrate this build per the dev.md "Orchestrate large builds" rule.`
  - *Feature:* `Add <feature> to this app. TDD it, don't break existing flows, then run smoke.`
  - *Bugfix:* `Fix: <repro steps>. Reproduce with a failing test first, then fix, then run the suite.`
- **Note:** the build loop ends at **smoke-green + push**. The deeper pass is *separate* — ask for it
  explicitly when you want it: `run qa`, `run the e2e suite`, `review the design`, `write the README`.

### `analyze` — understand an existing codebase  *(`pi-analyze`)*
Read-only comprehension. Decomposes via a **fresh `scout` per subsystem** (single-mode calls), grounds
every `file:line` claim (verified before "done"), and produces **one** document.

- **Launch:** `cd <any-codebase> && pi-analyze`  (or `/profile analyze`).
- **Use it for:** onboarding to, auditing, or planning changes in a codebase you didn't write.
- **Example prompts** (short — the profile carries the method; output lands in `agent-docs/`):
  - `Produce an architecture & onboarding map of this codebase.`
  - `Produce a tech-debt & risk audit.`
  - `Produce a modernization plan.`
  - `Answer this, tracing the real code path: how does auth/token refresh work?`

### `research` — sourced web research  *(`pi-research`)*
Rigorous, multi-source, cited research; prefers the `researcher` subagent, runs several focused searches
from different angles, surfaces disagreement.

- **Launch:** `pi-research`  (or `/profile research`).
- **Use it for:** questions needing current external info + verification (not code).
- **Example prompts:**
  - `Compare <X> vs <Y> for <use case> — current state, trade-offs, cite sources.`
  - `What changed in <library> v<N> that affects <our usage>? Cite the release notes.`

### `data` — document / log / transcript analysis  *(`pi-data`)*
Reads, extracts from, and summarizes files, logs, transcripts, exports — grounding every claim in the
source (file/line/timestamp/page), structured output, no fabrication.

- **Launch:** `pi-data`  (or `/profile data`).
- **Use it for:** analyzing a file/log/transcript/export — not source code (that's `analyze`).
- **Example prompts:**
  - `Summarize this meeting transcript: decisions, action items (owner + due date), open questions.`
  - `Go through this log and extract every error with its timestamp and likely cause, as a table.`

### `spec` — turn an idea into a build prompt  *(`pi-spec`)*
Clarifies a rough app idea (2–4 sharp questions) then outputs **one paste-ready build prompt** for `dev`.
Writes no code itself.

- **Launch:** `pi-spec`  (or `/profile spec`).
- **Use it for:** you have an app idea and want a clean, complete prompt to feed `dev --orchestrator`.
- **Example prompts:**
  - `I want a habit-tracker app. Make me a build prompt.`
  - Then paste its output into a fresh `pi` inside a code root (so the dev rules auto-apply).

---

## Which profile when (quick guide)

| You want to… | Profile |
|---|---|
| Build or change code | **dev** (auto in code roots; add `--orchestrator` for big builds) |
| Understand someone else's codebase | **analyze** |
| Turn an idea into a build prompt | **spec** |
| Research a question on the web | **research** |
| Analyze a file / log / transcript | **data** |

## Workflows — chaining profiles

Profiles are per-session stances; a real piece of work often spans several. Switch mid-session with
`/profile` (no restart), or launch each phase with its alias. Some recipes:

### Map an untested web app, then add a test suite  (`analyze` → `dev`)
You want to add test coverage to an existing app that has little or none. Map it for **testability
first** (so the test pass is targeted, not aimless), then add tests module by module.

1. **Map for testability** — `cd <app> && pi-analyze`, then (the profile carries the structure —
   Tier A/B/C, prioritized backlog, DI refactors, phases — so the prompt is short; output lands in
   `agent-docs/TESTABILITY.md`):
   ```
   Produce a testability map.
   ```
2. **Add the tests** — `cd <app> && pi` (dev rules auto-load in a code root), then, per the map's
   priority, one module at a time:
   ```
   Read agent-docs/TESTABILITY.md. Start with <top module>: add tests that import the REAL shipped functions,
   run against an isolated temp DB, and clean up. For currently-untested behaviour write
   CHARACTERIZATION tests that pin today's behaviour. If a module hard-codes a dependency, refactor
   it to accept that dependency (injection) first — behaviour-preserving — then test. Commit each
   module's tests separately and run the suite twice to show it green.
   ```
   **Nuance:** for *existing* code this is **characterization** testing (capture current behaviour),
   not red-green TDD. Pure test-first TDD is for the *new* behaviour you add afterward, once the
   safety net exists. `dev.md` already encodes this ("thin coverage → characterization tests first,
   then refactor"; real-code imports, isolated temp DB, run twice).

### Idea → shipped app  (`spec` → `dev --orchestrator`)
**spec** clarifies the idea and emits a paste-ready build prompt → paste it into `pi --orchestrator`
in a code root → the build runs decomposed and ends at **smoke**-green + push. Ask for the deeper pass
(`run qa`, `run the e2e suite`) separately when you want it.

### Onboard to / audit a codebase  (`analyze`)
One step: `pi-analyze` + a one-line deliverable (architecture map, tech-debt audit, modernization plan,
testability map, or a traced question). The profile carries the decompose + grounding method and writes
the doc to `agent-docs/`.

---

## Copy-paste prompts (cookbook)

Grab-and-go. Each block is the launch command + the prompt. Replace `<…>` placeholders.

### Build a new app from scratch  → `dev --orchestrator`
```
mkdir -p <code-root>/<new-project> && cd $_ && pi --orchestrator
```
```
Build a <thing> from scratch, then push it to a new private GitHub repo.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind 4, data in SQLite via Prisma, no auth.

Features:
- <feature 1>
- <feature 2>
- <feature 3>

Orchestrate this build per the dev.md "Orchestrate large builds" rule.
```
Ends at **smoke-green + push**. The deeper pass (e2e/qa/design-critic) is separate — ask for it below.

### Add a feature  → `dev`
```
cd <project> && pi
```
```
Add <feature> to this app. TDD it (test first, importing the REAL shipped code, against an isolated
temp DB, cleaned up after), don't break existing flows, then run smoke. Commit it as its own commit.
```

### Fix a bug  → `dev`
```
cd <project> && pi
```
```
Fix: <symptom + how to reproduce>. Reproduce it with a FAILING test first, watch it fail for the
right reason, then fix, then run the whole suite for regression. Commit the fix as its own commit.
```

### Run the deeper verification pass  → `dev`, after smoke is green
```
run qa
```
```
run the e2e suite — npx playwright test, twice in a row, and show it green
```
```
review the design with design-critic
```

### Analyze a codebase  → `analyze` (output → `agent-docs/`)
```
cd <codebase> && pi-analyze          # or: pi → /profile analyze  (check the status bar shows profile:analyze)
```
Pick one deliverable line:
```
Produce an architecture & onboarding map of this codebase.
```
```
Produce a tech-debt & risk audit.
```
```
Produce a testability map.
```
```
Produce a modernization plan.
```
```
Answer this, tracing the real code path: <your question>.
```

### Map an untested app, then add tests  → `analyze` → `dev`
See **Workflows → "Map an untested web app, then add a test suite"** above for the two prompts.

### Turn an idea into a build prompt  → `spec`
```
pi-spec
```
```
I want <rough app idea>. Make me a build prompt.
```
Then paste its output into `pi --orchestrator` inside a code root.

## Adding a new profile
Drop a new `<name>.md` in `~/.pi/profiles/` (it's immediately selectable via `/profile`); add a
`pi-<name>` line to `profiles.sh` if you want a launch alias. Keep it a **stance** (a different way of
working), not a task type — task-specific discipline belongs in `dev.md`'s sections. Distil its rules
from real runs, the way `dev.md` and `analyze.md` were.
