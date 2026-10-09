"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { fmtUSD0 } from "@/shared/format";
import { saveProjectionSettings } from "../data/actions";
import type { ProjectionSettings } from "../settings";

// Gear button + popover. Field names are the parseProjectionSettings contract.
export default function ProjectionSettingsPanel({
  settings,
  latestFaceValue,
  msc,
}: {
  settings: ProjectionSettings;
  latestFaceValue: number;
  msc: number;
}) {
  const [open, setOpen] = useState(false);
  const input = "w-full bg-card border border-edge rounded px-2 py-1 text-sm";
  const label = "block text-[11px] text-sub mb-1";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Projection settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded text-sub hover:text-ink hover:bg-edge"
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <form
          action={async (fd) => {
            await saveProjectionSettings(fd);
            setOpen(false);
          }}
          className="absolute right-0 top-full mt-1 z-20 w-72 bg-card border border-edge rounded-lg shadow-lg p-3 space-y-2"
        >
          <div className="text-xs text-sub">
            Monthly contribution: <span className="font-semibold">{fmtUSD0(msc)}</span>{" "}
            <Link href="/settings" className="text-purple">Edit in Settings</Link>
          </div>
          <div>
            <label className={label} htmlFor="next_draw_size">Next draw size ($)</label>
            <input id="next_draw_size" name="next_draw_size" type="number" min={0} step={500}
              defaultValue={settings.nextDrawSize ?? ""} placeholder={String(latestFaceValue)} className={input} />
            <p className="text-[10px] text-sub mt-0.5">Blank uses your latest Amplicon ({fmtUSD0(latestFaceValue)}).</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="investment_interest_pct">Amplicon rate (%)</label>
              <input id="investment_interest_pct" name="investment_interest_pct" type="number" min={0} max={20} step={0.25}
                defaultValue={settings.investmentInterestPct * 100} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="term_months">Term (months)</label>
              <input id="term_months" name="term_months" type="number" min={12} max={120} step={1}
                defaultValue={settings.termMonths} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="loc_interest_pct">LoC rate (%)</label>
              <input id="loc_interest_pct" name="loc_interest_pct" type="number" min={0} max={30} step={0.25}
                defaultValue={settings.locInterestPct * 100} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="loc_increase">Step-up (×)</label>
              <input id="loc_increase" name="loc_increase" type="number" min={1} max={2} step={0.05}
                defaultValue={settings.locIncrease} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="horizon_years">Horizon (years)</label>
              <input id="horizon_years" name="horizon_years" type="number" min={5} max={50} step={1}
                defaultValue={settings.horizonMonths / 12} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="start_delay_months">Start delay</label>
              <select id="start_delay_months" name="start_delay_months" defaultValue={settings.startDelayMonths} className={input}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n === 0 ? "None" : `${n} mo`}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-sub">
            Months before the first projected draw. Until then, your payouts and savings pay down your line of credit.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="text-xs px-2 py-1 rounded bg-edge text-sub">Cancel</button>
            <button type="submit" className="text-xs px-3 py-1 rounded bg-purple text-white">Save</button>
          </div>
        </form>
      )}
    </div>
  );
}
