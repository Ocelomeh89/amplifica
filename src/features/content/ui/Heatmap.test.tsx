import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Heatmap from "./Heatmap";
import { bestTimes } from "@/features/content/engine/best-times";

describe("Heatmap", () => {
  it("renders 7 rows of 24 cells and titles a cell with its tier", () => {
    const cells = bestTimes([
      { id: "a", platform: "instagram", format: "reel", pillar: "", hook_type: "", hook_used: "", posted_at: "2026-09-21T13:00:00Z", metrics: {}, first: null, reach: null, saves_rate: null, shares_rate: null, watch_s: null, n_saves: null, n_shares: null, n_watch: null, n_reach: 1.5 },
    ]);
    render(<Heatmap cells={cells} />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(168);
    expect(screen.getByTitle("Mon 08:00 · 1 post · 1.50× reach · one data point")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
  });
});
