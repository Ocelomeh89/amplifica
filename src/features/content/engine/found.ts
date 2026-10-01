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

/** Parse IPv6 address into 8 hextets. Handles :: compression and trailing dotted-quad. */
function expandIPv6(ip: string): number[] | null {
  const lower = ip.toLowerCase();
  const parts = lower.split("::");

  if (parts.length > 2) return null; // Invalid: multiple ::

  const beforeColon = parts[0];
  const afterColon = parts[1];

  // Split before and after parts, checking for dotted-quad at the end
  let beforeHextets: string[] = beforeColon ? beforeColon.split(":").filter(s => s) : [];
  let afterHextets: string[] = afterColon ? afterColon.split(":").filter(s => s) : [];
  let v4Octets: number[] = [];

  // Check last part of afterHextets for dotted-quad
  if (afterHextets.length > 0 && afterHextets[afterHextets.length - 1]!.includes(".")) {
    const dotted = afterHextets.pop();
    if (!dotted) return null;
    const octets = dotted.split(".").map(Number);
    if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) return null;
    v4Octets = octets;
  }

  // Validate hex parts
  for (const h of [...beforeHextets, ...afterHextets]) {
    if (!h || !/^[0-9a-f]{1,4}$/.test(h)) return null;
  }

  // Convert hextets to numbers
  const beforeNums = beforeHextets.map(h => parseInt(h, 16));
  const afterNums = afterHextets.map(h => parseInt(h, 16));

  // If :: is present, fill with zeros
  if (parts.length === 2) {
    const v4Hextets = v4Octets.length > 0 ? [(v4Octets[0] << 8) | v4Octets[1], (v4Octets[2] << 8) | v4Octets[3]] : [];
    const totalHextets = beforeNums.length + afterNums.length + v4Hextets.length;
    const paddingNeeded = 8 - totalHextets;
    if (paddingNeeded < 0) return null;
    return [...beforeNums, ...Array(paddingNeeded).fill(0), ...afterNums, ...v4Hextets];
  }

  // No :: compression
  const v4Hextets = v4Octets.length > 0 ? [(v4Octets[0] << 8) | v4Octets[1], (v4Octets[2] << 8) | v4Octets[3]] : [];
  if (beforeNums.length + afterNums.length + v4Hextets.length !== 8) return null;
  return [...beforeNums, ...afterNums, ...v4Hextets];
}

/** True for loopback, private, link-local, CGNAT, multicast, and unspecified addresses. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind !== 6) return false;

  const h = expandIPv6(ip);
  if (!h) return true; // Fail closed on parse error

  const v4 = (a: number, b: number) =>
    `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;

  // Unspecified (::) and loopback (::1), and IPv4-mapped/compatible in ::/96 and ::/96 compat
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0) {
    if (h[5] === 0xffff || h[5] === 0) {
      // IPv4-mapped (::ffff:x.y.z.w) or IPv4-compatible (::x.y.z.w)
      if (h[6] === 0 && (h[7] === 0 || h[7] === 1)) return true; // :: and ::1
      return isPrivateV4(v4(h[6], h[7]));
    }
  }

  // 64:ff9b::/96 (well-known prefix for IPv4/IPv6 translation)
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return isPrivateV4(v4(h[6], h[7]));
  }

  // 2002::/16 (6to4, embeds IPv4 in h[1] and h[2])
  if (h[0] === 0x2002) {
    return isPrivateV4(v4(h[1], h[2]));
  }

  // fc00::/7 (unique local unicast)
  if ((h[0] & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (link-local)
  if ((h[0] & 0xffc0) === 0xfe80) return true;

  return false;
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
  const host = u.hostname.toLowerCase().replace(/\.+$/, "");
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

// Lives in angle.ts so client components can use it without pulling in this
// file's node:net import.
export { foundBadge } from "./angle";
