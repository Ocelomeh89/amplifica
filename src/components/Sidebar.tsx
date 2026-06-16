"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Coins, CreditCard, Settings as SettingsIcon, LogOut } from "lucide-react";
import clsx from "clsx";
import { logout } from "@/app/login/actions";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/amplicons", label: "Amplicons", icon: Coins },
  { to: "/loc", label: "Lines of Credit", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

// The Amplitude Mark — five bars on an exponential curve (height ratio ≈ 1.7× per
// step), filled with the brand gradient (Amethyst → Royal Purple).
function AmplitudeMark() {
  return (
    <svg width="30" height="26" viewBox="0 0 30 26" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="amp-mark" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#A88BE8" />
          <stop offset="100%" stopColor="#6C4BD3" />
        </linearGradient>
      </defs>
      <g fill="url(#amp-mark)">
        <rect x="0" y="23" width="4" height="3" rx="1" />
        <rect x="6.5" y="21" width="4" height="5" rx="1" />
        <rect x="13" y="18" width="4" height="8" rx="1" />
        <rect x="19.5" y="12" width="4" height="14" rx="1" />
        <rect x="26" y="2" width="4" height="24" rx="1" />
      </g>
    </svg>
  );
}

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-plum text-white/70 px-3 py-5 flex-shrink-0 flex flex-col min-h-screen">
      <div className="flex items-center gap-2 mb-1 px-2">
        <AmplitudeMark />
        <span className="text-white font-display text-lg leading-none">Amplifica</span>
      </div>
      <div className="text-xs text-white/40 mb-6 px-2 truncate">{email}</div>
      {items.map((item) => {
        const isActive = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            href={item.to}
            className={clsx(
              "flex items-center gap-2 px-2 py-1.5 rounded text-sm mb-0.5 transition-colors",
              isActive ? "bg-purple text-white" : "hover:bg-white/10 hover:text-white"
            )}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <div className="mt-auto">
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
