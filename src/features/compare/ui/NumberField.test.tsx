import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NumberField from "./NumberField";

describe("NumberField", () => {
  it("shows its label and current value", () => {
    render(<NumberField label="Monthly" value={2000} onChange={() => {}} />);
    expect(screen.getByLabelText("Monthly")).toHaveValue(2000);
  });

  it("reports numbers as they are typed", () => {
    const onChange = vi.fn();
    render(<NumberField label="Monthly" value={2000} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Monthly"), { target: { value: "2500" } });
    expect(onChange).toHaveBeenCalledWith(2500);
  });

  it("treats an emptied field as zero rather than NaN", () => {
    // NaN would propagate into the engine and surface as "—" across every
    // metric, which reads as a crash rather than an empty input.
    const onChange = vi.fn();
    render(<NumberField label="Monthly" value={2000} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Monthly"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("renders a suffix when given one", () => {
    render(<NumberField label="Rate" value={4} onChange={() => {}} suffix="%" />);
    expect(screen.getByText("%")).toBeInTheDocument();
  });
});
