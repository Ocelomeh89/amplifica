import { describe, expect, it } from "vitest";
import {
  MIN_TEXT_CHARS, checkText, fileKind, foundBadge, isPrivateIp, normalizeUrl, safeFilename,
} from "./found";

describe("normalizeUrl", () => {
  it("lowercases the host, drops the fragment, tracking params, and a trailing slash", () => {
    expect(normalizeUrl("https://Example.com/post/?utm_source=x&id=2#frag")).toEqual({
      ok: true, url: "https://example.com/post?id=2",
    });
  });
  it("lands the same article on one url however it was pasted", () => {
    const a = normalizeUrl("https://www.youtube.com/watch?v=abc123&si=zzz");
    const b = normalizeUrl("www.youtube.com/watch?v=abc123");
    expect(a).toEqual(b);
    expect(a).toEqual({ ok: true, url: "https://www.youtube.com/watch?v=abc123" });
  });
  it("adds https when the scheme is missing", () => {
    expect(normalizeUrl("example.com/a")).toEqual({ ok: true, url: "https://example.com/a" });
  });
  it("rejects empty, non-http, credentialed, and unparsable input", () => {
    for (const bad of ["", "   ", "ftp://x.com/a", "https://user:pw@x.com/", "javascript:alert(1)", "http://"]) {
      expect(normalizeUrl(bad).ok).toBe(false);
    }
  });
  it("rejects private, loopback, link-local and internal hosts", () => {
    for (const bad of [
      "http://localhost:3000", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/",
      "http://172.20.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/",
      "http://[::ffff:7f00:1]/", "http://[fd00::1]/", "http://printer.local/", "http://db.internal/",
    ]) {
      expect(normalizeUrl(bad).ok, bad).toBe(false);
    }
  });
});

describe("isPrivateIp", () => {
  it("covers v4 ranges, mapped v6, and leaves public addresses alone", () => {
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:a00:1")).toBe(true);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    expect(isPrivateIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
    expect(isPrivateIp("not an ip")).toBe(false);
  });
});

describe("checkText", () => {
  it("rejects text under the floor with a message that names the count", () => {
    const r = checkText("short");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("5 characters");
  });
  it("accepts a lower floor when asked (YouTube descriptions)", () => {
    expect(checkText("x".repeat(45), 40).ok).toBe(true);
  });
  it("trims and caps very long text", () => {
    const r = checkText(`  ${"a".repeat(MIN_TEXT_CHARS + 300_000)}  `);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.length).toBe(200_000);
  });
});

describe("fileKind, safeFilename, foundBadge", () => {
  it("classifies by extension, case-insensitively", () => {
    expect(fileKind("Notes.PDF")).toBe("pdf");
    expect(fileKind("a.md")).toBe("text");
    expect(fileKind("a.txt")).toBe("text");
    expect(fileKind("a.docx")).toBeNull();
    expect(fileKind("noextension")).toBeNull();
  });
  it("makes a storage-safe filename", () => {
    expect(safeFilename("My Talk (final).pdf")).toBe("My_Talk_final_.pdf");
    expect(safeFilename("///")).toBe("_");
    expect(safeFilename("").length).toBeGreaterThan(0);
  });
  it("badges found sources by angle and nothing else", () => {
    expect(foundBadge("url", { angle: "counterpoint" })).toBe("found · counterpoint");
    expect(foundBadge("upload", { angle: "twist" })).toBe("found · twist");
    expect(foundBadge("url", { angle: "open" })).toBe("found");
    expect(foundBadge("url", null)).toBe("found");
    expect(foundBadge("granola", {})).toBeNull();
  });
});
