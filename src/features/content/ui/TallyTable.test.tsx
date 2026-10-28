// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TallyTable from "./TallyTable";
import type { TallyRow } from "@/features/content/engine/experiments";

const row = (over: Partial<TallyRow> = {}): TallyRow => ({
  variable: "hook_type",
  label: "Hook type",
  values: [
    { value: "question", won: 4, lost: 1, flat: 0, total: 5, share: 0.8, thin: false },
    { value: "paradox", won: 1, lost: 0, flat: 1, total: 2, share: 0.5, thin: true },
  ],
  ...over,
});

describe("TallyTable", () => {
  it("shows won of total per value and marks thin ones in text", () => {
    render(<TallyTable rows={[row()]} />);
    expect(screen.getByText(/Question won 4 of 5/)).toBeTruthy();
    expect(screen.getByText("(thin)").parentElement!.textContent).toContain("Paradox won 1 of 2");
  });
  it("leaves out a variable with no counted values", () => {
    render(<TallyTable rows={[row(), row({ variable: "cta_type", label: "CTA", values: [] })]} />);
    expect(screen.queryByText("CTA:")).toBeNull();
  });
  it("says so when there is nothing to count", () => {
    render(<TallyTable rows={[row({ values: [] })]} />);
    expect(screen.getByText(/Nothing to count yet/)).toBeTruthy();
  });
});
