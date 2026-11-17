// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProposeTestButton from "./ProposeTestButton";

const proposeTestAction = vi.fn(async () => ({ error: null as string | null, message: "A test is on the way. This takes a few minutes." }));
vi.mock("@/features/content/data/test-lab/test-lab-actions", () => ({ proposeTestAction: () => proposeTestAction() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ProposeTestButton", () => {
  it("proposes a test and says it is on the way", async () => {
    render(<ProposeTestButton proposalsLeft={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Propose next test" }));
    await waitFor(() => expect(screen.getByText("A test is on the way. This takes a few minutes.")).toBeTruthy());
  });
  it("is disabled with the cap text at no proposals left", () => {
    render(<ProposeTestButton proposalsLeft={0} />);
    expect((screen.getByRole("button", { name: "Propose next test" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("That's 3 test proposals today. Try again tomorrow.")).toBeTruthy();
  });
});
