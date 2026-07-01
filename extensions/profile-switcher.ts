import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Role profiles live as markdown files in ~/.pi/profiles/ (research.md, data.md, spec.md, analyze.md, …).
// `/profile` picks one and layers it on top of the system prompt for the rest of the session,
// without restarting — the same role text the pi-research/pi-data/pi-analyze aliases append at launch.
const PROFILES_DIR = join(homedir(), ".pi", "profiles");

let activeProfile: { name: string; content: string } | null = null;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("profile", {
    description: "Switch the active role profile (research / ops / data / …)",
    handler: async (_args, ctx) => {
      let files: string[];
      try {
        files = readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".md"));
      } catch {
        ctx.ui.notify(`No profiles directory at ${PROFILES_DIR}`, "error");
        return;
      }
      if (files.length === 0) {
        ctx.ui.notify(`No .md profiles found in ${PROFILES_DIR}`, "info");
        return;
      }

      const names = files.map((f) => f.replace(/\.md$/, ""));
      const CLEAR = "✕ none (clear profile)";
      const choice = await ctx.ui.select("Select a role profile:", [...names, CLEAR]);
      if (!choice) return; // user cancelled

      if (choice === CLEAR) {
        activeProfile = null;
        ctx.ui.setStatus("profile", undefined);
        ctx.ui.notify("Profile cleared — back to default behaviour.", "info");
        return;
      }

      try {
        const content = readFileSync(join(PROFILES_DIR, `${choice}.md`), "utf-8");
        activeProfile = { name: choice, content };
        ctx.ui.setStatus("profile", `profile:${choice}`);
        ctx.ui.notify(`Profile active: ${choice}`, "info");
      } catch (e) {
        ctx.ui.notify(`Failed to read profile "${choice}": ${String(e)}`, "error");
      }
    },
  });

  // While a profile is active, append it to the assembled system prompt on every turn.
  pi.on("before_agent_start", (event) => {
    if (!activeProfile) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n# Active role profile: ${activeProfile.name}\n${activeProfile.content}`,
    };
  });
}
