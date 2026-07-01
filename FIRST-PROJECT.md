# Your first project — build a web app from scratch

A guided first run: pi builds a small but real full-stack web app end-to-end, you watch it **decompose**
the work across fresh workers, and it stops at a **working, verified build**. Then the follow-up prompts
to take it further. Assumes you've done the [Quickstart](README.md#quickstart-staik-users) (pi installed,
`STAIK_API_KEY` set).

---

## 1. Pick an empty folder and launch in orchestrator mode

```sh
mkdir -p ~/code/my-first-app && cd ~/code/my-first-app
pi --orchestrator
```

`--orchestrator` makes pi **decompose** the build: the main agent plans and delegates each slice to a
**fresh worker**, so its own context stays small and a big build doesn't fall over. (For tiny edits you'd
use plain `pi`; for a from-scratch build, use `--orchestrator`.)

## 2. Paste the build prompt

A URL shortener is a great first project — small, but a real full-stack app (a form, a database, dynamic
routes, a stats page):

```
Build a URL shortener from scratch, then push it to a new private GitHub repo.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind 4, data in SQLite via Prisma, no auth.

Features:
- home page: a form to submit a long URL → shows the generated short link
- each link gets a unique 6-char url-safe slug (regenerate on collision)
- visiting /<slug> redirects (307) to the target and increments a click counter
- /stats page listing all links with slug, target URL, and click count
- reject non-http(s) URLs with a clear error

Orchestrate this build per the dev.md "Orchestrate large builds" rule.
```

Then just watch — you don't need to do anything while it works.

## 3. What happens (the phases)

1. **Plan** — pi produces a context + plan (a `context.md` / `plan.md` handoff), a `todo` list, and the
   file/type contract each worker builds against.
2. **Build, slice by slice** — one **fresh worker per slice** (scaffold → data layer → API routes →
   pages → …), each committing its own step. The verbose build/test output stays inside the workers, not
   your window — that's what keeps it stable.
3. **Smoke gate** — the `smoke` agent runs the production build, boots the app, and checks every route
   serves (non-5xx) + the home page renders. **This is "done".**
4. **Push** — granular commits, pushed to a new private GitHub repo.

If a worker gets stuck, a watchdog frees it; if a route 500s, `smoke` catches it and it gets fixed before
"done". When pi reports **smoke-green + pushed**, you have a working, verified app.

> **"As far as it can" = smoke-green + push.** The build loop deliberately stops there. Deeper checks
> (full end-to-end tests, design review) are a *separate* pass you ask for next — see step 5.

## 4. See it actually run

```sh
npm install          # usually already done by the build
npx prisma db push   # set up the SQLite DB (skip if the build already did)
npm run dev          # → open http://localhost:3000
```

Submit a URL, click the short link, check `/stats`.

## 5. Continue — the follow-up prompts

Keep going in the **same folder**. Plain `pi` for small stuff; the deeper checks are things you ask for
explicitly (the build loop won't run them on its own).

**Verify deeper — prove it's *correct*, not just alive:**
```
run qa
```
```
add an e2e/ Playwright suite covering every flow, run npx playwright test twice, and show it green
```
```
review the design with design-critic and apply the fixes worth doing
```

**Add a feature:**
```
Add custom slugs: let the user optionally choose their own slug, and reject one that's already taken.
TDD it, don't break existing flows, then run smoke.
```

**Fix a bug:**
```
Fix: <what's wrong + how to reproduce it>. Reproduce with a FAILING test first, then fix, then run the
whole suite for regression.
```

**Polish the UI:**
```
Make the home page and /stats look polished with shadcn — a consistent theme, generous spacing, and
hover / empty / error states.
```

---

That's the whole loop: **`pi --orchestrator` + a build prompt → smoke-green + push → follow-up prompts.**
For the full prompt cookbook, every profile, and multi-step workflows (e.g. adding tests to an existing
codebase), see **[PROFILES.md](PROFILES.md)**.
