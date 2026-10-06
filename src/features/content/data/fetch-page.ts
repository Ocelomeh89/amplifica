import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { isPrivateIp, normalizeUrl } from "@/features/content/engine/found";

// Server-side fetch of a page Miguel pasted. Every hop, including redirects,
// is checked: only http(s), and the host must not resolve to a private,
// loopback, or link-local address. Known limit: DNS can change between this
// lookup and the connection; acceptable for an owner-only tool.

const MAX_HOPS = 5;
const MAX_CHARS = 2 * 1024 * 1024;
const MAX_DECLARED_BYTES = 20 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Lookup = (host: string) => Promise<{ address: string }[]>;
const defaultLookup: Lookup = (host) => dns.lookup(host, { all: true });

// Reads at most MAX_CHARS of the body without buffering the rest.
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, MAX_CHARS);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (bytes >= MAX_CHARS) {
      await reader.cancel();
      break;
    }
  }
  return text.slice(0, MAX_CHARS);
}

export async function fetchPublicPage(
  startUrl: string,
  deps: { lookup?: Lookup; fetchImpl?: typeof fetch } = {}
): Promise<{ html: string; finalUrl: string }> {
  const lookup = deps.lookup ?? defaultLookup;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const deadline = AbortSignal.timeout(30_000);
  let target = startUrl;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const norm = normalizeUrl(target);
    if (!norm.ok) throw new Error(norm.error);
    const host = new URL(norm.url).hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host);
    if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
      throw new Error("That address is private and can't be read.");
    }
    let res: Response;
    try {
      res = await fetchImpl(norm.url, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]),
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error("The page took too long to load.");
      }
      throw e;
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("The page redirected without saying where.");
      target = new URL(location, norm.url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`The page answered ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml|text\/plain/i.test(type)) {
      throw new Error(`That link isn't a web page (it returned ${type || "an unknown type"}).`);
    }
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_DECLARED_BYTES) throw new Error("That page is too large to read.");
    return { html: await readCapped(res), finalUrl: norm.url };
  }
  throw new Error("The page redirected too many times.");
}
