import { isIP } from "node:net";

// Rules for content Miguel finds and pastes in. Pure; the network and the
// database live in data/.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export const MIN_TEXT_CHARS = 200;
export const MAX_TEXT_CHARS = 200_000;

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|igsh$|igshid$|si$|mc_)/i;

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** True for loopback, private, link-local, CGNAT, multicast, and unspecified addresses. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind !== 6) return false;
  const v6 = ip.toLowerCase();
  const dotted = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateV4(dotted[1]);
  const hex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return v6 === "::1" || v6 === "::" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

export type UrlResult = { ok: true; url: string } | { ok: false; error: string };

/** One canonical form per page, or the reason it can't be read. */
export function normalizeUrl(input: string): UrlResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Paste a URL or choose a file." };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "That doesn't look like a URL." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "Only http and https links can be read." };
  }
  if (u.username || u.password) return { ok: false, error: "Links with a login in them are not accepted." };
  const host = u.hostname.toLowerCase();
  const bare = host.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || isPrivateIp(bare)
  ) {
    return { ok: false, error: "That address is private and can't be read." };
  }
  u.hash = "";
  for (const key of Array.from(u.searchParams.keys())) {
    if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
  }
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return { ok: true, url: u.toString() };
}

export type TextResult = { ok: true; text: string } | { ok: false; error: string };

export function checkText(raw: string, min = MIN_TEXT_CHARS): TextResult {
  const text = raw.replace(/[ \t]+\n/g, "\n").trim();
  if (text.length < min) {
    return {
      ok: false,
      error: `Only ${text.length} characters of readable text came back; need at least ${min}. Paste the text into a .txt file instead, or add it to the note.`,
    };
  }
  return { ok: true, text: text.slice(0, MAX_TEXT_CHARS) };
}

export type FileKind = "pdf" | "text";

export function fileKind(name: string): FileKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (name.indexOf(".") === -1) return null;
  if (ext === "pdf") return "pdf";
  if (ext === "txt" || ext === "md" || ext === "markdown") return "text";
  return null;
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

/** The chip an idea wears in the Inbox when its source was pasted in. */
export function foundBadge(kind: string, meta: unknown): string | null {
  if (kind !== "url" && kind !== "upload") return null;
  const angle = typeof meta === "object" && meta !== null ? (meta as { angle?: unknown }).angle : undefined;
  return angle === "counterpoint" || angle === "twist" ? `found · ${angle}` : "found";
}
