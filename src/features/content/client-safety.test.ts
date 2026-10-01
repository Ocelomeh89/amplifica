// Client components must not pull server-only content modules into the browser
// bundle (they import node:dns, server-only, or the Anthropic SDK). Scans source
// with node:fs, like boundaries.test.ts.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const SRC = join(process.cwd(), "src");
const FORBIDDEN = [
  "engine/found", "engine/readable", "data/found", "data/fetch-page",
  "data/claude", "data/found-form", "data/youtube-meta", "data/supabase-db",
];

function files(dir = SRC): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(e) ? [full] : [];
  });
}

function specifiers(source: string): string[] {
  return Array.from(source.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g), (m) => m[1]);
}

/** Specifier as a src-relative path without extension, or null for packages. */
function target(from: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (!spec.startsWith(".")) return null;
  const rel = relative(SRC, resolve(dirname(from), spec));
  return rel.startsWith("..") ? null : rel.split("\\").join("/");
}

const clientFiles = files().filter((f) => {
  const first = readFileSync(f, "utf8").split("\n").find((l) => l.trim() !== "") ?? "";
  return /^\s*["']use client["']/.test(first);
});

describe("client components stay off server-only content modules", () => {
  it("scans at least one client file", () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });
  it("imports none of the server-only modules", () => {
    const bad: string[] = [];
    for (const f of clientFiles) {
      for (const spec of specifiers(readFileSync(f, "utf8"))) {
        const t = target(f, spec);
        const hit = t && FORBIDDEN.find((m) => t === `features/content/${m}` || t.endsWith(`features/content/${m}`));
        if (hit) bad.push(`${relative(SRC, f)} imports ${spec} (${hit}); import foundBadge from engine/angle instead`);
      }
    }
    expect(bad).toEqual([]);
  });
});
