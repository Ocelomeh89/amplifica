import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import WinnersBlock from "./WinnersBlock";

describe("WinnersBlock", () => {
  it("an untagged post says Not tagged yet", () => {
    render(<WinnersBlock insights={{ state: "untagged" }} />);
    expect(screen.getByText(/Not tagged yet/)).toBeInTheDocument();
  });

  it("a thin sample says how many posts it needs and how many there are", () => {
    render(<WinnersBlock insights={{ state: "thin", have: 9, need: 15 }} />);
    expect(screen.getByText("Needs 15 tagged posts like this one. You have 9.")).toBeInTheDocument();
  });

  it("shows the shared lines, the message line, the lacks line and the caveat", () => {
    render(
      <WinnersBlock
        insights={{
          state: "ok",
          winners: 10,
          winnerIds: [],
          rest: 20,
          shared: ["Question hooks: 6 of your top 10, 4 of the other 20."],
          message: "Message: Velocity. 3 posts carry it, 2 above median.",
          lacks: "Not in this post: a number on the cover. 5 of your top 10 have one.",
          caveat: "Small sample. Read these as hints, not rules.",
        }}
      />
    );
    expect(screen.getByText("Question hooks: 6 of your top 10, 4 of the other 20.")).toBeInTheDocument();
    expect(screen.getByText("Message: Velocity. 3 posts carry it, 2 above median.")).toBeInTheDocument();
    expect(screen.getByText("Not in this post: a number on the cover. 5 of your top 10 have one.")).toBeInTheDocument();
    expect(screen.getByText("Small sample. Read these as hints, not rules.")).toBeInTheDocument();
  });
});
