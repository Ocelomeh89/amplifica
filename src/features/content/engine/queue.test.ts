import { describe, expect, it } from "vitest";
import { nextRank, neighborToSwap, ranksAfterMove } from "./queue";

describe("nextRank", () => {
  it("is one past the largest rank, ignoring nulls", () => {
    expect(nextRank([1, 3, null, 2])).toBe(4);
  });
  it("starts at 1 for an empty queue", () => {
    expect(nextRank([])).toBe(1);
    expect(nextRank([null])).toBe(1);
  });
});

describe("neighborToSwap", () => {
  const q = [
    { id: "a", queue_rank: 1 },
    { id: "b", queue_rank: 2 },
    { id: "c", queue_rank: 3 },
  ];
  it("swaps with the item above on up", () => {
    expect(neighborToSwap(q, "b", "up")).toEqual({ a: { id: "b", rank: 1 }, b: { id: "a", rank: 2 } });
  });
  it("swaps with the item below on down", () => {
    expect(neighborToSwap(q, "b", "down")).toEqual({ a: { id: "b", rank: 3 }, b: { id: "c", rank: 2 } });
  });
  it("is null at the edges and for an unknown id", () => {
    expect(neighborToSwap(q, "a", "up")).toBeNull();
    expect(neighborToSwap(q, "c", "down")).toBeNull();
    expect(neighborToSwap(q, "zz", "up")).toBeNull();
  });
  it("uses positions when ranks are null, so a queue with gaps still moves", () => {
    const gaps = [
      { id: "a", queue_rank: null },
      { id: "b", queue_rank: null },
    ];
    expect(neighborToSwap(gaps, "b", "up")).toEqual({ a: { id: "b", rank: 1 }, b: { id: "a", rank: 2 } });
  });
});

describe("ranksAfterMove", () => {
  const q = [
    { id: "a", queue_rank: 1 },
    { id: "b", queue_rank: 2 },
    { id: "c", queue_rank: 3 },
  ];
  it("writes only the two swapped rows on a healthy queue", () => {
    expect(ranksAfterMove(q, "b", "up")).toEqual([
      { id: "b", rank: 1 },
      { id: "a", rank: 2 },
    ]);
  });
  it("heals a duplicate rank left by an earlier partial failure", () => {
    const drifted = [
      { id: "a", queue_rank: 2 },
      { id: "b", queue_rank: 2 },
      { id: "c", queue_rank: 3 },
    ];
    expect(ranksAfterMove(drifted, "c", "up")).toEqual([
      { id: "a", rank: 1 },
      { id: "c", rank: 2 },
      { id: "b", rank: 3 },
    ]);
  });
  it("heals null ranks from positions", () => {
    const nulls = [
      { id: "a", queue_rank: null },
      { id: "b", queue_rank: null },
    ];
    expect(ranksAfterMove(nulls, "b", "up")).toEqual([
      { id: "b", rank: 1 },
      { id: "a", rank: 2 },
    ]);
  });
  it("is null at the edges and for an unknown id", () => {
    expect(ranksAfterMove(q, "a", "up")).toBeNull();
    expect(ranksAfterMove(q, "c", "down")).toBeNull();
    expect(ranksAfterMove(q, "zz", "down")).toBeNull();
  });
});
