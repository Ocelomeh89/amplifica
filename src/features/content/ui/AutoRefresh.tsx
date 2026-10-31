"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A background job is running: re-read the page every 20 seconds until it finishes.
export default function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
