import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QUESTIONS, QUIZ_VERSION } from "../content";

const submitQuiz = vi.fn(async (_fd: FormData): Promise<{ error: string | null }> => ({ error: null }));
vi.mock("../data/actions", () => ({ submitQuiz: (fd: FormData) => submitQuiz(fd) }));

import QuizClient from "./QuizClient";

const KEY = `amp_quiz_v${QUIZ_VERSION}`;
const utm = { utm_source: "ig", utm_medium: "story", utm_campaign: "oct" };

function renderQuiz() {
  return render(<QuizClient utm={utm} advanceDelayMs={0} />);
}

async function start() {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await screen.findByText("1 of 15");
}

/** Taps the first option on each question from the current one through question `through` (1-based). */
async function answerThrough(through: number, from = 1) {
  for (let n = from; n <= through; n++) {
    const first = QUESTIONS[n - 1].options[0].text;
    fireEvent.click(screen.getByRole("button", { name: first }));
    if (n < 15) await screen.findByText(`${n + 1} of 15`);
  }
}

beforeEach(() => {
  window.localStorage.clear();
  submitQuiz.mockClear();
  submitQuiz.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("QuizClient", () => {
  it("opens on the landing screen and starts at question 1", async () => {
    renderQuiz();
    expect(screen.getByRole("heading", { name: "What kind of investor are you?" })).toBeInTheDocument();
    expect(screen.getByText(/15 questions\. About 3 minutes\./)).toBeInTheDocument();
    await start();
    expect(screen.getByRole("heading", { name: QUESTIONS[0].prompt })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /./ }).filter((b) => b.hasAttribute("aria-pressed"))).toHaveLength(5);
  });

  it("advances after an answer and Back keeps the earlier choice", async () => {
    renderQuiz();
    await start();
    fireEvent.click(screen.getByRole("button", { name: QUESTIONS[0].options[2].text }));
    await screen.findByText("2 of 15");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("1 of 15");
    expect(screen.getByRole("button", { name: QUESTIONS[0].options[2].text })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores a second tap while it is advancing, so no question is skipped", async () => {
    renderQuiz();
    await start();
    fireEvent.click(screen.getByRole("button", { name: QUESTIONS[0].options[0].text }));
    fireEvent.click(screen.getByRole("button", { name: QUESTIONS[0].options[1].text }));
    await screen.findByText("2 of 15");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText("2 of 15")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("1 of 15");
    expect(screen.getByRole("button", { name: QUESTIONS[0].options[0].text })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the email gate after question 15 with the answers and UTMs in hidden fields", async () => {
    const { container } = renderQuiz();
    await start();
    await answerThrough(15);
    expect(await screen.findByRole("heading", { name: "Where should we send your results?" })).toBeInTheDocument();
    expect((container.querySelector('input[name="answers"]') as HTMLInputElement).value).toBe(
      "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"
    );
    expect((container.querySelector('input[name="utm_source"]') as HTMLInputElement).value).toBe("ig");
    expect((container.querySelector('input[name="utm_medium"]') as HTMLInputElement).value).toBe("story");
    expect((container.querySelector('input[name="utm_campaign"]') as HTMLInputElement).value).toBe("oct");
    const honeypot = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText(/We'll also send you the Amplifica newsletter\. Unsubscribe anytime\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveClass("text-base");
    expect(screen.getByLabelText("Email")).toHaveClass("text-base");
  });

  it("submits the form to the server action and shows its error", async () => {
    submitQuiz.mockResolvedValueOnce({ error: "Please enter a valid email address." });
    renderQuiz();
    await start();
    await answerThrough(15);
    await screen.findByRole("heading", { name: "Where should we send your results?" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam Rivera" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Show my results" }).closest("form")!);
    await waitFor(() => expect(submitQuiz).toHaveBeenCalledTimes(1));
    const fd = submitQuiz.mock.calls[0][0];
    expect(fd.get("name")).toBe("Sam Rivera");
    expect(fd.get("email")).toBe("sam@example.com");
    expect(fd.get("answers")).toBe("0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
    await screen.findByText("Please enter a valid email address.");
    expect(screen.getByRole("button", { name: "Show my results" })).not.toBeDisabled();
  });

  it("turns a thrown action into a generic retry message", async () => {
    submitQuiz.mockRejectedValueOnce(new Error("boom"));
    renderQuiz();
    await start();
    await answerThrough(15);
    await screen.findByRole("heading", { name: "Where should we send your results?" });
    fireEvent.submit(screen.getByRole("button", { name: "Show my results" }).closest("form")!);
    await screen.findByText("Something went wrong. Please try again.");
  });

  it("resumes at the first unanswered question after a reload", async () => {
    window.localStorage.setItem(KEY, JSON.stringify([1, 2, 3, ...new Array(12).fill(null)]));
    renderQuiz();
    await screen.findByText("4 of 15");
    expect(screen.getByRole("heading", { name: QUESTIONS[3].prompt })).toBeInTheDocument();
  });

  it("starts clean when saved progress is junk", async () => {
    window.localStorage.setItem(KEY, "{not json");
    renderQuiz();
    expect(screen.getByRole("heading", { name: "What kind of investor are you?" })).toBeInTheDocument();
  });

  it("works when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderQuiz();
    await start();
    await answerThrough(2);
    expect(screen.getByText("3 of 15")).toBeInTheDocument();
  });
});
