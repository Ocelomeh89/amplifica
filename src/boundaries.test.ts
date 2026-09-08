// The shape of the tree, asserted rather than trusted.
//
// A folder structure only stays useful if it stays true. Nothing stops a
// future edit from importing a feature into shared/, or one feature into
// another, and nothing about such an import looks wrong at the call site —
// it compiles, it works, and the tree quietly goes back to being a pile.
// These tests are what make the boundaries load-bearing.
//
// node:fs is used deliberately: the rules are about where source sits, and
// reading the source is the only way to see an import before it is wired up.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const SRC = join(process.cwd(), "src");

/**
 * Features that other features may import.
 *
 * `simulator` is UI shared by exactly two features (projections, calculator).
 * By the membership rule it would live in shared/, but it is feature-shaped,
 * so it stays a feature and is named here instead. One documented exception
 * beats a rule nobody can enforce — and a second entry appearing in this list
 * is the signal that the rule, not the list, needs revisiting.
 */
const SHARED_FEATURES = ["simulator"];

type Zone = { kind: "app" | "shared" | "feature" | "root"; feature?: string };

function zoneOf(srcRelative: string): Zone {
  const parts = srcRelative.split("/");
  if (parts[0] === "app") return { kind: "app" };
  if (parts[0] === "shared") return { kind: "shared" };
  if (parts[0] === "features") return { kind: "feature", feature: parts[1] };
  return { kind: "root" };
}

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Every module specifier in a file, import and re-export alike. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(re)) found.push(m[1]);
  return found;
}

/**
 * A specifier as a path relative to src/, or null when it points outside the
 * repo (a package). Relative specifiers are resolved so that a `../../` that
 * climbs out of its folder is judged by where it lands, not by how it looks.
 */
function targetOf(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (!specifier.startsWith(".")) return null;
  const abs = resolve(dirname(fromFile), specifier);
  const rel = relative(SRC, abs);
  return rel.startsWith("..") ? null : rel;
}

interface Edge {
  from: string;
  to: string;
  fromZone: Zone;
  toZone: Zone;
}

const edges: Edge[] = sourceFiles().flatMap((file) => {
  const from = relative(SRC, file).split("\\").join("/");
  return specifiers(readFileSync(file, "utf8"))
    .map((s) => targetOf(file, s))
    .filter((t): t is string => t !== null)
    .map((to) => ({ from, to, fromZone: zoneOf(from), toZone: zoneOf(to) }));
});

function describeEdges(bad: Edge[]): string[] {
  return bad.map((e) => `${e.from} → ${e.to}`);
}

describe("the tree keeps its shape", () => {
  it("finds imports to check", () => {
    // Guards the whole file: a walk that silently returns nothing would make
    // every assertion below pass while checking absolutely nothing.
    expect(edges.length).toBeGreaterThan(50);
  });

  it("lets nothing import from app/", () => {
    // app/ is the top of the graph: routes and the shell they render. Anything
    // reaching back into it has put page-level code somewhere it cannot be
    // found from the route that owns it.
    const bad = edges.filter(
      (e) => e.toZone.kind === "app" && e.fromZone.kind !== "app"
    );
    expect(describeEdges(bad)).toEqual([]);
  });

  it("keeps shared/ free of features", () => {
    // shared/ is what features are built from. An edge the other way means
    // reading a shared module now requires reading a feature too.
    const bad = edges.filter(
      (e) => e.fromZone.kind === "shared" && e.toZone.kind === "feature"
    );
    expect(describeEdges(bad)).toEqual([]);
  });

  it("keeps features from importing each other", () => {
    const bad = edges.filter(
      (e) =>
        e.fromZone.kind === "feature" &&
        e.toZone.kind === "feature" &&
        e.toZone.feature !== e.fromZone.feature &&
        !SHARED_FEATURES.includes(e.toZone.feature!)
    );
    expect(describeEdges(bad)).toEqual([]);
  });

  it("declares only the exceptions that are actually used", () => {
    // An allowlist that outlives its reason is worse than no allowlist: it
    // reads as permission. If simulator stops being imported across features,
    // it should stop being named here.
    const used = SHARED_FEATURES.filter((name) =>
      edges.some(
        (e) =>
          e.fromZone.kind === "feature" &&
          e.toZone.feature === name &&
          e.fromZone.feature !== name
      )
    );
    expect(used).toEqual(SHARED_FEATURES);
  });
});
