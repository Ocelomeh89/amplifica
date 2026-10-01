import { afterEach, describe, expect, it, vi } from "vitest";
import { CLAUDE_MODEL, MissingApiKeyError, anthropicIdeaGenerator, claudeIdeaGenerator } from "./claude";

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
    expect(args.system).toBe("SYS");
    expect(args.tool_choice).toEqual({ type: "tool", name: "record_ideas" });
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
