import clsx from "clsx";
import type { Status } from "@/features/content/engine/baseline";

const BASE = "inline-block whitespace-nowrap text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded";

const TONE: Record<Status, string> = {
  Viral: "bg-purple text-white",
  Promising: "bg-aqua/20 text-teal-700",
  Normal: "border border-edge text-ink",
  Lagging: "bg-red-500/10 text-red-600",
  Pending: "border border-edge text-sub",
};

/** Status is always spelled out; color only reinforces it. */
export function StatusBadge({ status }: { status: Status | null }) {
  if (!status) return <span className="text-sub">–</span>;
  return <span className={clsx(BASE, TONE[status])}>{status}</span>;
}

export function EvergreenBadge() {
  return <span className={clsx(BASE, "bg-amethyst/20 text-purple")}>Evergreen</span>;
}

export function ThinBadge({ label }: { label: string }) {
  return <span className="inline-block whitespace-nowrap text-[10px] uppercase tracking-wide rounded px-1 border border-edge text-sub">{label}</span>;
}
