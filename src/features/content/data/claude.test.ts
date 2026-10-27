import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAUDE_CLIENT_OPTIONS,
  CLAUDE_MODEL,
  MissingApiKeyError,
  anthropicIdeaGenerator,
  claudeIdeaGenerator,
  claudeToolCaller,
} from "./claude";

function fakeClient(content: { type: string; input?: unknown }[]) {
  const create = vi.fn(async (_args: Record<string, unknown>) => ({ content }));
  return { client: { messages: { create } }, create };
}

describe("claudeIdeaGenerator", () => {
  it("forces the record_ideas tool and returns its input", async () => {
    const { client, create } = fakeClient([{ type: "tool_use", input: { ideas: [] } }]);
    const out = await claudeIdeaGenerator(client).generate({ system: "SYS", text: "USER" });
    expect(out).toEqual({ ideas: [] });
    const args = create.mock.calls[0][0] as Record<string, any>;
    expect(args.model).toBe(CLAUDE_MODEL);
    expect(args.system).toBe("SYS\n\nAnswer only by calling the " + args.tools[0].name + " tool.");
    expect(args.tool_choice).toEqual({ type: "auto" });
    expect(args.tools[0].name).toBe("record_ideas");
    expect(args.thinking).toBeUndefined();
    expect(args.messages[0].content).toEqual([{ type: "text", text: "USER" }]);
  });
  it("sends a PDF as a base64 document block before the text", async () => {
    const { client, create } = fakeClient([{ type: "tool_use", input: {} }]);
    await claudeIdeaGenerator(client).generate({ system: "S", text: "U", pdf: { base64: "QUJD" } });
    const content = (create.mock.calls[0][0] as Record<string, any>).messages[0].content;
    expect(content[0]).toEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "QUJD" } });
    expect(content[1]).toEqual({ type: "text", text: "U" });
  });
  it("throws when the answer has no tool call", async () => {
    const { client } = fakeClient([{ type: "text" }]);
    await expect(claudeIdeaGenerator(client).generate({ system: "S", text: "U" })).rejects.toThrow(/no ideas/i);
  });
});

describe("claudeIdeaGenerator stop reasons", () => {
  it("rejects a truncated answer with a readable message", async () => {
    const create = vi.fn(async () => ({ stop_reason: "max_tokens", content: [{ type: "tool_use", input: { ideas: [] } }] }));
    await expect(claudeIdeaGenerator({ messages: { create } }).generate({ system: "S", text: "U" })).rejects.toThrow(
      "Claude ran out of room before finishing the ideas. Try a shorter source, or add a note to narrow what you want."
    );
  });
  it("accepts a normal tool_use stop", async () => {
    const create = vi.fn(async () => ({ stop_reason: "tool_use", content: [{ type: "tool_use", input: { ideas: [] } }] }));
    expect(await claudeIdeaGenerator({ messages: { create } }).generate({ system: "S", text: "U" })).toEqual({ ideas: [] });
  });
});

describe("CLAUDE_CLIENT_OPTIONS", () => {
  it("bounds the call below the page budget with one retry", () => {
    expect(CLAUDE_CLIENT_OPTIONS("k")).toEqual({ apiKey: "k", timeout: 240_000, maxRetries: 1 });
  });
});

describe("anthropicIdeaGenerator", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });
  it("refuses with a setup message when the key is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => anthropicIdeaGenerator()).toThrow(MissingApiKeyError);
    expect(() => anthropicIdeaGenerator()).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("claudeToolCaller", () => {
  const tool = { name: "record_options", description: "Record options.", schema: { type: "object" } };
  it("forces the given tool and defaults to the idea model", async () => {
    const { client, create } = fakeClient([{ type: "tool_use", input: { options: [] } }]);
    const out = await claudeToolCaller(client).call({ system: "SYS", text: "USER", tool });
    expect(out).toEqual({ options: [] });
    const args = create.mock.calls[0][0] as Record<string, any>;
    expect(args.model).toBe(CLAUDE_MODEL);
    expect(args.tool_choice).toEqual({ type: "auto" });
    expect(args.tools).toEqual([{ name: "record_options", description: "Record options.", input_schema: { type: "object" } }]);
    expect(args.system).toBe("SYS\n\nAnswer only by calling the " + args.tools[0].name + " tool.");
  });
  it("maxTokens defaults to 8000 and can be set", async () => {
    const { client, create } = fakeClient([{ type: "tool_use", input: {} }]);
    await claudeToolCaller(client).call({ system: "S", text: "U", tool });
    await claudeToolCaller(client).call({ system: "S", text: "U", tool, maxTokens: 2000 });
    expect((create.mock.calls[0][0] as Record<string, any>).max_tokens).toBe(8000);
    expect((create.mock.calls[1][0] as Record<string, any>).max_tokens).toBe(2000);
  });
  it("a model override is passed through", async () => {
    const { client, create } = fakeClient([{ type: "tool_use", input: {} }]);
    await claudeToolCaller(client).call({ system: "S", text: "U", tool, model: "other-model" });
    expect((create.mock.calls[0][0] as Record<string, any>).model).toBe("other-model");
  });
  it("a truncated answer rejects with a readable message", async () => {
    const create = vi.fn(async () => ({ stop_reason: "max_tokens", content: [{ type: "tool_use", input: {} }] }));
    await expect(claudeToolCaller({ messages: { create } }).call({ system: "S", text: "U", tool })).rejects.toThrow(/ran out of room/i);
  });
  it("an answer with no tool call rejects", async () => {
    const { client } = fakeClient([{ type: "text" }]);
    await expect(claudeToolCaller(client).call({ system: "S", text: "U", tool })).rejects.toThrow(/no result/i);
  });
});
