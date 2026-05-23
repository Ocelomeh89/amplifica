import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  Shield,
  GitBranch,
  Target,
  Settings,
  Upload,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Plan" },
  { to: "/investments", label: "Investments", icon: Wallet, group: "Plan" },
  { to: "/loc", label: "Line of Credit", icon: CreditCard, group: "Plan" },
  { to: "/policy", label: "Life Insurance", icon: Shield, group: "Plan" },
  { to: "/scenarios", label: "Scenarios", icon: GitBranch, group: "Plan" },
  { to: "/targets", label: "Targets", icon: Target, group: "Plan" },
  { to: "/settings", label: "Settings", icon: Settings, group: "Setup" },
  { to: "/import-export", label: "Import / Export", icon: Upload, group: "Setup" },
];

export default function Sidebar() {
  const investments = useStore((s) => s.portfolio.investments.length);
  const scenarios = useStore((s) => s.portfolio.scenarios.length);
  const portfolioName = useStore((s) => s.portfolio.name);

  let lastGroup = "";

  return (
    <aside className="w-56 bg-ink text-zinc-300 px-3 py-5 flex-shrink-0">
      <div className="text-white font-bold text-base mb-1 px-2">amplifica</div>
      <div className="text-xs text-zinc-500 mb-6 px-2 truncate">{portfolioName}</div>
      {items.map((item) => {
        const showGroup = item.group !== lastGroup;
        lastGroup = item.group;
        return (
          <div key={item.to}>
            {showGroup && (
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mt-4 mb-1 px-2">
                {item.group}
              </div>
            )}
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-sm",
                  isActive ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"
                )
              }
            >
              <item.icon className="w-4 h-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === "/investments" && investments > 0 && (
                <span className="text-xs text-zinc-500">{investments}</span>
              )}
              {item.to === "/scenarios" && scenarios > 0 && (
                <span className="text-xs text-zinc-500">{scenarios}</span>
              )}
            </NavLink>
          </div>
        );
      })}
    </aside>
  );
}
