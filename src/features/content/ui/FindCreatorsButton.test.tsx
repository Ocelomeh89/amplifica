// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FindCreatorsButton from "./FindCreatorsButton";

const findCreatorsNowAction = vi.fn(async () => ({ error: null as string | null }));
vi.mock("@/features/content/data/discovery/discovery-actions", () => ({ findCreatorsNowAction: () => findCreatorsNowAction() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("FindCreatorsButton", () => {
  it("starts a search and says it takes a few minutes", async () => {
    render(<FindCreatorsButton left={3} lastNote={null} />);
    expect(screen.getByText("3 left today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Find creators now" }));
    await waitFor(() => expect(screen.getByText("Searching. This takes a few minutes; refresh to see the result.")).toBeTruthy());
  });

  it("shows the refusal and the last note", async () => {
    findCreatorsNowAction.mockResolvedValueOnce({ error: "You've searched 3 times today. Try again tomorrow." });
    render(<FindCreatorsButton left={0} lastNote={{ note: "Looked at 14 accounts, suggested 2.", at: "2026-11-16T12:00:00.000Z" }} />);
    expect(screen.getByText(/Looked at 14 accounts, suggested 2\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Find creators now" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
