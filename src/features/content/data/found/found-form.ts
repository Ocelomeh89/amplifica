import { str } from "@/shared/forms";
import { parseAngle } from "@/features/content/engine/angle";
import { MAX_UPLOAD_BYTES } from "@/features/content/engine/found";
import type { FoundInput, FoundOptions } from "./found";

export function readOptions(fd: FormData): FoundOptions {
  return {
    note: str(fd, "note").trim().slice(0, 1000),
    competitor: str(fd, "competitor").trim().slice(0, 100),
    angle: parseAngle(str(fd, "angle")),
  };
}

export async function readFoundForm(fd: FormData): Promise<{ ok: true; input: FoundInput } | { ok: false; error: string }> {
  const options = readOptions(fd);
  const url = str(fd, "url").trim();
  const file = fd.get("file");
  const hasFile = typeof file === "object" && file !== null && "size" in file && (file as File).size > 0;
  if (url && hasFile) return { ok: false, error: "Pick a URL or a file, not both." };
  if (hasFile) {
    const f = file as File;
    if (f.size > MAX_UPLOAD_BYTES) return { ok: false, error: `That file is over ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` };
    return { ok: true, input: { kind: "upload", filename: f.name, bytes: new Uint8Array(await f.arrayBuffer()), ...options } };
  }
  if (url) return { ok: true, input: { kind: "url", url, ...options } };
  return { ok: false, error: "Paste a URL or choose a file." };
}
