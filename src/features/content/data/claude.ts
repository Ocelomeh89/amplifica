import Anthropic from "@anthropic-ai/sdk";
import { FOUND_TOOL_NAME, foundToolSchema } from "@/features/content/engine/found-ideas";

// The Claude calls the app makes. One forced tool call per request. A forced tool call returns
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

/** One forced tool call. `empty` and `truncated` let a caller word its own failures. */
export type ToolSpec = { name: string; description: string; schema: Record<string, unknown>; empty?: string; truncated?: string };
export type ToolCallInput = GenerateInput & { tool: ToolSpec; maxTokens?: number; model?: string };

/** Returns the raw tool input; the caller validates it. */
export interface ToolCaller {
  call(input: ToolCallInput): Promise<unknown>;
}

/** Returns the raw tool input; the caller validates it. */
export interface IdeaGenerator {
  generate(input: GenerateInput): Promise<unknown>;
}

type MessagesClient = {
  messages: { create(args: Record<string, unknown>): Promise<{ stop_reason?: string; content: { type: string; input?: unknown }[] }> };
};

export function claudeToolCaller(client: MessagesClient): ToolCaller {
  return {
    async call({ system, text, pdf, tool, maxTokens = 8000, model = CLAUDE_MODEL }) {
      const content: Record<string, unknown>[] = [];
      if (pdf) {
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.base64 } });
      }
      content.push({ type: "text", text });
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content }],
      });
      if (res.stop_reason === "max_tokens") {
        throw new Error(tool.truncated ?? "Claude ran out of room before finishing. Try again.");
      }
      const block = res.content.find((b) => b.type === "tool_use");
      if (!block) throw new Error(tool.empty ?? "Claude returned no result.");
      return block.input;
    },
  };
}

const FOUND_TOOL: ToolSpec = {
  name: FOUND_TOOL_NAME,
  description: "Record the content ideas generated from the source.",
  schema: foundToolSchema(),
  empty: "Claude returned no ideas.",
  truncated: "Claude ran out of room before finishing the ideas. Try a shorter source, or add a note to narrow what you want.",
};

export function claudeIdeaGenerator(client: MessagesClient): IdeaGenerator {
  const caller = claudeToolCaller(client);
  return { generate: (input) => caller.call({ ...input, tool: FOUND_TOOL }) };
}

function requireKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  return apiKey;
}

export function anthropicIdeaGenerator(): IdeaGenerator {
  return claudeIdeaGenerator(new Anthropic(CLAUDE_CLIENT_OPTIONS(requireKey())) as unknown as MessagesClient);
}

export function anthropicToolCaller(): ToolCaller {
  return claudeToolCaller(new Anthropic(CLAUDE_CLIENT_OPTIONS(requireKey())) as unknown as MessagesClient);
}
