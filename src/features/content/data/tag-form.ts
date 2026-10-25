import { CTA_TYPES, HOOK_TYPES, MESSAGES, ONSCREEN_TEXT, POST_STYLES, type PostTags } from "@/features/content/engine/tags";

// The correction form sends each field beside an `orig_<field>` twin, so only
// what Miguel changed is written and locked.

const SELECTS = {
  hook_type: HOOK_TYPES,
  onscreen_text: ONSCREEN_TEXT,
  message: MESSAGES,
  cta_type: CTA_TYPES,
  post_style: POST_STYLES,
} as const;
const COVERS = ["cover_face", "cover_text", "cover_number"] as const;
const TEXTS = ["hook_spoken", "hook_onscreen"] as const;
const MAX_HOOK = 500;

const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export function readTagForm(fd: FormData): { id: string; patch: Partial<PostTags> } | { error: string } {
  const id = field(fd, "id");
  if (!id) return { error: "Missing post." };
  const patch: Record<string, unknown> = {};

  for (const [name, list] of Object.entries(SELECTS)) {
    const value = field(fd, name);
    if (value === field(fd, `orig_${name}`) || value === "") continue; // unchanged, or an attempt to clear
    if (!(list as readonly string[]).includes(value)) return { error: `"${value}" is not a valid ${name.replace(/_/g, " ")}.` };
    patch[name] = value;
  }
  for (const name of COVERS) {
    const value = field(fd, name);
    if (value === field(fd, `orig_${name}`) || value === "") continue;
    if (value !== "yes" && value !== "no") return { error: `Invalid ${name.replace(/_/g, " ")}.` };
    patch[name] = value === "yes";
  }
  for (const name of TEXTS) {
    const value = field(fd, name).trim();
    if (field(fd, name) === field(fd, `orig_${name}`)) continue;
    if (value.length > MAX_HOOK) return { error: `${name.replace(/_/g, " ")} is over ${MAX_HOOK} characters.` };
    patch[name] = value;
  }
  if (Object.keys(patch).length === 0) return { error: "Nothing changed." };
  return { id, patch: patch as Partial<PostTags> };
}
