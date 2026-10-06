import Anthropic from "@anthropic-ai/sdk";
import { FOUND_TOOL_NAME, foundToolSchema } from "@/features/content/engine/found-ideas";

// The one Claude call the app makes for ideas. A forced tool call returns
// structured JSON; forced tool choice cannot be combined with extended
// thinking, so none is requested. Only imported from Server Actions, so the
// key never reaches the client bundle.

export const CLAUDE_MODEL = "claude-opus-5-5";

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Add it to .env.local and to Vercel to generate ideas in the app.");
    this.name = "MissingApiKeyError";
  }
}

/** Opus with a large answer can run long; fail inside the page's 300 s budget. */
export const CLAUDE_CLIENT_OPTIONS = (apiKey: string) => ({ apiKey, timeout: 240_000, maxRetries: 1 });

export type GenerateInput = { system: string; text: string; pdf?: { base64: string } };

/** Returns the raw tool input; the caller validates it. */
export interface IdeaGenerator {
  generate(input: GenerateInput): Promise<unknown>;
}

type MessagesClient = {
  messages: { create(args: Record<string, unknown>): Promise<{ stop_reason?: string; content: { type: string; input?: unknown }[] }> };
};

export function claudeIdeaGenerator(client: MessagesClient): IdeaGenerator {
  return {
    async generate({ system, text, pdf }) {
      const content: Record<string, unknown>[] = [];
      if (pdf) {
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.base64 } });
      }
      content.push({ type: "text", text });
      const res = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        system,
        tools: [
          { name: FOUND_TOOL_NAME, description: "Record the content ideas generated from the source.", input_schema: foundToolSchema() },
        ],
        tool_choice: { type: "tool", name: FOUND_TOOL_NAME },
        messages: [{ role: "user", content }],
      });
      if (res.stop_reason === "max_tokens") {
        throw new Error("Claude ran out of room before finishing the ideas. Try a shorter source, or add a note to narrow what you want.");
      }
      const block = res.content.find((b) => b.type === "tool_use");
      if (!block) throw new Error("Claude returned no ideas.");
      return block.input;
    },
  };
}

export function anthropicIdeaGenerator(): IdeaGenerator {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  return claudeIdeaGenerator(new Anthropic(CLAUDE_CLIENT_OPTIONS(apiKey)) as unknown as MessagesClient);
}
