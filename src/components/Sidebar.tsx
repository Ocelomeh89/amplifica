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

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-ink text-zinc-300 px-3 py-5 flex-shrink-0 flex flex-col min-h-screen">
      <div className="text-white font-bold text-base mb-1 px-2">amplifica</div>
      <div className="text-xs text-zinc-500 mb-6 px-2 truncate">{email}</div>
      {items.map((item) => {
        const isActive = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            href={item.to}
            className={clsx(
              "flex items-center gap-2 px-2 py-1.5 rounded text-sm mb-0.5",
              isActive ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"
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
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full hover:bg-zinc-900"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
