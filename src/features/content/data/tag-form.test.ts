import { describe, expect, it } from "vitest";
import { readTagForm } from "./tag-form";

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
        message: "velocity", orig_message: "velocity",
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
});
