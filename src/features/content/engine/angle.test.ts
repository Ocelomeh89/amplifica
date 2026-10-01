import { describe, expect, it } from "vitest";
import { angleBlock, parseAngle } from "./angle";

describe("parseAngle", () => {
  it("accepts the three angles and defaults anything else to open", () => {
    expect(parseAngle("counterpoint")).toBe("counterpoint");
    expect(parseAngle("twist")).toBe("twist");
    expect(parseAngle("open")).toBe("open");
    expect(parseAngle("")).toBe("open");
    expect(parseAngle("hot-take")).toBe("open");
  });
});

describe("angleBlock", () => {
  it("is empty for open, so the default prompt is unchanged", () => {
    expect(angleBlock("open", "Some Creator")).toBe("");
  });
  it("counterpoint names the creator, asks for the other side, and protects sound basics", () => {
    const b = angleBlock("counterpoint", "Ramit");
    expect(b).toContain("COUNTERPOINT");
    expect(b).toContain("Ramit");
    expect(b).toContain("They said:");
    expect(b).toContain("quote_ref");
    expect(b).toMatch(/HYSA/);
  });
  it("twist keeps what they got right and adds what only Miguel can", () => {
    const b = angleBlock("twist");
    expect(b).toContain("TWIST");
    expect(b).toContain("another creator");
    expect(b).toMatch(/real numbers/);
  });
});
