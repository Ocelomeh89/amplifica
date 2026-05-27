import type { ReactNode } from "react";

export default function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-zinc-200 rounded-lg p-4 mb-4">
      {title && <h2 className="font-semibold mb-3">{title}</h2>}
      {children}
    </section>
  );
}
