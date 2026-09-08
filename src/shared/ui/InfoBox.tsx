import { Info } from "lucide-react";

export default function InfoBox({ message }: { message: string }) {
  return (
    <span className="inline-block ml-1 align-middle group relative">
      <Info className="w-3.5 h-3.5 text-sub inline cursor-help" />
      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-64 p-2 text-xs normal-case tracking-normal leading-snug font-normal text-zinc-100 bg-zinc-800 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
        {message}
      </span>
    </span>
  );
}
