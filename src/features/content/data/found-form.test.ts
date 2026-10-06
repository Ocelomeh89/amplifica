import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/features/content/engine/found";
import { readFoundForm, readOptions } from "./found-form";

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("readOptions", () => {
  it("trims, caps, and defaults the angle to open", () => {
    expect(readOptions(form({ note: "  hi  ", competitor: " Ramit ", angle: "bogus" }))).toEqual({ note: "hi", competitor: "Ramit", angle: "open" });
    expect(readOptions(form({ note: "x".repeat(5000) })).note.length).toBe(1000);
    expect(readOptions(form({ angle: "twist" })).angle).toBe("twist");
  });
});

describe("readFoundForm", () => {
  it("reads a URL", async () => {
    const r = await readFoundForm(form({ url: " https://example.com/a ", angle: "counterpoint", note: "n" }));
    expect(r).toEqual({ ok: true, input: { kind: "url", url: "https://example.com/a", note: "n", angle: "counterpoint", competitor: "" } });
  });
  it("reads a file", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.pdf", { type: "application/pdf" });
    const r = await readFoundForm(form({ file }));
    expect(r.ok).toBe(true);
    if (r.ok && r.input.kind === "upload") {
      expect(r.input.filename).toBe("a.pdf");
      expect(Array.from(r.input.bytes)).toEqual([1, 2, 3]);
    }
  });
  it("rejects both, neither, and an oversize file before reading it", async () => {
    const file = new File([new Uint8Array([1])], "a.txt");
    expect((await readFoundForm(form({ url: "https://example.com", file }))).ok).toBe(false);
    expect((await readFoundForm(form({}))).ok).toBe(false);
    expect((await readFoundForm(form({ url: "   " }))).ok).toBe(false);
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.pdf");
    const r = await readFoundForm(form({ file: big }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over 4 MB/);
  });
});
