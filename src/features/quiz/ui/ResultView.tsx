import { ARCHETYPES, DISCLAIMER, MIGUEL_NOTE, type CtaLink, type QuizResult } from "../content";

function CtaButton({ cta, variant }: { cta: CtaLink; variant: "primary" | "secondary" }) {
  const external = cta.href.startsWith("http");
  const className =
    variant === "primary"
      ? "block w-full text-center bg-purple hover:bg-purple/90 transition-colors text-white text-base min-h-[52px] leading-[52px] rounded-lg"
      : "block w-full text-center border border-purple text-purple text-base min-h-[52px] leading-[52px] rounded-lg";
  return (
    <a
      href={cta.href}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {cta.label}
    </a>
  );
}

export default function ResultView({ result }: { result: QuizResult }) {
  const archetype = ARCHETYPES[result.archetype];
  const runnerUp = ARCHETYPES[result.runnerUp];

  return (
    <article>
      <p className="text-xs uppercase tracking-wide text-sub mb-2">Your investor profile</p>
      <h1 className="font-display text-3xl leading-tight mb-4">{archetype.name}</h1>
      <p className="text-base leading-relaxed mb-6">{archetype.diagnosis}</p>

      <section className="bg-card border border-edge rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-purple mb-2">Your next single</h2>
        <p className="text-base leading-relaxed">{archetype.nextSingle}</p>
      </section>

      <div className="space-y-3 mb-6">
        <CtaButton cta={archetype.primary} variant="primary" />
        {archetype.secondary && <CtaButton cta={archetype.secondary} variant="secondary" />}
      </div>

      <p className="text-sm text-sub mb-2">
        You also have some of: <span className="text-ink">{runnerUp.name}</span>.
      </p>
      <a
        href={`/quiz/r/${result.token}/pdf`}
        className="inline-flex items-center min-h-[44px] text-base text-purple underline mb-6"
      >
        Download your results (PDF)
      </a>

      <blockquote className="border-l-2 border-amethyst pl-4 text-base italic text-sub mb-6">
        {MIGUEL_NOTE}
      </blockquote>

      <p className="text-xs text-sub">{DISCLAIMER}</p>
    </article>
  );
}
