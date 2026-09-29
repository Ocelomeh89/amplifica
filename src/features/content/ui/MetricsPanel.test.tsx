import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MetricsPanel from "./MetricsPanel";

describe("MetricsPanel", () => {
  it("shows the Instagram metrics that matter with rates", () => {
    render(<MetricsPanel platform="instagram" metrics={{ reach: 384, views: 591, saves: 2, shares: 1, avg_watch_time_s: 9.826 }} capturedAt="2026-09-22T10:00:00Z" />);
    expect(screen.getByText("Saves / reach")).toBeInTheDocument();
    expect(screen.getByText("0.5%")).toBeInTheDocument();
    expect(screen.getByText("9.8s")).toBeInTheDocument();
  });
  it("shows beehiiv open and click rates", () => {
    render(<MetricsPanel platform="beehiiv" metrics={{ open_rate: 0.6316, click_rate: 0.0556, unsubscribes: 0 }} capturedAt="2026-09-22T10:00:00Z" />);
    expect(screen.getByText("63.2%")).toBeInTheDocument();
    expect(screen.getByText("5.6%")).toBeInTheDocument();
  });
  it("says so when there is no snapshot yet", () => {
    render(<MetricsPanel platform="youtube" metrics={{}} capturedAt={null} />);
    expect(screen.getByText(/No metrics yet/)).toBeInTheDocument();
  });
});
