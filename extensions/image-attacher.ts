import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  // Register the /attach command
  pi.registerCommand("attach", {
    description: "Attach an image to the current conversation",
    handler: async (_args, ctx) => {
      // 1. Define which directory to look for images in (Desktop or Current Folder)
      const paths = [
        { name: "Current Directory", path: ctx.cwd },
        { name: "Desktop", path: join(require('os').homedir(), "Desktop") }
      ];

      const selectedDirObj = await ctx.ui.select("Where should I look for images?", paths.map(p => p.name));
      if (!selectedDirObj) return;
      
      const imageDir = paths.find(p => p.name === selectedDirObj)?.path || ctx.cwd;
      const extensions = [".jpg", ".jpeg", ".png", ".webp"];
      
      try {
        const files = readdirSync(imageDir).filter(file => 
          extensions.some(ext => file.toLowerCase().endsWith(ext))
        );

        if (files.length === 0) {
          ctx.ui.notify("No images found in the current directory.", "info");
          return;
        }

        // 2. Show a TUI selection list to the user
        const selectedFile = await ctx.ui.select("Select an image to attach:", files);
        
        if (!selectedFile) return;

        // 3. Read file as base64
        const filePath = join(imageDir, selectedFile);
        const fileBuffer = readFileSync(filePath);
        const base64Data = fileBuffer.toString("base64");
        console.log(`[ImageAttacher] File: ${selectedFile}, Length: ${base64Data.length}, Start: ${base64Data.substring(0, 50)}...`);
        
        // Determine media type based on extension
        const ext = selectedFile.split('.').pop()?.toLowerCase();
        const mediaType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

        // 4. Ask what to do with the image so it arrives with a task in one turn
        const question = await ctx.ui.input(
          "What should I do with the image?",
          "e.g. describe it / extract the text / leave empty to just attach"
        );

        // 5. Send the image as a user message to the agent
        const promptText = question?.trim()
          ? question.trim()
          : `Attached image: ${selectedFile}`;
        await pi.sendUserMessage([
          { type: "text", text: promptText },
          { type: "image", mimeType: mediaType, data: base64Data },
        ]);

        ctx.ui.notify(`Attached ${selectedFile} successfully!`, "info");

      } catch (error) {
        ctx.ui.notify(`Error attaching image: ${error.message}`, "error");
      }
    },
  });
}
