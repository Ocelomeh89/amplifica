// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RunErrors from "./RunErrors";

describe("RunErrors", () => {
  it("says which brief failed and why", () => {
    render(<RunErrors runs={[{ kind: "moment", error: "No test is left to run today." }, { kind: "swap", error: "The idea is gone." }]} />);
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts[0]).toContain("Your moment brief didn't work");
    expect(alerts[0]).toContain("No test is left to run today.");
    expect(alerts[1]).toContain("The swap didn't work");
  });
  it("renders nothing when there are no failures", () => {
    const { container } = render(<RunErrors runs={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
