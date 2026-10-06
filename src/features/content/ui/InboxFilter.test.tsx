import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import InboxFilter from "./InboxFilter";

const counts = { all: 5, reel: 2, youtube: 0, newsletter: 1, story: 2, x: 0 };

describe("InboxFilter", () => {
  it("links each chip to the filtered view and shows counts", () => {
    render(<InboxFilter active={null} counts={counts} />);
    expect(screen.getByRole("link", { name: /^All/ })).toHaveAttribute("href", "/content");
    expect(screen.getByRole("link", { name: /^Reel/ })).toHaveAttribute("href", "/content?format=reel");
    expect(screen.getByRole("link", { name: /^Newsletter/ })).toHaveAttribute("href", "/content?format=newsletter");
    expect(screen.getByRole("link", { name: /^Reel/ })).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: /^All/ })).toHaveTextContent("5");
  });
  it("marks only the active chip as current (All when nothing is selected)", () => {
    const { rerender } = render(<InboxFilter active={null} counts={counts} />);
    expect(screen.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^Reel/ })).not.toHaveAttribute("aria-current");
    rerender(<InboxFilter active="reel" counts={counts} />);
    expect(screen.getByRole("link", { name: /^Reel/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^All/ })).not.toHaveAttribute("aria-current");
  });
  it("keeps a chip with no ideas visible", () => {
    render(<InboxFilter active={null} counts={counts} />);
    expect(screen.getByRole("link", { name: /^YouTube/ })).toBeInTheDocument();
  });
});
