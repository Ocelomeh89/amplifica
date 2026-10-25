// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TagFilters from "./TagFilters";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("window=30&tag=hook_type:paradox&tag=post_style:animation"),
}));

const filters = [
  { name: "hook_type" as const, value: "paradox" },
  { name: "post_style" as const, value: "animation" },
];

describe("TagFilters", () => {
  it("renders nothing with no filters", () => {
    const { container } = render(<TagFilters filters={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("removing one filter keeps the other and the window", () => {
    render(<TagFilters filters={filters} />);
    const href = screen.getByRole("link", { name: /Remove filter Hook Paradox/ }).getAttribute("href")!;
    const q = new URLSearchParams(href.slice(1));
    expect(q.getAll("tag")).toEqual(["post_style:animation"]);
    expect(q.get("window")).toBe("30");
  });

  it("clear all drops every tag filter and keeps the window", () => {
    render(<TagFilters filters={filters} />);
    const href = screen.getByRole("link", { name: "clear all" }).getAttribute("href")!;
    const q = new URLSearchParams(href.slice(1));
    expect(q.getAll("tag")).toEqual([]);
    expect(q.get("window")).toBe("30");
  });
});
