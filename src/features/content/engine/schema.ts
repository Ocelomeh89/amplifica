import { z } from "zod";
import { FORMATS, SOURCE_KINDS, SOURCE_STATUSES } from "./types";

// The contract between the routines and the app. A routine builds this body,
// the ingest endpoint validates it whole and writes it whole. Anything that
// fails here fails the entire batch, so a routine never half-writes a day.

const sourceRef = z.object({
  kind: z.enum(SOURCE_KINDS),
  external_id: z.string().min(1),
});

export const ingestSourceSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  external_id: z.string().min(1),
  title: z.string().default(""),
  url: z.string().url().nullable().optional(),
  occurred_at: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(SOURCE_STATUSES).default("pending"),
  mined_at: z.string().datetime({ offset: true }).nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const outlineBeatSchema = z.object({
  beat: z.string().min(1),
  note: z.string().optional(),
});

export const ingestIdeaSchema = z.object({
  source_ref: sourceRef.nullable(),
  from_hook_backlog: z.boolean().optional(),
  format: z.enum(FORMATS),
  title: z.string().min(1).max(200),
  hook: z.string().min(1).max(500),
  hook_alt: z.string().max(500).nullable().optional(),
  belief_attacked: z.string().default(""),
  value_to_listener: z.string().default(""),
  why_it_stops: z.string().default(""),
  outline: z.array(outlineBeatSchema).default([]),
  quote: z.string().default(""),
  quote_ref: z.string().default(""),
  pillar: z.string().default(""),
  hook_type: z.string().default(""),
  chain_key: z.string().optional(),
  score: z.number().min(0).max(1).default(0),
  batch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const ingestSchema = z
  .object({
    run: z
      .object({
        kind: z.enum(["daily", "weekly", "local", "manual"]),
        started_at: z.string().datetime({ offset: true }),
      })
      .optional(),
    sources: z.array(ingestSourceSchema).default([]),
    ideas: z.array(ingestIdeaSchema).default([]),
  })
  .superRefine((body, ctx) => {
    if (body.sources.length === 0 && body.ideas.length === 0) {
      ctx.addIssue({ code: "custom", message: "Empty body: no sources and no ideas." });
      return;
    }
    const known = new Set(body.sources.map((s) => `${s.kind}:${s.external_id}`));
    body.ideas.forEach((idea, i) => {
      if (idea.source_ref === null) {
        const backlogOk = idea.from_hook_backlog === true && idea.format === "newsletter";
        if (!backlogOk) {
          ctx.addIssue({
            code: "custom",
            path: ["ideas", i, "source_ref"],
            message: "Provenance is mandatory unless this is a newsletter idea from the hook backlog.",
          });
        }
        return;
      }
      const key = `${idea.source_ref.kind}:${idea.source_ref.external_id}`;
      if (!known.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["ideas", i, "source_ref"],
          message: `source_ref ${key} is not in this payload's sources.`,
        });
      }
    });
  });

export type IngestSource = z.infer<typeof ingestSourceSchema>;
export type IngestIdea = z.infer<typeof ingestIdeaSchema>;
export type IngestPayload = z.infer<typeof ingestSchema>;
