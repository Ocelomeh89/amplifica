import { z } from "zod";
import { FORMATS, type Format } from "./types";
import type { LintHit } from "./lint";

// The draft contract between /content-draft and the app, plus the vault path
// rules. Pure. The vault folder is the one approved exception to the vault's
// "Claude writes only to 0 - Entities / 1 - Concepts" rule: new files only.

export const VAULT_FOLDER = "C - Writing/Content";

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "idea";
}

export function draftFilename(hook: string, date: string): string {
  return `${date} ${slugify(hook)}.md`;
}

export function vaultPath(format: Format, filename: string): string {
  return `${VAULT_FOLDER}/${format}/${filename}`;
}

/** `YYYY-MM-DD slug.md`, optionally `slug (2).md`: nothing a shell could expand. */
const VAULT_FILENAME = /^\d{4}-\d{2}-\d{2} [a-z0-9-]+(?: \(\d+\))?\.md$/;

/** `C - Writing/Content/<format>/<name>.md` and nothing else: no traversal, no absolute or Windows paths. */
export function parseVaultPath(path: string): { format: Format; filename: string } | null {
  const parts = path.split("/");
  const prefix = VAULT_FOLDER.split("/");
  if (parts.length !== prefix.length + 2) return null;
  if (!prefix.every((p, i) => parts[i] === p)) return null;
  const format = parts[prefix.length];
  const filename = parts[prefix.length + 1];
  if (!(FORMATS as readonly string[]).includes(format)) return null;
  if (!VAULT_FILENAME.test(filename)) return null;
  return { format: format as Format, filename };
}

export const draftPostSchema = z.object({
  idea_id: z.string().uuid(),
  raw: z.string().min(1).max(20_000),
  humanized: z.string().min(1).max(20_000),
  obsidian_path: z.string().refine((p) => parseVaultPath(p) !== null, "obsidian_path must be C - Writing/Content/<format>/<name>.md"),
  model: z.string().max(80).default(""),
  redo: z.boolean().default(false),
});
export type DraftPost = z.infer<typeof draftPostSchema>;

export function parseLintHits(value: unknown): LintHit[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (h): h is LintHit =>
      !!h &&
      typeof h === "object" &&
      ((h as LintHit).level === "block" || (h as LintHit).level === "warn") &&
      typeof (h as LintHit).rule === "string" &&
      typeof (h as LintHit).excerpt === "string"
  );
}

export type DraftState = { stage: "raw" | "humanized" | "edited"; version: number; block: number; warn: number };

/** The newest draft row's stage and lint counts; null when there are no rows. */
export function summarizeDraft(rows: { version: number; stage: string; lint: unknown }[]): DraftState | null {
  if (rows.length === 0) return null;
  const latest = rows.reduce((a, b) => (b.version > a.version ? b : a));
  const hits = parseLintHits(latest.lint);
  return {
    stage: latest.stage as DraftState["stage"],
    version: latest.version,
    block: hits.filter((h) => h.level === "block").length,
    warn: hits.filter((h) => h.level === "warn").length,
  };
}
