"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Coins,
  CreditCard,
  TrendingUp,
  Settings as SettingsIcon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import clsx from "clsx";
import { logout } from "@/app/login/actions";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/amplicons", label: "Amplicons", icon: Coins },
  { to: "/loc", label: "Lines of Credit", icon: CreditCard },
  { to: "/projections", label: "Projections", icon: TrendingUp },
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
  const [collapsed, setCollapsed] = useState(false);

  // Restore the saved preference after mount (avoids a hydration mismatch).
  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "1") setCollapsed(true);
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });

  return (
    <aside
      className={clsx(
        "bg-plum text-white/70 py-5 flex-shrink-0 flex flex-col min-h-screen transition-all duration-200",
        collapsed ? "w-16 px-2 items-center" : "w-56 px-3"
      )}
    >
      {/* Brand + collapse toggle */}
      <div
        className={clsx(
          "flex items-center mb-1",
          collapsed ? "justify-center" : "justify-between px-2"
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2">
            <AmplitudeMark />
            <span className="text-white font-display text-lg leading-none">Amplifica</span>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-white/60 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      {!collapsed && <div className="text-xs text-white/40 mb-6 px-2 truncate">{email}</div>}
      {collapsed && <div className="mb-6" />}

      {items.map((item) => {
        const isActive = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            href={item.to}
            title={collapsed ? item.label : undefined}
            className={clsx(
              "flex items-center gap-2 rounded text-sm mb-0.5 transition-colors",
              collapsed ? "justify-center w-10 h-10" : "px-2 py-1.5",
              isActive ? "bg-purple text-white" : "hover:bg-white/10 hover:text-white"
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}

      <div className="mt-auto">
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={clsx(
            "flex items-center gap-2 rounded text-sm mb-0.5 transition-colors",
            collapsed ? "justify-center w-10 h-10" : "px-2 py-1.5",
            pathname.startsWith("/settings") ? "bg-purple text-white" : "hover:bg-white/10 hover:text-white"
          )}
        >
          <SettingsIcon className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Log out" : undefined}
            className={clsx(
              "flex items-center gap-2 rounded text-sm transition-colors hover:bg-white/10 hover:text-white",
              collapsed ? "justify-center w-10 h-10" : "px-2 py-1.5 w-full"
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Log out</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
