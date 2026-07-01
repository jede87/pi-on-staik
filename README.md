# Pi on Staik — a ready-to-use coding-agent setup

Get the **pi** coding agent (`@earendil-works/pi-coding-agent`) running as an autonomous,
Claude-Code-like dev + codebase-analysis agent **on Staik** — pre-configured for the Staik LLM
endpoint (`https://api.staik.se/v1`, model `qwen3.5:35b-a3b-thinking`). If you already have a Staik
API key, you can be up and running in a few minutes (see *Restore on a new machine* / *Quick start*).

This folder is a **copy** of the live files for reference/restore. Live files live in `~/.pi/`,
`~/.config/mcp/`, the code roots, and `~/.zshrc` (see *Where things live*). For the story of
*why* each rule exists, see [RATIONALE.md](RATIONALE.md).

---

## Quickstart (Staik users)

You need **Node.js** and a **Staik API key**. ~5 minutes:

```sh
# 1. Install pi + the packages this setup uses
npm i -g @earendil-works/pi-coding-agent
pi install npm:pi-subagents npm:pi-mcp-adapter npm:@plannotator/pi-extension npm:pi-execution-time

# 2. Clone this repo and copy the setup into place
git clone https://github.com/jede87/pi-on-staik && cd pi-on-staik
mkdir -p ~/.pi/agent/extensions ~/.pi/agent/agents ~/.pi/profiles ~/.config/mcp
cp global/*             ~/.pi/agent/
cp profiles/*.md        ~/.pi/profiles/
cp profiles/profiles.sh ~/.pi/profiles.sh
cp extensions/*         ~/.pi/agent/extensions/
cp agents/*             ~/.pi/agent/agents/
cp mcp/global.mcp.json  ~/.config/mcp/mcp.json   # optional: add your context7 / GitHub keys inside

# 3. Add your Staik API key + the profile aliases to your shell config (~/.zshrc)
echo 'export STAIK_API_KEY="paste-your-staik-key-here"' >> ~/.zshrc
echo '[ -f ~/.pi/profiles.sh ] && source ~/.pi/profiles.sh' >> ~/.zshrc
source ~/.zshrc

# 4. (optional) auto-load the dev rules in your code folders — repeat per code root
ln -s ~/.pi/profiles/dev.md ~/code/AGENTS.md
```

Then run it:

```sh
pi                 # dev agent — build & change code (inside a project folder)
pi --orchestrator  # big from-scratch builds (decomposed; keeps context small)
pi-analyze         # read-only codebase analysis → writes to agent-docs/
```

The Staik endpoint + model are **pre-configured** — the only thing you supply is `STAIK_API_KEY`.

👉 **New here? Build your first app step by step in [FIRST-PROJECT.md](FIRST-PROJECT.md)** — one prompt
to a working, verified web app, plus what to prompt next. Then **[PROFILES.md](PROFILES.md)** has the
full copy-paste prompt cookbook for every task (build, add tests, analyze a codebase…).

---

## Goal & approach

The model is already the strongest Staik serves — so "smarter" came from **scaffolding around
the model**, not model tuning:

1. **Autonomy** — a lean global `AGENTS.md`: finish whole tasks, don't stop to ask.
2. **Discipline (code)** — `dev.md`: strict TDD, DRY, real build/e2e verification, git per step.
3. **A verification team** — focused subagents that *run* the work, not just read it: `qa`,
   `test-critic`, `docs`, `design-critic`.
4. **Grounding** — MCP servers: context7 (current docs), shadcn (UI components/themes),
   playwright (screenshots).
5. **Roles** — profiles so pi also does research / data / spec work, not just code.

**Core finding (after ~6 build/feature/bugfix test runs):** *mechanical, verifiable* rules bite
(run `git status`, run `npx playwright test` twice, check `○ Static`); *"remember to do X"* rules
slip. So every gate is phrased as a concrete check. See [RATIONALE.md](RATIONALE.md).

---

## What's in this snapshot

| Path | Live location | Purpose |
|------|---------------|---------|
| `global/AGENTS.md` | `~/.pi/agent/AGENTS.md` | **Universal** agent behaviour — every session |
| `global/settings.json` | `~/.pi/agent/settings.json` | provider/model/thinking + packages |
| `global/models.json` | `~/.pi/agent/models.json` | Staik model catalog (must match server caps) |
| `profiles/dev.md` | `~/.pi/profiles/dev.md` | **Master dev rules** — code roots symlink to this |
| `profiles/research.md` `data.md` `spec.md` | `~/.pi/profiles/` | role prompts (research / data / spec-writer) |
| `profiles/analyze.md` | `~/.pi/profiles/` | **codebase-analysis** stance — read-only, decompose via scouts, grounded; produces ONE doc (validated on 2 stacks) |
| `profiles/profiles.sh` | `~/.pi/profiles.sh` | `pi-research`/`pi-data`/`pi-spec`/`pi-analyze` aliases |
| `extensions/profile-switcher.ts` | `~/.pi/agent/extensions/` | `/profile` picker — switch role mid-session |
| `extensions/auto-continue.ts` | `~/.pi/agent/extensions/` | auto-resumes a turn that ended empty (via `sendUserMessage{deliverAs:"followUp"}`) |
| `extensions/orchestrator-mode.ts` | `~/.pi/agent/extensions/` | `pi --orchestrator`: hard-blocks write/edit/bash + forces fresh subagents + injects a per-subagent `timeoutMs` watchdog (600s worker / 1200s qa·docs·design-critic) → main agent must delegate, and a hung subagent can't freeze the build |
| `extensions/todo-tool.ts` | `~/.pi/agent/extensions/` | registers a `todo` task-list tool (the model kept reaching for one); anti-regression |
| `extensions/web-search-tool.ts` | `~/.pi/agent/extensions/` | a `web_search` tool backed by a self-hosted SearXNG (set `SEARXNG_URL`; Staik also does server-side search via the header), hard 10s timeout |
| `agents/smoke.md` | `~/.pi/agent/agents/` | **build-loop done-gate**: prod build + boot + every top route non-5xx + home renders (light; not e2e) |
| `agents/qa.md` | `~/.pi/agent/agents/` | deeper pass: runs the built app, verifies flows end-to-end |
| `agents/test-critic.md` | `~/.pi/agent/agents/` | mutates code, finds tests that verify nothing |
| `agents/docs.md` | `~/.pi/agent/agents/` | writes + verifies the README from a clean clone |
| `agents/design-critic.md` | `~/.pi/agent/agents/` | screenshots the app, critiques the visual design |
| `mcp/global.mcp.json` | `~/.config/mcp/mcp.json` | context7 + shadcn + playwright (key/token redacted) |

---

## AGENTS.md layering

pi loads the global `~/.pi/agent/AGENTS.md` **plus** every `AGENTS.md` from cwd up the tree.

- **Global** = universal behaviour only (persistence, verify, subagents, lookups, honesty).
- **Dev rules** live in one master `~/.pi/profiles/dev.md`, **symlinked** into each code root
  (`~/projekt`, `~/ai_llm`, `~/Code`) → one file to edit, auto-loads wherever there's code,
  and also selectable as `/profile dev`. Symlinks because dev discipline should apply
  *automatically by location* (can't forget) while staying a single source of truth.
- **Project specifics** — a project can layer its own `AGENTS.md` on top.

`dev.md` sections: **Orchestrate large builds** (context hygiene — verbose work + per-slice
implementation in fresh subagents, file-handoff via context.md/plan.md; keeps the window under
the ~60k empty-completion danger zone) · **Changing existing code** (feature/change/bugfix
playbooks, bugfix = reproduce-first) · **TDD** (strict, test the shipped code, test quality > count) · **DRY** ·
**UI** (shadcn, polished look) · **Verify in the target environment** (done-bar = build + dynamic
pages + `smoke` boot check; deeper pass = green re-runnable e2e + qa, test-critic, design-critic,
docs, run after it boots) · **Version control** (git init, commit each step; pre-push gates on the
build passing, not e2e).

---

## The verification team (subagents)

Custom subagents live in `~/.pi/agent/agents/*.md` (pi-subagents). Each *runs* the work and
reports back; the main agent applies fixes. Invoke with natural language ("use qa to…").

| Agent | Catches | How |
|-------|---------|-----|
| **smoke** | "it compiles but won't boot / a route 500s" — the build-loop **done-gate** | prod build + start the server + GET every top route (non-5xx) + Playwright loads home (200, no error overlay); light, not e2e |
| **qa** | "passes tests + builds clean, but the app is broken" — the **deeper pass** | starts the app, hits flows with curl/Playwright; runs the project's e2e suite |
| **test-critic** | tests that pass but verify nothing | mutates the real code, checks the tests go red (or runs Stryker) |
| **docs** | thin/wrong README, broken setup | writes the README, runs the setup from a clean copy |
| **design-critic** | functional-but-ugly UI | screenshots the running app and judges spacing/hierarchy/contrast/polish |

Builtin pi-subagents also available: `scout`, `planner`, `reviewer`, `oracle`, `researcher`, `worker`.

---

## Roles / profiles — two ways to switch

> **Using the profiles day-to-day** (how to activate each, when to use it, example prompts):
> see **[PROFILES.md](PROFILES.md)**. This section is just the mechanism.

- **At launch:** `pi-research` / `pi-data` / `pi-spec` / `pi-analyze` aliases.
- **Mid-session:** `/profile` → pick from `~/.pi/profiles/*.md` (the `profile-switcher` extension
  appends it via the `before_agent_start` event; status bar shows `profile:<name>`).

`dev` is not an alias-profile you must remember — it auto-loads in code roots (the symlinks). The
others are personas you opt into. Add a role = drop a new `.md` in `~/.pi/profiles/`.

---

## MCP servers (lazy — connect on first use, ~0 idle cost)

**Global** (`~/.config/mcp/mcp.json`):
- **context7** — current, version-specific library docs (`context7_resolve-library-id` → `context7_query-docs`). Prefer it over `web_search` for library/API docs. (For general web search there's the `web_search` tool, plus the Staik endpoint's built-in server-side search via the `X-Staik-Web-Search` header.)
- **shadcn** — UI components, blocks, and TweakCN themes (`shadcn_get_component`, `shadcn_list_blocks`, `shadcn_apply_theme`). Uses a GitHub token (higher rate limit).
- **playwright** — drive a browser / take screenshots (used by `design-critic`).

> After editing `mcp.json`, **restart pi** — servers are registered at launch. They then connect
> lazily on first tool call (a `(not cached)` entry in `/mcp` is normal until used).

---

## Restore on a new machine

1. `npm i -g @earendil-works/pi-coding-agent`; install packages (`pi install npm:pi-subagents npm:pi-mcp-adapter npm:@plannotator/pi-extension npm:pi-execution-time`).
2. Copy `global/*` → `~/.pi/agent/`; `profiles/*` (incl. `profiles.sh`) → `~/.pi/profiles/` (and `~/.pi/profiles.sh`); `extensions/*` → `~/.pi/agent/extensions/`; `agents/*` → `~/.pi/agent/agents/`. (This brings everything: the `dev`/`analyze`/role profiles + `pi-analyze` alias, the `smoke`/`qa`/`test-critic`/`docs`/`design-critic` agents, the `auto-continue`/`orchestrator-mode`/`todo-tool`/`web-search-tool`/`profile-switcher`/`image-attacher` extensions, and `settings.json` with its `subagents.agentOverrides`.)
   - `settings.json`'s `subagents.agentOverrides` (for `scout`/`context-builder`/`researcher`) set
     `subagentOnlyExtensions` to **`~/.pi/agent/extensions/web-search-tool.ts`** — pi expands the `~` to
     the current user's home when it loads the extension (verified: `resolvePath` defaults to
     `expandTilde: true`), so this is **portable as-is, no edit needed**.
3. Copy `mcp/global.mcp.json` → `~/.config/mcp/mcp.json` and fill in the real **context7 API key** and **GitHub token** (redacted here).
4. Recreate code-root symlinks: `ln -s ~/.pi/profiles/dev.md <code-root>/AGENTS.md` for each of `~/projekt`, `~/ai_llm`, `~/Code`.
5. Add to `~/.zshrc`: `[ -f ~/.pi/profiles.sh ] && source ~/.pi/profiles.sh` (see `zshrc-snippet.sh`).
6. Set `STAIK_API_KEY` in the environment (referenced by `models.json`).

> `models.json` `contextWindow`/`maxTokens`/`reasoning` are **declarations that must match what the
> Staik endpoint actually serves**. Overstating context → the backend 400s.

### Quick start for Staik users
This snapshot is **pre-configured for Staik** — the endpoint (`https://api.staik.se/v1`) and model
(`qwen3.5:35b-a3b-thinking`) are already set in `settings.json` / `models.json`. To get going you only need:
- **A Staik API key** — export it as `STAIK_API_KEY` (referenced by `models.json`). That's the whole model setup.
- **`web_search` (optional):** the Staik endpoint already does web search **server-side** via the
  `X-Staik-Web-Search` header (on by default), so you usually need nothing extra. The explicit `web_search`
  tool points at a self-hosted SearXNG — set `SEARXNG_URL` if you run one; otherwise it just times out
  (bounded, won't hang) and the agent proceeds.
- **context7 / shadcn MCP** need their own keys (redacted here — fill in on restore); playwright needs none.

### Sharing this snapshot
This folder **is** the shareable artifact — copy it (git/scp/USB) and follow the steps above.
**Secrets are redacted** (context7 key, GitHub token, `STAIK_API_KEY`), so it's safe to share; each person
sets their own Staik key. Nothing here writes live credentials.

> Secrets: the live `mcp.json` holds a real context7 key + GitHub token; this snapshot keeps them
> redacted. Never commit the live values.
