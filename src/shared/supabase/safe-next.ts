const BASE = "http://localhost";

// Returns `raw` as a same-origin path, or null if it would leave the site.
// A bare startsWith("/") check is not enough: browsers read "//evil.com" and
// "/\evil.com" (and "/\t/evil.com", once tabs are stripped) as protocol-
// relative URLs. Resolving against a fixed origin catches every such form.
export function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/")) return null;
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
