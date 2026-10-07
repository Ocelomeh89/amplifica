import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ARCHETYPE_KEYS, ARCHETYPES, COMMUNITY_JOIN_URL, DEBT_LETTER_URL, DISCLAIMER, MIGUEL_NOTE } from "../content";
import ResultView from "./ResultView";

const TOKEN = "11111111-2222-4333-8444-555555555555";

function view(archetype: (typeof ARCHETYPE_KEYS)[number], runnerUp: (typeof ARCHETYPE_KEYS)[number] = "acquirer") {
  return render(
    <ResultView result={{ token: TOKEN, name: "Sam Rivera", archetype, runnerUp, createdAt: "2026-10-06T12:00:00Z" }} />
  );
}

describe("ResultView", () => {
  it("shows the archetype name, diagnosis, next single, runner-up, note and disclaimer", () => {
    view("serial-dabbler", "etf-optimizer");
    const a = ARCHETYPES["serial-dabbler"];
    expect(screen.getByRole("heading", { level: 1, name: a.name })).toBeInTheDocument();
    expect(screen.getByText(a.diagnosis)).toBeInTheDocument();
    expect(screen.getByText(a.nextSingle)).toBeInTheDocument();
    expect(screen.getByText(/You also have some of:/)).toHaveTextContent(ARCHETYPES["etf-optimizer"].name);
    expect(screen.getByText(MIGUEL_NOTE)).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("links the PDF download to this submission's token", () => {
    view("serial-dabbler");
    const link = screen.getByRole("link", { name: /Download your results \(PDF\)/ });
    expect(link).toHaveAttribute("href", `/quiz/r/${TOKEN}/pdf`);
  });

  it("sends the Debt-aholic to the letter first and the calculator second", () => {
    view("recovering-debt-aholic");
    expect(screen.getByRole("link", { name: "Read the letter" })).toHaveAttribute("href", DEBT_LETTER_URL);
    expect(screen.getByRole("link", { name: "Run the calculator" })).toHaveAttribute("href", "/calculator");
  });

  it("sends the Cash-Flow Builder to the community join page first", () => {
    view("cash-flow-builder");
    expect(screen.getByRole("link", { name: "Join Amplifica" })).toHaveAttribute("href", COMMUNITY_JOIN_URL);
    expect(screen.getByRole("link", { name: "Run the calculator" })).toHaveAttribute("href", "/calculator");
  });

  it("sends every other archetype to the calculator only", () => {
    view("etf-optimizer");
    expect(screen.getAllByRole("link", { name: "Run the calculator" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Read the letter" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Join Amplifica" })).toBeNull();
  });

  it("opens external destinations safely in a new tab", () => {
    view("cash-flow-builder");
    const link = screen.getByRole("link", { name: "Join Amplifica" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
