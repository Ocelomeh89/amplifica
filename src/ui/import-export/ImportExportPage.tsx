import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import type { Portfolio } from "@engine/index";

export default function ImportExportPage() {
  const portfolio = useStore((s) => s.portfolio);
  const replace = useStore((s) => s.replacePortfolio);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function download() {
    const blob = new Blob([JSON.stringify(portfolio, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `amplifica-portfolio-${portfolio.name.replace(/\s+/g, "-")}-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as Portfolio;
      if (typeof parsed.schemaVersion !== "number") {
        throw new Error("Missing schemaVersion — file may not be a valid amplifica portfolio.");
      }
      if (!confirm(`Replace current portfolio "${portfolio.name}" with "${parsed.name}"? This cannot be undone.`)) {
        return;
      }
      replace(parsed);
      setMsg(`Imported "${parsed.name}".`);
    } catch (err) {
      setMsg(`Import failed: ${(err as Error).message}`);
    }
    e.target.value = "";
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Import / Export</h1>

      <Card title="Export">
        <p className="text-sm text-sub mb-3">Download your current portfolio as a JSON file for backup or transfer.</p>
        <button
          onClick={download}
          className="bg-ink text-white text-sm px-4 py-1.5 rounded inline-flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> Download portfolio JSON
        </button>
      </Card>

      <Card title="Import">
        <p className="text-sm text-sub mb-3">Replace the current portfolio with one loaded from disk. You&apos;ll be asked to confirm.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onFile}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-zinc-100 hover:bg-zinc-200 text-sm px-4 py-1.5 rounded inline-flex items-center gap-2"
        >
          <Upload className="w-4 h-4" /> Choose JSON file
        </button>
        {msg && <p className="text-sm mt-3 text-sub">{msg}</p>}
      </Card>
    </div>
  );
}
