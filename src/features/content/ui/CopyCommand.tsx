"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

// The Draft button: drafting runs in a local skill, so the app hands over the command.
export default function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${command}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // No clipboard (insecure context or denied): the command is still visible in the title.
        }
      }}
      title={command}
      className="text-xs px-2 py-1 rounded border border-edge hover:bg-edge inline-flex items-center gap-1"
    >
      <Copy className="w-3 h-3" /> {copied ? "Copied" : "Draft"}
    </button>
  );
}
