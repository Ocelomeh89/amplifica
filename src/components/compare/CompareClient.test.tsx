import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import CompareClient from "./CompareClient";
import { DEFAULT_SPECS, UNBUILT_OPTIONS } from "@/lib/compare/defaults";

describe("CompareClient", () => {
  it("renders a column for every enabled option", () => {
    render(<CompareClient />);
    const table = screen.getByRole("table");
    for (const spec of DEFAULT_SPECS) {
      expect(within(table).getByText(spec.label), spec.id).toBeInTheDocument();
    }
  });

  it("drops an option's column when it is disabled", () => {
    render(<CompareClient />);
    const cash = DEFAULT_SPECS.find((s) => s.kind === "cash")!;
    fireEvent.click(screen.getByLabelText(`Include ${cash.label}`));
    expect(within(screen.getByRole("table")).queryByText(cash.label)).not.toBeInTheDocument();
  });

  it("recomputes when an input changes", () => {
    render(<CompareClient />);
    const before = screen.getByTestId("cell-irrReal-0").textContent;
    fireEvent.change(screen.getByLabelText(/monthly contribution/i), {
      target: { value: "8000" },
    });
    expect(screen.getByTestId("cell-irrReal-0").textContent).not.toBe(before);
  });

  it("shows the three unbuilt options", () => {
    render(<CompareClient />);
    for (const u of UNBUILT_OPTIONS) {
      expect(screen.getByText(u.label), u.label).toBeInTheDocument();
    }
  });

  it("keeps the limits panel collapsed until asked", () => {
    render(<CompareClient />);
    const details = screen.getByText(/what this model does not do/i).closest("details")!;
    expect(details.open).toBe(false);
  });

  it("survives every option being switched off", () => {
    render(<CompareClient />);
    for (const spec of DEFAULT_SPECS) {
      fireEvent.click(screen.getByLabelText(`Include ${spec.label}`));
    }
    expect(screen.getByText(/no options selected/i)).toBeInTheDocument();
  });

  it("shows a readable message rather than blanking when the engine rejects the inputs", () => {
    render(<CompareClient />);
    // Strip the schedule so the rental's $135k outlay can never be funded.
    fireEvent.change(screen.getByLabelText(/lump sum/i), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/monthly contribution/i), { target: { value: "0" } });
    expect(screen.getByText(/never accumulates/i)).toBeInTheDocument();
  });
});
