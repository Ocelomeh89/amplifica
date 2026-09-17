import clsx from "clsx";
import { FORMAT_LABEL, type Format } from "@/features/content/engine/types";

const TONE: Record<Format, string> = {
  reel: "bg-purple/10 text-purple",
  youtube: "bg-red-500/10 text-red-600",
  newsletter: "bg-aqua/15 text-teal-700",
  story: "bg-amethyst/20 text-purple",
  x: "bg-ink/10 text-ink",
};

export default function FormatBadge({ format }: { format: Format }) {
  return (
    <span className={clsx("inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded", TONE[format])}>
      {FORMAT_LABEL[format]}
    </span>
  );
}
