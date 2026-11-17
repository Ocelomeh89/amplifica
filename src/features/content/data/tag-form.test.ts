import { describe, expect, it } from "vitest";
import { readTagForm } from "./tag-form";
import type { Topic } from "./topics";

const ID = "5b9d1d1e-7c4e-4a39-9a55-0d8b3e1f2a10";
function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("readTagForm", () => {
  it("reads only the fields that changed from their orig_ twin", () => {
    const r = readTagForm(
      form({
        id: ID,
        hook_type: "paradox", orig_hook_type: "question",
        message: "w2-advantage", orig_message: "w2-advantage",
        post_style: "image", orig_post_style: "",
      })
    );
    expect(r).toEqual({ id: ID, patch: { hook_type: "paradox", post_style: "image" } });
  });

  it("maps cover yes/no to booleans", () => {
    const r = readTagForm(form({ id: ID, cover_face: "yes", orig_cover_face: "", cover_text: "no", orig_cover_text: "yes" }));
    expect(r).toEqual({ id: ID, patch: { cover_face: true, cover_text: false } });
  });

  it("does not let a select be cleared to blank", () => {
    const r = readTagForm(form({ id: ID, hook_type: "", orig_hook_type: "paradox", cta_type: "save", orig_cta_type: "" }));
    expect(r).toEqual({ id: ID, patch: { cta_type: "save" } });
  });

  it("reads hook text, trimmed, and allows clearing it", () => {
    const r = readTagForm(form({ id: ID, hook_spoken: "  new words ", orig_hook_spoken: "old", hook_onscreen: "", orig_hook_onscreen: "x" }));
    expect(r).toEqual({ id: ID, patch: { hook_spoken: "new words", hook_onscreen: "" } });
  });

  it("errors on a value outside its list, a missing id, an over-long hook, and no change", () => {
    expect(readTagForm(form({ id: ID, hook_type: "nope", orig_hook_type: "" }))).toHaveProperty("error");
    expect(readTagForm(form({ hook_type: "paradox", orig_hook_type: "" }))).toHaveProperty("error");
    expect(readTagForm(form({ id: ID, hook_spoken: "x".repeat(501), orig_hook_spoken: "" }))).toHaveProperty("error");
    expect(readTagForm(form({ id: ID, hook_type: "paradox", orig_hook_type: "paradox" }))).toHaveProperty("error");
  });

  it("rejects an old canon message on a correction", () => {
    const fd = new FormData();
    fd.set("id", "p1");
    fd.set("orig_message", "w2-advantage");
    fd.set("message", "velocity");
    expect(readTagForm(fd)).toHaveProperty("error");
  });
});

describe("readTagForm topic", () => {
  const TOPICS: Topic[] = [
    { slug: "mechanics-of-leverage", label: "The mechanics of leverage", pillar: "physics-of-wealth" },
    { slug: "burnout-vs-ambition", label: "Burnout versus ambition", pillar: "w2-advantage" },
  ];
  const base = { id: ID, message: "physics-of-wealth", orig_message: "physics-of-wealth", orig_topic: "" };

  it("takes a changed topic that is listed under the post's message", () => {
    expect(readTagForm(form({ ...base, topic: "mechanics-of-leverage" }), TOPICS)).toEqual({ id: ID, patch: { topic: "mechanics-of-leverage" } });
  });
  it("refuses a topic under another pillar", () => {
    const r = readTagForm(form({ ...base, topic: "burnout-vs-ambition" }), TOPICS);
    expect("error" in r && r.error).toMatch(/topic/i);
  });
  it("judges the topic against a message changed in the same save", () => {
    const r = readTagForm(form({ ...base, message: "w2-advantage", topic: "burnout-vs-ambition" }), TOPICS);
    expect(r).toEqual({ id: ID, patch: { message: "w2-advantage", topic: "burnout-vs-ambition" } });
  });
  it("refuses a slug that is not in the list and ignores an unchanged or cleared topic", () => {
    expect("error" in readTagForm(form({ ...base, topic: "made-up" }), TOPICS)).toBe(true);
    expect(readTagForm(form({ ...base, topic: "mechanics-of-leverage", orig_topic: "mechanics-of-leverage", hook_type: "paradox", orig_hook_type: "" }), TOPICS)).toEqual({ id: ID, patch: { hook_type: "paradox" } });
    expect(readTagForm(form({ ...base, topic: "", orig_topic: "mechanics-of-leverage", hook_type: "paradox", orig_hook_type: "" }), TOPICS)).toEqual({ id: ID, patch: { hook_type: "paradox" } });
  });
});
