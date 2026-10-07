import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUIZ_VERSION } from "../content";
import { clearAnswers, loadAnswers, saveAnswers, type StoredAnswers } from "./quiz-storage";

const KEY = `amp_quiz_v${QUIZ_VERSION}`;
const partial = (n: number): StoredAnswers => [...new Array(n).fill(2), ...new Array(15 - n).fill(null)];

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("quiz-storage", () => {
  it("round-trips a partial set of answers", () => {
    saveAnswers(partial(4));
    expect(loadAnswers()).toEqual(partial(4));
  });

  it("returns null when nothing is saved or nothing was answered", () => {
    expect(loadAnswers()).toBeNull();
    saveAnswers(partial(0));
    expect(loadAnswers()).toBeNull();
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an array", '{"a":1}'],
    ["wrong length", "[0,1,2]"],
    ["out-of-range value", JSON.stringify([...new Array(14).fill(0), 9])],
    ["a string value", JSON.stringify([...new Array(14).fill(0), "1"])],
  ])("returns null for junk: %s", (_label, raw) => {
    window.localStorage.setItem(KEY, raw);
    expect(loadAnswers()).toBeNull();
  });

  it("clears saved answers", () => {
    saveAnswers(partial(3));
    clearAnswers();
    expect(loadAnswers()).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadAnswers()).toBeNull();
    expect(() => saveAnswers(partial(2))).not.toThrow();
    expect(() => clearAnswers()).not.toThrow();
  });
});
