# Development rules

Applies to code under this directory. Extends the global agent instructions in
`~/.pi/agent/AGENTS.md` with software-specific discipline. These apply whether you're
building something new or changing existing code — the "Changing existing code" section
below adds the steps specific to working in a codebase that already exists.

## Orchestrate large builds — keep context small (context hygiene)
A from-scratch build or any multi-feature task must **not** run in one growing window. On this endpoint, context bloat past ~60k tokens is where the thinking model starts over-thinking, truncating, and emitting empty/dropped turns — so decompose the work instead of carrying it all in one context. (Small single-file changes — see "Changing existing code" — don't need this.) Mechanical rules:
- **Verbose work runs in a subagent, never inline.** Production build + boot check, `npx playwright test`, long install/test loops → delegate to `smoke` (the build-and-boot done-gate) or `qa` (the deeper e2e pass), or a `worker`. Their output dies with the child; only a pass/fail summary returns. If you catch yourself reading a full `[WebServer]`/build log in your own window, stop and move it to a subagent.
- **Implement per vertical slice in a FRESH worker.** Delegate each slice with `context=fresh, reads=context.md+plan.md`. **Fresh, not fork** — a forked child inherits the parent's tool-output history (build/test logs included) and defeats the purpose. (Don't set `outputMode=file-only` unless you also give an `output` path — fresh workers are small, so a concise inline summary is fine.)
- **Hand off via files, not transcript.** `context-builder` → `context.md`; `planner` (reads `context.md`) → `plan.md`. `plan.md` is the integration **contract** — file names, shared types, function signatures — so independent fresh slices fit together without seeing each other. Have `oracle` review `plan.md` before workers start on a non-trivial build.
- **Commit each slice as it goes green** (you already do this; it also caps blast radius).
- **The build loop ends at `smoke`-green — `smoke` is the verification subagent, not `qa`.** A from-scratch build's plan and todo run to: slices implemented + committed, production build clean, **`smoke` green** (build + boot + every route serves), and the push. That is "done". Do **NOT** put `qa`, an `e2e/` suite, `test-critic`, `design-critic`, or `docs` in the build plan/todo — they are the separate deeper pass and run **only when the user explicitly asks**. Never schedule `qa` as the build's final verification; use `smoke`.
- **Gate:** if your own context exceeds ~60k mid-build, you're implementing inline — stop and re-delegate.

## Changing existing code (features, changes, bugfixes)
Most real work edits code that already exists, which needs more care than greenfield. Before and while you change anything:
- **Understand first.** Read the relevant code and its existing tests, and match the codebase's conventions and patterns — don't impose greenfield habits. Use the `scout` subagent for an unfamiliar area.
- **Establish a baseline.** Run the existing tests and build **before** you change anything, so you know the starting point is green (and which failures, if any, predate you).
- **Preserve behaviour.** Existing tests must stay green. If your change legitimately changes behaviour, update the affected test deliberately and say why — never delete or weaken a test just to make it pass.
- **Keep the diff minimal.** Change only what the task needs. No drive-by rewrites, renames, or reformatting of unrelated code — they bury the real change and wreck review.
- **Commit as focused commits** scoped to the task, with messages that say what changed and why.

Then, by task type:
- **Bugfix — reproduce first (hard rule).** Write a **failing test that captures the bug** before you touch the fix. Watch it fail for the right reason, make the fix, watch that test go green, then run the whole suite for regression. No fix ships without a test that would have caught the bug.
- **Feature on existing code.** TDD the new behaviour, integrate it following existing patterns, and don't break existing flows. Clear the done-bar (build + `smoke` boot), then exercise the new flow itself in the deeper pass — extend the `e2e/` suite and/or run `qa` to cover it.
- **Change / refactor.** Behaviour-preserving: the tests stay green throughout. If coverage of the area is thin, add characterization tests **first** as a safety net, then refactor.

Verification for a change meets the **same done-bar as a build** (see "Verify in the target environment"), scoped to what you touched **plus regression**: the full unit suite green, a clean production build, and the app still **boots with every route serving** (`smoke`). Because `smoke` only proves liveness, a change to *behaviour* must also **exercise the affected flow itself** — run `qa` on that flow, or extend the `e2e/` suite to cover it (green, run twice) — especially for higher-risk changes; run `test-critic` on any new or changed tests. Booting is the done-gate; a behavioural change whose own flow was never exercised is not done.

## Test-driven development — strict, always
Write code test-first. No production code without a failing test driving it.
1. **Red:** write the smallest test for the next behaviour and run it to confirm it fails for the right reason. No implementation yet.
2. **Green:** write the minimum code to make it pass, then run the tests to confirm green.
3. **Refactor:** clean up code and tests while keeping them green; re-run after.
4. One small cycle at a time — don't batch many features before testing.
- Show the failing test before the implementation that satisfies it.
- Not done until the full suite passes; if you can't run the tests, say so explicitly.
- **Tests must be isolated and leave the repo clean.** Never run against a real/dev database, shared files, or a live service. Create any test DB/fixture **outside the repo** — under the OS temp dir (`os.tmpdir()` / `$TMPDIR`), never inside the project (a temp DB in `prisma/` or the repo root will get committed). Delete it in teardown. **After running the suite, run `git status`: if any new file appears (stray `*.db`, `*-wal`, `*-shm`, temp dirs), the teardown is broken — fix it before moving on.** A test run must never destroy real data or leave litter.
- **Tests must exercise the real shipped code.** Import and call the actual functions/modules under test — never reimplement their logic in the test (that tests a copy and gives false confidence). If a module is hard to test because it hard-codes a dependency (e.g. a DB client), refactor it to accept that dependency (injection) so the real path runs. Don't hand-roll schema/DDL inside a test that duplicates the real migration — derive the test DB from the real schema.
- **Test quality beats test count.** A test that stays green when you break the code it covers is worthless. Prefer tests that actually pin behaviour — real assertions on the shipped function, plus error and edge paths — over happy-path filler or assertions that can't fail.
- Exception: genuinely untestable glue (e.g. a one-line config value) — call it out when you skip a test.

## Keep it DRY
- Before writing new code, search for existing helpers/utilities/types/patterns and **reuse them**.
- No copy-paste duplication. If the same logic appears twice, extract it into one named function/module.
- Put shared data/business logic behind a small data/service layer instead of scattering the same calls (DB queries, fetches) inline across pages/routes/components.
- Single source of truth for constants, config, and shared types.
- Balance: factor out on the second occurrence, not in anticipation of one.

## UI — use shadcn, don't hand-roll
- For any web UI, build with **shadcn/ui** components via the **shadcn MCP** (the `mcp` proxy tool) instead of hand-rolling interactive primitives. Use it to look up and add the components you need — button, input, card, dialog, table, form, toast, etc. — then compose the UI from them; they're accessible and visually consistent by default.
- Install components into the project the proper way (`npx shadcn@latest add <component>`), don't paste partial copies. Hand-written Tailwind is fine for layout, spacing, and one-off styling — but not for primitives shadcn already provides.
- This produces a polished UI without you reinventing form controls; reach for it on greenfield apps by default.
- **Aim for a polished, coherent look — not just functional markup.** Apply a consistent theme (a shadcn/TweakCN theme via `shadcn_apply_theme`, or a defined palette + spacing scale), generous and consistent spacing, clear visual hierarchy (the primary action stands out), aligned layouts with a sensible max-width, and **finished states** — hover, focus, loading, empty, and error — not only the happy path. Support dark mode and make it responsive. If the user gives a reference (a site, screenshot, or theme), match it.

## Verify in the target environment
The build-loop **definition of done** is: unit tests green, a clean production build, and the app **actually boots with every route serving** — proven by the `smoke` subagent. Full end-to-end coverage is a **deeper pass run after it boots (or on request)**, not part of the default done-bar. Run every check below in a subagent (`smoke`/`qa`), never inline — the verbose output is what balloons the orchestrator's context.

**Done-bar — every build/change must clear this (delegate to `smoke`):**
- **Unit tests green**, testing the real shipped code, isolated, leaving the repo clean (see TDD).
- **Production build runs clean and is read** (`next build` / `npm run build`) — not just the dev server. Don't claim it passed without running it.
- **Data-driven pages are dynamic, not statically baked.** A page/route serving DB/runtime data must not be `○ Static` (Next.js); if it is, add `export const dynamic = "force-dynamic"` or proper revalidation. Confirm it in the build output.
- **The app boots and every top-level route serves.** `smoke` builds, starts the server, GETs every route (asserting **non-5xx**), and loads the home page in Playwright (200, no error overlay). A route that 500s or a server that won't boot is a FAIL — fix it and re-run `smoke` until green. **This is "done" for the build loop.** (`smoke` proves it's *alive*, not that every flow is *correct* — that's the deeper pass.)
- **Don't hang on a long-running server.** When you start a dev/prod server (or any process that doesn't exit) in a shell command, background it **with output redirected to a file** — `npm run start > /tmp/srv.log 2>&1 &` — never `... 2>&1 &` on the command's own stdout: the process keeps the pipe open, the shell call never gets EOF, and the run stalls. Poll readiness with `curl`, then kill the server. (`smoke`/`qa` already do this — follow the same rule anywhere you start a server.)

**Deeper verification — a SEPARATE pass the user initiates, NOT a build step.** The build loop stops at `smoke`-green + push; it does **not** schedule any of the following and must not put them in a build plan/todo. Run them **only when the user explicitly asks** (e.g. "run e2e", "run qa", "review the design"). They prove the app is *correct*, not just alive — a user-facing flow shouldn't ship long-term without them — but that is the user's call to make after the build reports done:
- **Full end-to-end flows (`qa` + an `e2e/` suite).** Trace each real user path and prove it with a green, re-runnable `e2e/` Playwright suite: it must actually pass (`npx playwright test` shown green, **twice in a row** to prove no state leaks), include a `webServer` block so it runs standalone, reset/seed the DB per test (or generate unique data — never a hard-coded id/slug that collides on rerun), and assert HTTP-level outcomes (status, redirects, `Location`) via the **request / APIRequestContext** — never `page.goto()` (the browser auto-follows redirects, so a 307 never surfaces). The **`qa` subagent** is the adversarial safety net on top: it runs the documented setup from a clean copy, exercises every feature against the live server (form submit, state changes, redirects with `curl`, DOM with Playwright), and probes empty/invalid/not-found paths. `smoke` proves it boots; `qa` proves it works.
- **`test-critic`** on non-trivial logic — mutates the real code and reports tests that stay green when behaviour breaks. Strengthen what it finds. (Runs Stryker if set up.)
- **`design-critic`** on UI work — screenshots the running app and critiques spacing, hierarchy, alignment, contrast, consistency, and polish (against the reference, if any). Apply the fixes worth doing; functional-but-ugly isn't done when the task is about how it looks.
- **`docs`** — writes and verifies the README by running the setup from a clean clone; confirm a fresh clone starts and fix any missing/wrong step (e.g. an unmentioned migration).
- The reviewer must actually run the build and tests and interpret the output — not just read the diff.

## Version control — commit each step
- If the project isn't a git repo yet, run `git init` **before** writing code, and add a `.gitignore` that excludes `node_modules/`, build output (`.next/`, `dist/`, `build/`), env files (`.env*`), local databases (`*.db`, `*.sqlite`), and **agent/tool scratch** (`.playwright-mcp/`, `screenshots/`, `test-results/`, `playwright-report/`). Scratch that an agent creates should go to `$TMPDIR`, not the repo — but gitignore it too, so a stray file can never be committed.
- **Commit each step as its own commit — a single "implement everything" commit is not acceptable.** Make a distinct commit for: scaffold, the data layer + its tests, each feature (with its tests), and each bug fix (plus the e2e suite, only if the deeper pass is run). Each commit should leave the app in a coherent state. Before reporting done, run `git log --oneline` and confirm the history actually shows these steps — if it's one or two giant commits, you batched; commit more granularly from here on.
- Commit only after the relevant tests/build pass — don't commit a known-broken state (unless it's an explicit WIP you label as such).
- **Before committing, run `git status` and stage only the files that belong to the change** (`git add <paths>`), never a blind `git add -A` when untracked files are present — that sweeps in scratch (screenshots, temp DBs, tool output). The repo should never gain a file you didn't intend.
- **If a hook rejects your commit** (e.g. a `commit-msg` hook enforcing Conventional Commits), read its message and retry with a conforming one — don't give up or bypass it with `--no-verify`.
- **Write commit messages in Conventional Commits style: a `type:` prefix + a concise imperative summary.** Types: `feat:` (new feature/behaviour), `fix:` (bugfix), `refactor:` (behaviour-preserving change), `test:` (tests only), `docs:` (docs/README), `chore:` (deps, config, tooling, build). Examples: `feat: add custom slug with collision retry`, `fix: move /<slug> redirect to route.ts`, `test: reset DB per e2e run for isolation`, `chore: add playwright webServer config`, `docs: document the DB setup step`. (Map the task type: bugfix → `fix:`, feature → `feat:`, refactor → `refactor:`.)
- **Enforce it mechanically.** When you `git init` a new project, install hooks in `.githooks/` (executable) and run `git config core.hooksPath .githooks` so they travel with the repo:
  - a **`commit-msg`** hook that rejects any message without a valid Conventional Commits prefix;
  - for a **web app** (Next/React), a **`pre-push`** hook that blocks the push unless the **production build passes** (`next build` / `npm run build` exits 0) — the mechanical backstop for the "it must actually build and boot" done-bar, so a broken build can never be pushed. (Full `e2e/` coverage is the deeper pass, run separately; it does not gate the push. If you later want e2e enforced before release, add it as a CI/pre-release check, not the push gate.)
- When the qa agent finds a bug, fix it and commit the fix as its own commit so the bug→fix is visible in history.
- **Never commit** secrets, `.env` files, credentials, local databases, or `node_modules/`.
