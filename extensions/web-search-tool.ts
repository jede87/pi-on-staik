import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// A `web_search` tool for pi, backed by a self-hosted SearXNG instance.
//
// qwen3.5 reaches for explicit web search on tasks (a harness habit). pi has no
// client-side web_search tool — the Staik endpoint does search server-side and AGENTS.md says
// "there is no web_search tool" — so the model spawned a web_search SUBAGENT that
// HUNG for 60s and jammed the whole shortlink14 build (workers queued behind it).
//
// Giving it a real, BOUNDED tool fixes both: it satisfies the instinct, and the
// hard timeout means a slow/hung search returns an error instead of freezing the
// build. Backend is a self-hosted SearXNG instance (set SEARXNG_URL). Note: the Staik
// endpoint also does web search server-side via the X-Staik-Web-Search header, so this
// explicit tool is optional — use it when you want direct control. Same JSON contract the gateway uses
// (gateway/search.py): {results: [{title, url, content}]}.
//
// For library/framework/API docs, context7 is still the better tool (version-
// specific docs, not noisy search) — the description says so.

const SEARXNG_URL = (process.env.SEARXNG_URL || "http://localhost:8888").replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;
const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 10;

interface SearxResult {
  title?: string;
  url?: string;
  content?: string;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web search",
    description:
      "Search the web via a self-hosted SearXNG instance. Returns title/url/snippet for the top " +
      "results. For library/framework/API docs prefer context7 (version-specific docs); use this " +
      "for general or current web research. Args: query (required), max_results (optional, default 5).",
    promptSnippet: "web_search — search the web (self-hosted SearXNG); for lib docs prefer context7",
    parameters: Type.Object({
      query: Type.String({ description: "The search query." }),
      max_results: Type.Optional(
        Type.Number({ description: `How many results to return (1–${MAX_RESULTS}, default ${DEFAULT_RESULTS}).` }),
      ),
    }),
    async execute(_toolCallId, params: { query?: string; max_results?: number }, signal, _onUpdate, _ctx) {
      const query = String(params.query ?? "").trim();
      if (!query) {
        return { content: [{ type: "text" as const, text: "web_search: `query` is required." }], details: { error: "no_query" } };
      }
      const n = Math.min(MAX_RESULTS, Math.max(1, Math.floor(Number(params.max_results) || DEFAULT_RESULTS)));
      const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json`;

      // Hard timeout so a slow/hung search can never freeze the agent — abort on
      // either our timer or pi's own cancellation signal.
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "pi-web-search/1.0", Accept: "application/json" },
        });
        if (!resp.ok) {
          return {
            content: [{ type: "text" as const, text: `web_search: SearXNG returned HTTP ${resp.status}.` }],
            details: { error: "http", status: resp.status },
          };
        }
        const data = (await resp.json()) as { results?: SearxResult[] };
        const results = Array.isArray(data.results) ? data.results.slice(0, n) : [];
        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: `No web results for: ${query}` }], details: { results: [] } };
        }
        const text = results
          .map((r, i) => `${i + 1}. ${r.title ?? "(no title)"}\n   ${r.url ?? ""}\n   ${(r.content ?? "").trim()}`)
          .join("\n\n");
        return {
          content: [{ type: "text" as const, text: `Web results for "${query}":\n\n${text}` }],
          details: { results },
        };
      } catch (err) {
        const aborted = controller.signal.aborted;
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: aborted
                ? `web_search: timed out after ${TIMEOUT_MS / 1000}s — try a narrower query or proceed without it.`
                : `web_search failed: ${msg}`,
            },
          ],
          details: { error: aborted ? "timeout" : "fetch_error", message: msg },
        };
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    },
  });
}
