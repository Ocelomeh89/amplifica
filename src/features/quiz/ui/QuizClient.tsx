"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { QUESTIONS, QUIZ_LENGTH } from "../content";
import { submitQuiz } from "../data/actions";
import { clearAnswers, loadAnswers, saveAnswers, type StoredAnswers } from "./quiz-storage";

interface Utm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

type Screen = "intro" | "question" | "gate";

const emptyAnswers = (): StoredAnswers => new Array(QUIZ_LENGTH).fill(null);

export default function QuizClient({
  utm,
  advanceDelayMs = 150,
}: {
  utm: Utm;
  /** Pause after a tap before moving on. Tests pass 0. */
  advanceDelayMs?: number;
}) {
  const [screen, setScreen] = useState<Screen>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<StoredAnswers>(emptyAnswers);
  const [error, setError] = useState<string | null>(null);
  // Plain state, not useTransition: React 18 does not track async transitions,
  // so the button would stop showing pending right away.
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancing = useRef(false);

  // Resume after a reload. Runs after mount so server and client markup match.
  useEffect(() => {
    const saved = loadAnswers();
    if (!saved) return;
    setAnswers(saved);
    const next = saved.findIndex((a) => a === null);
    if (next === -1) {
      setScreen("gate");
    } else {
      setIndex(next);
      setScreen("question");
    }
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function choose(option: number) {
    // A second tap during the short advance pause must not skip a question.
    if (advancing.current) return;
    advancing.current = true;
    const next = answers.map((a, i) => (i === index ? option : a));
    setAnswers(next);
    saveAnswers(next);
    timer.current = setTimeout(() => {
      advancing.current = false;
      timer.current = null;
      if (index === QUIZ_LENGTH - 1) setScreen("gate");
      else setIndex(index + 1);
    }, advanceDelayMs);
  }

  function back() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    advancing.current = false;
    if (screen === "gate") {
      setIndex(QUIZ_LENGTH - 1);
      setScreen("question");
    } else if (index === 0) {
      setScreen("intro");
    } else {
      setIndex(index - 1);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const formData = new FormData(e.currentTarget);
    setError(null);
    setPending(true);
    try {
      const result = await submitQuiz(formData);
      if (result?.error) {
        setError(result.error);
        setPending(false);
      } else {
        // Success: the action redirects and navigation takes over. Progress
        // is cleared only now, so a failed submit can still resume. Pending
        // stays true so a second tap cannot double-submit during navigation.
        clearAnswers();
      }
    } catch {
      // A real throw means the request itself failed.
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  if (screen === "intro") {
    return (
      <div className="text-center pt-6">
        <h1 className="font-display text-3xl leading-tight mb-3">What kind of investor are you?</h1>
        <p className="text-base text-sub leading-relaxed mb-8">
          15 questions. About 3 minutes. You get your investor profile and your next step.
        </p>
        <button
          type="button"
          onClick={() => setScreen("question")}
          className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-base min-h-[52px] rounded-lg"
        >
          Start
        </button>
      </div>
    );
  }

  if (screen === "question") {
    const question = QUESTIONS[index];
    return (
      <div>
        <div className="flex items-center justify-between text-sm text-sub mb-2">
          <button type="button" onClick={back} className="min-h-[44px] pr-3 text-purple">
            Back
          </button>
          <span>{index + 1} of {QUIZ_LENGTH}</span>
        </div>
        <div
          role="progressbar"
          aria-label="Quiz progress"
          aria-valuemin={0}
          aria-valuemax={QUIZ_LENGTH}
          aria-valuenow={index + 1}
          className="h-2 rounded bg-edge mb-6"
        >
          <div
            className="h-2 rounded bg-purple transition-all"
            style={{ width: `${((index + 1) / QUIZ_LENGTH) * 100}%` }}
          />
        </div>
        <h2 className="font-display text-2xl leading-snug mb-5">{question.prompt}</h2>
        <div className="space-y-3">
          {question.options.map((option, i) => {
            const selected = answers[index] === i;
            return (
              <button
                key={`${index}-${i}`}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(i)}
                className={`w-full text-left text-base leading-snug min-h-[52px] px-4 py-3 rounded-lg border transition-colors ${
                  selected ? "border-purple bg-purple/10" : "border-edge bg-card hover:border-purple/60"
                }`}
              >
                {option.text}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={back} className="min-h-[44px] pr-3 text-sm text-purple mb-2">
        Change my last answer
      </button>
      <h2 className="font-display text-2xl leading-snug mb-5">Where should we send your results?</h2>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4"
        >
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Honeypot: hidden from humans; bots that fill it are silently dropped. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <input type="hidden" name="answers" value={answers.join(",")} />
        <input type="hidden" name="utm_source" value={utm.utm_source ?? ""} />
        <input type="hidden" name="utm_medium" value={utm.utm_medium ?? ""} />
        <input type="hidden" name="utm_campaign" value={utm.utm_campaign ?? ""} />

        <div>
          <label htmlFor="quiz-name" className="block text-sm text-sub mb-1">
            Name
          </label>
          <input
            id="quiz-name"
            name="name"
            type="text"
            required
            maxLength={100}
            autoComplete="name"
            className="w-full border border-edge bg-card rounded-lg px-3 min-h-[52px] text-base"
          />
        </div>
        <div>
          <label htmlFor="quiz-email" className="block text-sm text-sub mb-1">
            Email
          </label>
          <input
            id="quiz-email"
            name="email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full border border-edge bg-card rounded-lg px-3 min-h-[52px] text-base"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-base min-h-[52px] rounded-lg disabled:opacity-60"
        >
          {pending ? "Scoring..." : "Show my results"}
        </button>
      </form>

      <p className="text-xs text-sub mt-4">
        We&apos;ll also send you the Amplifica newsletter. Unsubscribe anytime.
      </p>
    </div>
  );
}
