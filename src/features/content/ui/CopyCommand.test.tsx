import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CopyCommand from "./CopyCommand";

describe("CopyCommand", () => {
  it("copies the command and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyCommand command="/content-draft abc" />);
    fireEvent.click(screen.getByRole("button", { name: /copy \/content-draft abc/i }));
    expect(writeText).toHaveBeenCalledWith("/content-draft abc");
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });
  it("does not throw when the clipboard is unavailable", () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<CopyCommand command="/content-draft abc" />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });
});
