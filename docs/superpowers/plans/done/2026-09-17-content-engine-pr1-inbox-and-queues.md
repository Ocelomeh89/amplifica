# Content Engine PR 1: Inbox and Queues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the owner-only `/content` pages (inbox, queues, idea detail, sources) over nine new Supabase tables, plus the two secret-protected endpoints a routine uses to write ideas in and read taste context out.

**Architecture:** `features/content/` is an ordinary feature under the repo's three rules: `engine/` is pure and tested, `data/` holds Server Actions and the two endpoint helpers, `ui/` holds components. Routes live in `app/(app)/content/` and `app/api/content/`. Database I/O behind the endpoints is split into a small interface (`IngestDb`, `ContextDb`) so the write and read logic is unit-tested against a fake, and the Supabase implementation is a thin adapter.

**Tech Stack:** Next.js 14 App Router, Server Actions, Supabase (Postgres + RLS, service-role for endpoints), zod, Vitest + Testing Library, Tailwind with the brand tokens.

**Spec:** `docs/superpowers/specs/2026-09-17-content-engine-design.md`

## Global Constraints

- The three rules from `src/boundaries.test.ts`: `features/content` imports only from `shared/`; nothing imports `app/`.
- Every page and every Server Action in the feature calls `requireContentOwner()`; anyone but `CONTENT_OWNER_USER_ID` gets `notFound()`.
- RLS self policies on every new table keyed on `user_id`; writes are additionally scoped `.eq("user_id", user.id)`.
- Ingest and context endpoints authenticate with `Authorization: Bearer <CONTENT_ENGINE_SECRET>` and use the service-role client from `shared/supabase/admin.ts`.
- Ingest validates the whole body with zod and rejects it entirely on any failure.
- An idea without provenance is rejected unless `format` is `newsletter` and `from_hook_backlog` is true.
- Formats: `reel`, `youtube`, `newsletter`, `story`, `x`. Idea statuses: `inbox`, `queued`, `rejected`, `posted`, `archived`. Source statuses: `allowed`, `denied`, `pending`, `mined`.
- `/content` is disallowed in `robots.ts` and absent from `sitemap.ts`, like `/compare`.
- Commit after every task with the attribution line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Run `pnpm test`, `pnpm typecheck` before each commit. `pnpm build` at the end.
- Out of scope for this PR (later PRs): ClickUp, drafting, lint, metrics, crons, taste distillation, found-content form, Plaud section, drag-and-drop reordering (this PR uses Up/Down buttons; the spec's drag is a PR 4 polish item).

---

## File structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/0008_content_engine.sql` | Nine tables, triggers, RLS |
| `supabase/migrations/0008_content_engine.test.ts` | Asserts every table has RLS and the trigger |
| `src/shared/supabase/database.types.ts` | Type mirror gains nine tables and a `Json` type |
| `src/features/content/engine/types.ts` | Enumerations and the shared row-shape aliases |
| `src/features/content/engine/schema.ts` | zod schemas for the ingest body |
| `src/features/content/engine/owner.ts` | `isContentOwner(userId, ownerId)` |
| `src/features/content/engine/queue.ts` | `nextRank`, `neighborToSwap` |
| `src/features/content/engine/posts.ts` | `platformFromUrl`, `externalIdFromUrl` |
| `src/features/content/engine/runs.ts` | `lastRunByKind` |
| `src/features/content/data/owner.ts` | `requireContentOwner()` |
| `src/features/content/data/api-auth.ts` | `isAuthorized(req)` for the two endpoints |
| `src/features/content/data/ingest.ts` | `ingestPayload(db, payload, userId)` + `IngestDb` |
| `src/features/content/data/context.ts` | `buildContext(db, now)` + `ContextDb` |
| `src/features/content/data/supabase-db.ts` | Supabase adapters implementing `IngestDb` and `ContextDb` |
| `src/features/content/data/actions.ts` | Server Actions: like, pass, archive, move, markPosted, allowSource, denySource, addSourceRule, deleteSourceRule |
| `src/features/content/ui/IdeaCard.tsx` | One idea with Like/Pass |
| `src/features/content/ui/InboxList.tsx` | Client list with J/K/L/X keys |
| `src/features/content/ui/PendingSourcesStrip.tsx` | Allow/Deny strip |
| `src/features/content/ui/QueueCard.tsx` | Queue row with Up/Down/Mark posted/Archive |
| `src/features/content/ui/FormatBadge.tsx` | Format label |
| `src/features/content/ui/ContentTabs.tsx` | Nav between the content pages |
| `src/features/content/nav.ts` | Sidebar item |
| `src/features/content/CLAUDE.md` | Folder map + the seed curl |
| `src/app/(app)/content/page.tsx` | Inbox |
| `src/app/(app)/content/queue/page.tsx` | Queues |
| `src/app/(app)/content/ideas/[id]/page.tsx` | Idea detail |
| `src/app/(app)/content/sources/page.tsx` | Sources |
| `src/app/api/content/ingest/route.ts` | POST |
| `src/app/api/content/context/route.ts` | GET |
| `src/app/content-route.test.ts` | Privacy assertions |
| `routines/examples/daily-ingest.json` | Example payload used by tests and the seed curl |

---

### Task 1: Migration 0008 and the type mirror

**Files:**
- Create: `supabase/migrations/0008_content_engine.sql`
- Create: `supabase/migrations/0008_content_engine.test.ts`
- Modify: `src/shared/supabase/database.types.ts`

**Interfaces:**
- Produces: table names `content_sources`, `content_source_rules`, `content_ideas`, `content_drafts`, `content_taste_rules`, `content_voice`, `content_posts`, `content_metrics`, `content_reviews`; type aliases `ContentSource`, `ContentSourceInsert`, `ContentSourceRule`, `ContentIdea`, `ContentIdeaInsert`, `ContentIdeaUpdate`, `ContentDraft`, `ContentTasteRule`, `ContentVoice`, `ContentPost`, `ContentPostInsert`, `ContentMetric`, `ContentReview`, and `Json`.

- [ ] **Step 1: Write the failing migration test**

`supabase/migrations/0008_content_engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The migration is applied by hand in the Supabase dashboard, so nothing runs
// it in CI. What can be asserted is that every table it creates is named in
// the block that enables RLS and attaches the updated_at trigger.
const TABLES = [
  "content_sources",
  "content_source_rules",
  "content_ideas",
  "content_drafts",
  "content_taste_rules",
  "content_voice",
  "content_posts",
  "content_metrics",
  "content_reviews",
];

describe("0008_content_engine.sql", () => {
  const sql = readFileSync("supabase/migrations/0008_content_engine.sql", "utf8");

  it("creates all nine tables", () => {
    for (const t of TABLES) expect(sql).toContain(`create table public.${t} (`);
  });

  it("lists every table in the RLS + trigger block", () => {
    const block = sql.slice(sql.indexOf("foreach t in array"));
    for (const t of TABLES) expect(block).toContain(`'${t}'`);
    expect(block).toContain("enable row level security");
    expect(block).toContain("touch_updated_at");
  });

  it("gives every table a user_id that cascades from auth.users", () => {
    const count = sql.match(/user_id uuid not null references auth\.users\(id\) on delete cascade/g)?.length ?? 0;
    expect(count).toBe(TABLES.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run supabase/migrations/0008_content_engine.test.ts`
Expected: FAIL with `ENOENT` for the missing SQL file.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0008_content_engine.sql`:

```sql
-- Content engine. Spec: docs/superpowers/specs/2026-09-17-content-engine-design.md
-- Nine user-owned tables. Every table gets RLS self policies on user_id and the
-- touch_updated_at trigger in the block at the bottom. Enumerations are text
-- with check constraints, as in locs.loc_type.

-- One row per mined thing: a meeting, a recording, a found URL or file, a
-- comment, a scan item. Text for url/upload rows lives in meta.text.
create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('granola','wispr','plaud','vault','url','upload','comment','scan','manual')),
  external_id text not null,
  title text not null default '',
  url text,
  occurred_at timestamptz,
  status text not null default 'pending' check (status in ('allowed','denied','pending','mined')),
  requested_at timestamptz,
  mined_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, external_id)
);
create index content_sources_user_id_idx on public.content_sources(user_id);
create index content_sources_status_idx on public.content_sources(user_id, status);

-- Allow and deny patterns matched case-insensitively as substrings against a
-- meeting's title or participants before any transcript is read.
create table public.content_source_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('allow','deny')),
  field text not null check (field in ('title','participant')),
  pattern text not null check (length(pattern) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_source_rules_user_id_idx on public.content_source_rules(user_id);

-- The core. Provenance (source_id, quote, quote_ref) is mandatory except for
-- newsletter ideas drawn from the hook backlog; the ingest schema enforces it.
create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.content_sources(id) on delete set null,
  format text not null check (format in ('reel','youtube','newsletter','story','x')),
  title text not null,
  hook text not null,
  hook_alt text,
  belief_attacked text not null default '',
  value_to_listener text not null default '',
  why_it_stops text not null default '',
  outline jsonb not null default '[]'::jsonb,
  quote text not null default '',
  quote_ref text not null default '',
  pillar text not null default '',
  hook_type text not null default '',
  chain_id uuid,
  score numeric(6, 3) not null default 0,
  batch_date date not null default current_date,
  status text not null default 'inbox' check (status in ('inbox','queued','rejected','posted','archived')),
  queue_rank integer,
  feedback_reason text,
  feedback_at timestamptz,
  clickup_task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_ideas_user_id_idx on public.content_ideas(user_id);
create index content_ideas_status_idx on public.content_ideas(user_id, status);
create index content_ideas_chain_idx on public.content_ideas(chain_id);

-- Versioned drafts per idea. Written by PR 4.
create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  version integer not null check (version > 0),
  stage text not null check (stage in ('raw','humanized','edited')),
  body text not null default '',
  lint jsonb not null default '[]'::jsonb,
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, version)
);
create index content_drafts_user_id_idx on public.content_drafts(user_id);

-- Distilled taste rules. Retired rules go inactive; nothing is deleted.
create table public.content_taste_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule text not null,
  evidence_count integer not null default 1,
  origin text not null default 'manual' check (origin in ('derived','manual')),
  active boolean not null default true,
  last_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_taste_rules_user_id_idx on public.content_taste_rules(user_id);

-- One voice profile per user, built from the vault by a local companion.
create table public.content_voice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_md text not null default '',
  exemplars jsonb not null default '[]'::jsonb,
  built_from jsonb not null default '[]'::jsonb,
  built_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create index content_voice_user_id_idx on public.content_voice(user_id);

-- The posted log. Metric crons also insert rows for posts no idea claims.
create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.content_ideas(id) on delete set null,
  platform text not null check (platform in ('instagram','youtube','beehiiv','x')),
  external_id text not null,
  url text not null default '',
  format text not null default '',
  posted_at timestamptz not null default now(),
  hook_used text not null default '',
  caption text not null default '',
  pillar text not null default '',
  hook_type text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);
create index content_posts_user_id_idx on public.content_posts(user_id);

-- Append-only metric snapshots per post.
create table public.content_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.content_posts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_metrics_user_id_idx on public.content_metrics(user_id);
create index content_metrics_post_idx on public.content_metrics(post_id, captured_at);

-- One weekly review per week.
create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  narrative_md text not null default '',
  double_down jsonb not null default '[]'::jsonb,
  stop jsonb not null default '[]'::jsonb,
  best_times jsonb not null default '{}'::jsonb,
  plan jsonb not null default '[]'::jsonb,
  replies_owed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index content_reviews_user_id_idx on public.content_reviews(user_id);

-- Trigger + RLS for every table above, in one place so a table cannot be
-- added without its policies.
do $$
declare t text;
begin
  foreach t in array array[
    'content_sources',
    'content_source_rules',
    'content_ideas',
    'content_drafts',
    'content_taste_rules',
    'content_voice',
    'content_posts',
    'content_metrics',
    'content_reviews'
  ] loop
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('create policy %I_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('create policy %I_delete on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run supabase/migrations/0008_content_engine.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the type mirror**

In `src/shared/supabase/database.types.ts`, add at the very top of the file:

```ts
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
```

Then add these nine entries inside `Tables`, after the `leads` entry and before the closing `};` of `Tables`:

```ts
      content_sources: {
        Row: {
          id: string;
          user_id: string;
          kind: "granola" | "wispr" | "plaud" | "vault" | "url" | "upload" | "comment" | "scan" | "manual";
          external_id: string;
          title: string;
          url: string | null;
          occurred_at: string | null;
          status: "allowed" | "denied" | "pending" | "mined";
          requested_at: string | null;
          mined_at: string | null;
          meta: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          kind: "granola" | "wispr" | "plaud" | "vault" | "url" | "upload" | "comment" | "scan" | "manual";
          external_id: string;
          title?: string;
          url?: string | null;
          occurred_at?: string | null;
          status?: "allowed" | "denied" | "pending" | "mined";
          requested_at?: string | null;
          mined_at?: string | null;
          meta?: Json;
        };
        Update: {
          title?: string;
          url?: string | null;
          occurred_at?: string | null;
          status?: "allowed" | "denied" | "pending" | "mined";
          requested_at?: string | null;
          mined_at?: string | null;
          meta?: Json;
        };
        Relationships: [];
      };
      content_source_rules: {
        Row: {
          id: string;
          user_id: string;
          kind: "allow" | "deny";
          field: "title" | "participant";
          pattern: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          kind: "allow" | "deny";
          field: "title" | "participant";
          pattern: string;
        };
        Update: {
          kind?: "allow" | "deny";
          field?: "title" | "participant";
          pattern?: string;
        };
        Relationships: [];
      };
      content_ideas: {
        Row: {
          id: string;
          user_id: string;
          source_id: string | null;
          format: "reel" | "youtube" | "newsletter" | "story" | "x";
          title: string;
          hook: string;
          hook_alt: string | null;
          belief_attacked: string;
          value_to_listener: string;
          why_it_stops: string;
          outline: Json;
          quote: string;
          quote_ref: string;
          pillar: string;
          hook_type: string;
          chain_id: string | null;
          score: number;
          batch_date: string;
          status: "inbox" | "queued" | "rejected" | "posted" | "archived";
          queue_rank: number | null;
          feedback_reason: string | null;
          feedback_at: string | null;
          clickup_task_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          source_id?: string | null;
          format: "reel" | "youtube" | "newsletter" | "story" | "x";
          title: string;
          hook: string;
          hook_alt?: string | null;
          belief_attacked?: string;
          value_to_listener?: string;
          why_it_stops?: string;
          outline?: Json;
          quote?: string;
          quote_ref?: string;
          pillar?: string;
          hook_type?: string;
          chain_id?: string | null;
          score?: number;
          batch_date?: string;
          status?: "inbox" | "queued" | "rejected" | "posted" | "archived";
          queue_rank?: number | null;
        };
        Update: {
          status?: "inbox" | "queued" | "rejected" | "posted" | "archived";
          queue_rank?: number | null;
          feedback_reason?: string | null;
          feedback_at?: string | null;
          clickup_task_id?: string | null;
          score?: number;
        };
        Relationships: [];
      };
      content_drafts: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string;
          version: number;
          stage: "raw" | "humanized" | "edited";
          body: string;
          lint: Json;
          model: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          idea_id: string;
          version: number;
          stage: "raw" | "humanized" | "edited";
          body?: string;
          lint?: Json;
          model?: string;
        };
        Update: {
          body?: string;
          lint?: Json;
          stage?: "raw" | "humanized" | "edited";
        };
        Relationships: [];
      };
      content_taste_rules: {
        Row: {
          id: string;
          user_id: string;
          rule: string;
          evidence_count: number;
          origin: "derived" | "manual";
          active: boolean;
          last_evidence_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          rule: string;
          evidence_count?: number;
          origin?: "derived" | "manual";
          active?: boolean;
          last_evidence_at?: string | null;
        };
        Update: {
          rule?: string;
          evidence_count?: number;
          active?: boolean;
          last_evidence_at?: string | null;
        };
        Relationships: [];
      };
      content_voice: {
        Row: {
          id: string;
          user_id: string;
          profile_md: string;
          exemplars: Json;
          built_from: Json;
          built_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          profile_md?: string;
          exemplars?: Json;
          built_from?: Json;
          built_at?: string | null;
        };
        Update: {
          profile_md?: string;
          exemplars?: Json;
          built_from?: Json;
          built_at?: string | null;
        };
        Relationships: [];
      };
      content_posts: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string | null;
          platform: "instagram" | "youtube" | "beehiiv" | "x";
          external_id: string;
          url: string;
          format: string;
          posted_at: string;
          hook_used: string;
          caption: string;
          pillar: string;
          hook_type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          idea_id?: string | null;
          platform: "instagram" | "youtube" | "beehiiv" | "x";
          external_id: string;
          url?: string;
          format?: string;
          posted_at?: string;
          hook_used?: string;
          caption?: string;
          pillar?: string;
          hook_type?: string;
        };
        Update: {
          idea_id?: string | null;
          url?: string;
          format?: string;
          posted_at?: string;
          hook_used?: string;
          caption?: string;
          pillar?: string;
          hook_type?: string;
        };
        Relationships: [];
      };
      content_metrics: {
        Row: {
          id: string;
          user_id: string;
          post_id: string;
          captured_at: string;
          metrics: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          post_id: string;
          captured_at?: string;
          metrics?: Json;
        };
        Update: {
          metrics?: Json;
        };
        Relationships: [];
      };
      content_reviews: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          narrative_md: string;
          double_down: Json;
          stop: Json;
          best_times: Json;
          plan: Json;
          replies_owed: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          week_start: string;
          narrative_md?: string;
          double_down?: Json;
          stop?: Json;
          best_times?: Json;
          plan?: Json;
          replies_owed?: Json;
        };
        Update: {
          narrative_md?: string;
          double_down?: Json;
          stop?: Json;
          best_times?: Json;
          plan?: Json;
          replies_owed?: Json;
        };
        Relationships: [];
      };
```

And append these aliases at the end of the file:

```ts
export type ContentSource = Database["public"]["Tables"]["content_sources"]["Row"];
export type ContentSourceInsert = Database["public"]["Tables"]["content_sources"]["Insert"];
export type ContentSourceRule = Database["public"]["Tables"]["content_source_rules"]["Row"];
export type ContentIdea = Database["public"]["Tables"]["content_ideas"]["Row"];
export type ContentIdeaInsert = Database["public"]["Tables"]["content_ideas"]["Insert"];
export type ContentIdeaUpdate = Database["public"]["Tables"]["content_ideas"]["Update"];
export type ContentDraft = Database["public"]["Tables"]["content_drafts"]["Row"];
export type ContentTasteRule = Database["public"]["Tables"]["content_taste_rules"]["Row"];
export type ContentVoice = Database["public"]["Tables"]["content_voice"]["Row"];
export type ContentPost = Database["public"]["Tables"]["content_posts"]["Row"];
export type ContentPostInsert = Database["public"]["Tables"]["content_posts"]["Insert"];
export type ContentMetric = Database["public"]["Tables"]["content_metrics"]["Row"];
export type ContentReview = Database["public"]["Tables"]["content_reviews"]["Row"];
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: both pass. The type file has no consumers yet, so only syntax can break.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0008_content_engine.sql supabase/migrations/0008_content_engine.test.ts src/shared/supabase/database.types.ts
git commit -m "feat(content): migration 0008 with the nine content tables and type mirror

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Engine types and the ingest schema

**Files:**
- Create: `src/features/content/engine/types.ts`
- Create: `src/features/content/engine/schema.ts`
- Create: `src/features/content/engine/schema.test.ts`
- Create: `routines/examples/daily-ingest.json`
- Modify: `package.json` (add `zod`)

**Interfaces:**
- Produces: `FORMATS`, `Format`, `SOURCE_KINDS`, `SourceKind`, `IDEA_STATUSES`, `IdeaStatus`, `SOURCE_STATUSES`, `SourceStatus`, `OutlineBeat`, `ingestSchema`, `IngestPayload`, `IngestSource`, `IngestIdea`.

- [ ] **Step 1: Install zod**

Run: `pnpm add zod`
Expected: `zod` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Write the engine types**

`src/features/content/engine/types.ts`:

```ts
// Enumerations shared by the schema, the actions, and the UI. The database
// check constraints in migration 0008 are the source of truth; these mirror
// them so a typo is a compile error rather than a 23514 at runtime.

export const FORMATS = ["reel", "youtube", "newsletter", "story", "x"] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABEL: Record<Format, string> = {
  reel: "Reel",
  youtube: "YouTube",
  newsletter: "Newsletter",
  story: "Story",
  x: "X",
};

export const SOURCE_KINDS = [
  "granola",
  "wispr",
  "plaud",
  "vault",
  "url",
  "upload",
  "comment",
  "scan",
  "manual",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_STATUSES = ["allowed", "denied", "pending", "mined"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const IDEA_STATUSES = ["inbox", "queued", "rejected", "posted", "archived"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const PLATFORMS = ["instagram", "youtube", "beehiiv", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** One beat of an outline: what happens, and optionally what is on screen. */
export type OutlineBeat = { beat: string; note?: string };
```

- [ ] **Step 3: Write the failing schema test**

`src/features/content/engine/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ingestSchema } from "./schema";

const example = JSON.parse(readFileSync("routines/examples/daily-ingest.json", "utf8"));

describe("ingestSchema", () => {
  it("accepts the routine's example payload", () => {
    const result = ingestSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  it("rejects an idea whose source_ref names a source not in the payload", () => {
    const bad = structuredClone(example);
    bad.ideas[0].source_ref = { kind: "granola", external_id: "nope" };
    const result = ingestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an idea with no provenance", () => {
    const bad = structuredClone(example);
    bad.ideas[0].source_ref = null;
    delete bad.ideas[0].from_hook_backlog;
    const result = ingestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("allows a newsletter idea from the hook backlog to have no source", () => {
    const ok = structuredClone(example);
    ok.ideas[0].source_ref = null;
    ok.ideas[0].format = "newsletter";
    ok.ideas[0].from_hook_backlog = true;
    expect(ingestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects a reel idea from the hook backlog", () => {
    const bad = structuredClone(example);
    bad.ideas[0].source_ref = null;
    bad.ideas[0].format = "reel";
    bad.ideas[0].from_hook_backlog = true;
    expect(ingestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown format", () => {
    const bad = structuredClone(example);
    bad.ideas[0].format = "tiktok";
    expect(ingestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(ingestSchema.safeParse({ sources: [], ideas: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Write the example payload**

`routines/examples/daily-ingest.json`:

```json
{
  "run": { "kind": "daily", "started_at": "2026-09-17T11:00:00Z" },
  "sources": [
    {
      "kind": "granola",
      "external_id": "830179d0-d2b4-40d4-9d3f-bfd2adf32f50",
      "title": "Joe/Miguel",
      "url": "https://notes.granola.ai/d/830179d0-d2b4-40d4-9d3f-bfd2adf32f50",
      "occurred_at": "2026-09-17T15:00:00Z",
      "status": "allowed",
      "meta": { "participants": ["Joe", "Miguel"] }
    },
    {
      "kind": "granola",
      "external_id": "7110b1e1-c279-465c-b04b-55a19e5287a1",
      "title": "Technical accounting training and submission ingestion go-live",
      "occurred_at": "2026-09-17T14:01:00Z",
      "status": "pending"
    }
  ],
  "ideas": [
    {
      "source_ref": { "kind": "granola", "external_id": "830179d0-d2b4-40d4-9d3f-bfd2adf32f50" },
      "format": "reel",
      "title": "A W-2 is a runway, not a cage",
      "hook": "I took a new W-2 job this month. Here's why that speeds up leaving W-2 work for good.",
      "hook_alt": "The fastest way out of a paycheck is a bigger paycheck.",
      "belief_attacked": "You have to quit your job to build financial independence",
      "value_to_listener": "A concrete rule for how much of a raise goes to the flywheel before lifestyle sees a dollar",
      "why_it_stops": "The first line contradicts what the audience expects from someone selling freedom",
      "outline": [
        { "beat": "New job starts Monday. On screen: the offer letter, salary redacted." },
        { "beat": "The rule: 100% of the raise funds the monthly savings contribution." },
        { "beat": "Show the calculator with the old MSC vs the new MSC and the FI date moving." },
        { "beat": "Loop back: the job is the runway." }
      ],
      "quote": "the new job gives me the morning focus time back, and every extra dollar goes to the machine",
      "quote_ref": "Joe/Miguel 2026-09-17 ~00:12:40",
      "pillar": "optionality",
      "hook_type": "belief-attacking",
      "chain_key": "runway",
      "score": 0.82,
      "batch_date": "2026-09-17"
    },
    {
      "source_ref": { "kind": "granola", "external_id": "830179d0-d2b4-40d4-9d3f-bfd2adf32f50" },
      "format": "story",
      "title": "Poll: what do you do with a raise?",
      "hook": "Got a raise. Where does the first dollar go?",
      "belief_attacked": "A raise is for lifestyle",
      "value_to_listener": "Sees their own answer against the room's",
      "why_it_stops": "A poll is a tap, not a read",
      "outline": [
        { "beat": "Slide 1: the question with a 3-option poll sticker" },
        { "beat": "Slide 2: my answer, with the MSC field on the calculator" },
        { "beat": "Slide 3: link sticker to /calculator" }
      ],
      "quote": "every extra dollar goes to the machine",
      "quote_ref": "Joe/Miguel 2026-09-17 ~00:12:40",
      "pillar": "optionality",
      "hook_type": "question",
      "chain_key": "runway",
      "score": 0.61,
      "batch_date": "2026-09-17"
    }
  ]
}
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm vitest run src/features/content/engine/schema.test.ts`
Expected: FAIL, cannot resolve `./schema`.

- [ ] **Step 6: Write the schema**

`src/features/content/engine/schema.ts`:

```ts
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
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run src/features/content/engine/schema.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/features/content/engine/types.ts src/features/content/engine/schema.ts src/features/content/engine/schema.test.ts routines/examples/daily-ingest.json
git commit -m "feat(content): engine types and the zod ingest contract

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Owner gate, nav item, route privacy

**Files:**
- Create: `src/features/content/engine/owner.ts`
- Create: `src/features/content/engine/owner.test.ts`
- Create: `src/features/content/data/owner.ts`
- Create: `src/features/content/nav.ts`
- Create: `src/app/content-route.test.ts`
- Create: `src/app/(app)/content/page.tsx` (placeholder, replaced in Task 7)
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`
- Modify: `src/app/robots.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `isContentOwner(userId: string | null | undefined, ownerId: string | undefined): boolean`; `requireContentOwner(): Promise<{ supabase, user }>`; `contentNavItem`; Sidebar prop `showContent: boolean`.

- [ ] **Step 1: Write the failing owner test**

`src/features/content/engine/owner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isContentOwner } from "./owner";

describe("isContentOwner", () => {
  it("is true only when both ids are set and equal", () => {
    expect(isContentOwner("u1", "u1")).toBe(true);
    expect(isContentOwner("u1", "u2")).toBe(false);
  });

  it("is false when the env var is unset, so an empty env never opens the page", () => {
    expect(isContentOwner("u1", undefined)).toBe(false);
    expect(isContentOwner("u1", "")).toBe(false);
  });

  it("is false for an anonymous caller", () => {
    expect(isContentOwner(null, "u1")).toBe(false);
    expect(isContentOwner(undefined, "u1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/features/content/engine/owner.test.ts`
Expected: FAIL, cannot resolve `./owner`.

- [ ] **Step 3: Write the pure check and the server gate**

`src/features/content/engine/owner.ts`:

```ts
/**
 * The product gate for /content: one user, named by CONTENT_OWNER_USER_ID.
 * RLS is still the security boundary; this decides who sees the page at all.
 * An unset or empty env var opens the page to nobody.
 */
export function isContentOwner(
  userId: string | null | undefined,
  ownerId: string | undefined
): boolean {
  return Boolean(userId) && Boolean(ownerId) && userId === ownerId;
}
```

`src/features/content/data/owner.ts`:

```ts
import { notFound } from "next/navigation";
import { requireUser } from "@/shared/supabase/auth";
import { isContentOwner } from "@/features/content/engine/owner";

/**
 * requireUser(), then the owner check. Anyone signed in but not the owner
 * gets a 404, which reveals nothing about the page's existence.
 */
export async function requireContentOwner() {
  const { supabase, user } = await requireUser();
  if (!isContentOwner(user.id, process.env.CONTENT_OWNER_USER_ID)) notFound();
  return { supabase, user };
}
```

`src/features/content/nav.ts`:

```ts
import { Sparkles } from "lucide-react";

// Sidebar registration. The layout renders this only for the content owner.
export const contentNavItem = {
  to: "/content",
  label: "Content",
  icon: Sparkles,
};
```

- [ ] **Step 4: Run the owner test to verify it passes**

Run: `pnpm vitest run src/features/content/engine/owner.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing route-privacy test**

`src/app/content-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import robots from "./robots";
import sitemap from "./sitemap";

// /content is one person's page. Each half of "private" is asserted.
describe("/content stays private and owner-only", () => {
  it("sits inside the authed (app) group", () => {
    expect(() => readFileSync("src/app/(app)/content/page.tsx", "utf8")).not.toThrow();
  });

  it("is disallowed in robots.txt", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    const all = list.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : [r.disallow]));
    expect(all).toContain("/content");
  });

  it("is absent from the sitemap", () => {
    expect(sitemap().some((e) => e.url.includes("/content"))).toBe(false);
  });

  it("is shown in the sidebar only behind the owner flag", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(layout).toContain("isContentOwner(");
    expect(layout).toContain("showContent=");
    const sidebar = readFileSync("src/app/(app)/Sidebar.tsx", "utf8");
    expect(sidebar).toContain("showContent ? [contentNavItem] : []");
  });

  it("every content page and action opens with requireContentOwner", () => {
    const files = [
      "src/app/(app)/content/page.tsx",
    ];
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).toContain("requireContentOwner()");
    }
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/app/content-route.test.ts`
Expected: FAIL on the missing page and the robots rule.

- [ ] **Step 7: Wire the layout, sidebar, robots, placeholder page, env example**

`src/app/(app)/layout.tsx`, replace the whole file:

```tsx
import { requireUser } from "@/shared/supabase/auth";
import { isContentOwner } from "@/features/content/engine/owner";
import Sidebar from "./Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const showContent = isContentOwner(user.id, process.env.CONTENT_OWNER_USER_ID);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar email={user.email ?? ""} showContent={showContent} />
      <main className="flex-1 p-4 sm:p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
```

`src/app/(app)/Sidebar.tsx`, three edits:

1. Add the import after the amortization import:
```tsx
import { contentNavItem } from "@/features/content/nav";
```
2. Change the signature:
```tsx
export default function Sidebar({ email, showContent }: { email: string; showContent: boolean }) {
```
3. Replace `{items.map((item) => {` with:
```tsx
      {[...items, ...(showContent ? [contentNavItem] : [])].map((item) => {
```

`src/app/robots.ts`: add `"/content",` to the `disallow` array after `"/compare",`.

`src/app/(app)/content/page.tsx` (placeholder, Task 7 replaces it):

```tsx
import { requireContentOwner } from "@/features/content/data/owner";

export default async function ContentInboxPage() {
  await requireContentOwner();
  return <h1 className="text-xl font-semibold">Content</h1>;
}
```

`.env.example`, append:

```
# Content engine. The one user who can see /content, and the bearer token the
# scheduled routines present to /api/content/ingest and /api/content/context.
CONTENT_OWNER_USER_ID=<uuid of the owner in auth.users>
CONTENT_ENGINE_SECRET=<long random string>
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. `boundaries.test.ts` stays green because `app/` importing `features/content` is allowed.

- [ ] **Step 9: Commit**

```bash
git add src/features/content/engine/owner.ts src/features/content/engine/owner.test.ts src/features/content/data/owner.ts src/features/content/nav.ts src/app/content-route.test.ts "src/app/(app)/content/page.tsx" "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx" src/app/robots.ts .env.example
git commit -m "feat(content): owner gate, sidebar item, /content route privacy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Bearer auth and the ingest endpoint

**Files:**
- Create: `src/features/content/data/api-auth.ts`
- Create: `src/features/content/data/api-auth.test.ts`
- Create: `src/features/content/data/ingest.ts`
- Create: `src/features/content/data/ingest.test.ts`
- Create: `src/features/content/data/supabase-db.ts`
- Create: `src/app/api/content/ingest/route.ts`

**Interfaces:**
- Consumes: `ingestSchema`, `IngestPayload` from Task 2; `ContentSourceInsert`, `ContentIdeaInsert` from Task 1.
- Produces:
  - `isAuthorized(req: Request, secret: string | undefined): boolean`
  - `interface IngestDb { upsertSources(rows: ContentSourceInsert[]): Promise<{ id: string; kind: string; external_id: string }[]>; insertIdeas(rows: ContentIdeaInsert[]): Promise<number>; }`
  - `ingestPayload(db: IngestDb, payload: IngestPayload, userId: string, newId?: () => string): Promise<{ sources: number; ideas: number }>`
  - `supabaseIngestDb(client, userId: string)` returning `IngestDb`.

- [ ] **Step 1: Write the failing auth test**

`src/features/content/data/api-auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAuthorized } from "./api-auth";

const req = (auth?: string) =>
  new Request("http://x/api/content/ingest", { headers: auth ? { authorization: auth } : {} });

describe("isAuthorized", () => {
  it("accepts the exact bearer token", () => {
    expect(isAuthorized(req("Bearer s3cret"), "s3cret")).toBe(true);
  });
  it("rejects a wrong token, a missing header, and a non-bearer scheme", () => {
    expect(isAuthorized(req("Bearer nope"), "s3cret")).toBe(false);
    expect(isAuthorized(req(), "s3cret")).toBe(false);
    expect(isAuthorized(req("Basic s3cret"), "s3cret")).toBe(false);
  });
  it("rejects everything when the secret is unset or empty", () => {
    expect(isAuthorized(req("Bearer "), "")).toBe(false);
    expect(isAuthorized(req("Bearer x"), undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/features/content/data/api-auth.test.ts`
Expected: FAIL, cannot resolve `./api-auth`.

- [ ] **Step 3: Write api-auth**

`src/features/content/data/api-auth.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

/**
 * Bearer check for the two routine endpoints. Constant-time compare so the
 * token cannot be guessed byte by byte. An unset secret authorizes nobody.
 */
export function isAuthorized(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const want = Buffer.from(secret);
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}
```

- [ ] **Step 4: Run the auth test to verify it passes**

Run: `pnpm vitest run src/features/content/data/api-auth.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing ingest test**

`src/features/content/data/ingest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ingestSchema } from "@/features/content/engine/schema";
import { ingestPayload, type IngestDb } from "./ingest";
import type { ContentIdeaInsert, ContentSourceInsert } from "@/shared/supabase/database.types";

const example = ingestSchema.parse(JSON.parse(readFileSync("routines/examples/daily-ingest.json", "utf8")));

function fakeDb() {
  const sources: ContentSourceInsert[] = [];
  const ideas: ContentIdeaInsert[] = [];
  const db: IngestDb = {
    async upsertSources(rows) {
      sources.push(...rows);
      return rows.map((r, i) => ({ id: `src-${i}`, kind: r.kind, external_id: r.external_id }));
    },
    async insertIdeas(rows) {
      ideas.push(...rows);
      return rows.length;
    },
  };
  return { db, sources, ideas };
}

describe("ingestPayload", () => {
  it("writes sources first and stamps the owner on every row", async () => {
    const { db, sources, ideas } = fakeDb();
    const result = await ingestPayload(db, example, "owner-1");
    expect(result).toEqual({ sources: 2, ideas: 2 });
    expect(sources.every((s) => s.user_id === "owner-1")).toBe(true);
    expect(ideas.every((i) => i.user_id === "owner-1")).toBe(true);
  });

  it("resolves each idea's source_ref to the upserted source id", async () => {
    const { db, ideas } = fakeDb();
    await ingestPayload(db, example, "owner-1");
    expect(ideas[0].source_id).toBe("src-0");
    expect(ideas[1].source_id).toBe("src-0");
  });

  it("maps a shared chain_key to one chain_id per batch", async () => {
    const { db, ideas } = fakeDb();
    let n = 0;
    await ingestPayload(db, example, "owner-1", () => `chain-${++n}`);
    expect(ideas[0].chain_id).toBe("chain-1");
    expect(ideas[1].chain_id).toBe("chain-1");
  });

  it("leaves chain_id null when no chain_key is given", async () => {
    const { db, ideas } = fakeDb();
    const noChain = structuredClone(example);
    delete noChain.ideas[0].chain_key;
    delete noChain.ideas[1].chain_key;
    await ingestPayload(db, noChain, "owner-1");
    expect(ideas[0].chain_id).toBeNull();
  });

  it("stores ideas as inbox with the routine's batch_date and score", async () => {
    const { db, ideas } = fakeDb();
    await ingestPayload(db, example, "owner-1");
    expect(ideas[0].status).toBe("inbox");
    expect(ideas[0].batch_date).toBe("2026-09-17");
    expect(ideas[0].score).toBe(0.82);
  });

  it("stores a hook-backlog newsletter idea with a null source", async () => {
    const { db, ideas } = fakeDb();
    const backlog = structuredClone(example);
    backlog.ideas[0].source_ref = null;
    backlog.ideas[0].format = "newsletter";
    backlog.ideas[0].from_hook_backlog = true;
    await ingestPayload(db, backlog, "owner-1");
    expect(ideas[0].source_id).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/features/content/data/ingest.test.ts`
Expected: FAIL, cannot resolve `./ingest`.

- [ ] **Step 7: Write ingest.ts**

`src/features/content/data/ingest.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { IngestPayload } from "@/features/content/engine/schema";
import type { ContentIdeaInsert, ContentSourceInsert, Json } from "@/shared/supabase/database.types";

/**
 * The two writes the ingest endpoint needs, as an interface so the mapping
 * logic is tested against a fake and the Supabase adapter stays a few lines.
 *
 * upsertSources must return one row per input, in any order, with the id the
 * database holds for (kind, external_id): existing rows keep their id and
 * their status, because a source Miguel already allowed must not be reset to
 * pending by tomorrow's routine re-sending it.
 */
export interface IngestDb {
  upsertSources(
    rows: ContentSourceInsert[]
  ): Promise<{ id: string; kind: string; external_id: string }[]>;
  insertIdeas(rows: ContentIdeaInsert[]): Promise<number>;
}

export async function ingestPayload(
  db: IngestDb,
  payload: IngestPayload,
  userId: string,
  newId: () => string = randomUUID
): Promise<{ sources: number; ideas: number }> {
  const sourceRows: ContentSourceInsert[] = payload.sources.map((s) => ({
    user_id: userId,
    kind: s.kind,
    external_id: s.external_id,
    title: s.title,
    url: s.url ?? null,
    occurred_at: s.occurred_at ?? null,
    status: s.status,
    meta: (s.meta ?? {}) as unknown as Json,
  }));

  const written = sourceRows.length > 0 ? await db.upsertSources(sourceRows) : [];
  const idByRef = new Map(written.map((w) => [`${w.kind}:${w.external_id}`, w.id]));

  const chainIds = new Map<string, string>();
  const chainIdFor = (key: string | undefined) => {
    if (!key) return null;
    if (!chainIds.has(key)) chainIds.set(key, newId());
    return chainIds.get(key)!;
  };

  const ideaRows: ContentIdeaInsert[] = payload.ideas.map((i) => {
    const sourceId = i.source_ref
      ? idByRef.get(`${i.source_ref.kind}:${i.source_ref.external_id}`) ?? null
      : null;
    if (i.source_ref && sourceId === null) {
      // The schema already guarantees the ref is in the payload; this guards
      // an adapter that dropped a row.
      throw new Error(`Unresolved source_ref ${i.source_ref.kind}:${i.source_ref.external_id}`);
    }
    return {
      user_id: userId,
      source_id: sourceId,
      format: i.format,
      title: i.title,
      hook: i.hook,
      hook_alt: i.hook_alt ?? null,
      belief_attacked: i.belief_attacked,
      value_to_listener: i.value_to_listener,
      why_it_stops: i.why_it_stops,
      outline: i.outline as unknown as Json,
      quote: i.quote,
      quote_ref: i.quote_ref,
      pillar: i.pillar,
      hook_type: i.hook_type,
      chain_id: chainIdFor(i.chain_key),
      score: i.score,
      batch_date: i.batch_date,
      status: "inbox",
    };
  });

  const ideas = ideaRows.length > 0 ? await db.insertIdeas(ideaRows) : 0;
  return { sources: written.length, ideas };
}
```

- [ ] **Step 8: Run the ingest test to verify it passes**

Run: `pnpm vitest run src/features/content/data/ingest.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 9: Write the Supabase adapter and the route**

`src/features/content/data/supabase-db.ts`:

```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import type { IngestDb } from "./ingest";

type Client = SupabaseClient<Database>;

/**
 * IngestDb over a service-role client. Sources are insert-ignored on the
 * (user_id, kind, external_id) key so an existing row keeps its status, then
 * every key is read back to get ids for new and existing rows alike.
 */
export function supabaseIngestDb(client: Client, userId: string): IngestDb {
  return {
    async upsertSources(rows) {
      const { error } = await client
        .from("content_sources")
        .upsert(rows, { onConflict: "user_id,kind,external_id", ignoreDuplicates: true });
      if (error) throw new Error(`content_sources upsert: ${error.message}`);

      const kinds = Array.from(new Set(rows.map((r) => r.kind)));
      const ids = rows.map((r) => r.external_id);
      const { data, error: readError } = await client
        .from("content_sources")
        .select("id, kind, external_id")
        .eq("user_id", userId)
        .in("kind", kinds)
        .in("external_id", ids);
      if (readError) throw new Error(`content_sources read: ${readError.message}`);
      const wanted = new Set(rows.map((r) => `${r.kind}:${r.external_id}`));
      return (data ?? []).filter((d) => wanted.has(`${d.kind}:${d.external_id}`));
    },
    async insertIdeas(rows) {
      const { error, count } = await client
        .from("content_ideas")
        .insert(rows, { count: "exact" });
      if (error) throw new Error(`content_ideas insert: ${error.message}`);
      return count ?? rows.length;
    },
  };
}
```

`src/app/api/content/ingest/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { isAuthorized } from "@/features/content/data/api-auth";
import { ingestSchema } from "@/features/content/engine/schema";
import { ingestPayload } from "@/features/content/data/ingest";
import { supabaseIngestDb } from "@/features/content/data/supabase-db";

export const dynamic = "force-dynamic";

// The routines' write path. Bearer-protected, validated whole, written whole.
export async function POST(req: Request) {
  if (!isAuthorized(req, process.env.CONTENT_ENGINE_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owner = process.env.CONTENT_OWNER_USER_ID;
  if (!owner) {
    return NextResponse.json({ error: "CONTENT_OWNER_USER_ID is not set" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body is not JSON" }, { status: 400 });
  }
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const client = createAdminClient();
    const result = await ingestPayload(supabaseIngestDb(client, owner), parsed.data, owner);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("content ingest failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 10: Typecheck, full test run**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/features/content/data/api-auth.ts src/features/content/data/api-auth.test.ts src/features/content/data/ingest.ts src/features/content/data/ingest.test.ts src/features/content/data/supabase-db.ts src/app/api/content/ingest/route.ts
git commit -m "feat(content): bearer-protected ingest endpoint with tested payload mapping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The context endpoint

**Files:**
- Create: `src/features/content/engine/runs.ts`
- Create: `src/features/content/engine/runs.test.ts`
- Create: `src/features/content/data/context.ts`
- Create: `src/features/content/data/context.test.ts`
- Modify: `src/features/content/data/supabase-db.ts`
- Create: `src/app/api/content/context/route.ts`

**Interfaces:**
- Produces:
  - `lastRunByKind(rows: { kind: string; created_at: string }[]): Record<string, string>`
  - `interface ContextDb { tasteRules(): Promise<{ rule: string; evidence_count: number }[]>; feedbackSince(iso: string): Promise<{ format: string; title: string; hook: string; status: string; feedback_reason: string | null }[]>; queueDepth(): Promise<Record<Format, number>>; ideaTitlesSince(iso: string): Promise<string[]>; postedTitles(): Promise<string[]>; sourceRules(): Promise<{ kind: string; field: string; pattern: string }[]>; sourceRuns(): Promise<{ kind: string; created_at: string }[]>; voiceSummary(): Promise<string | null>; }`
  - `buildContext(db: ContextDb, now: Date): Promise<ContentContext>` where `ContentContext = { generated_at: string; taste_rules: ...; recent_feedback: ...; queue_depth: Record<Format, number>; known_titles: string[]; source_rules: ...; last_run_by_kind: Record<string, string>; voice_summary: string | null }`
  - `supabaseContextDb(client, userId): ContextDb`

- [ ] **Step 1: Write the failing runs test**

`src/features/content/engine/runs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lastRunByKind } from "./runs";

describe("lastRunByKind", () => {
  it("keeps the newest created_at per kind", () => {
    const out = lastRunByKind([
      { kind: "granola", created_at: "2026-09-15T10:00:00Z" },
      { kind: "granola", created_at: "2026-09-17T10:00:00Z" },
      { kind: "plaud", created_at: "2026-09-16T10:00:00Z" },
    ]);
    expect(out).toEqual({ granola: "2026-09-17T10:00:00Z", plaud: "2026-09-16T10:00:00Z" });
  });
  it("is empty for no rows", () => {
    expect(lastRunByKind([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/features/content/engine/runs.test.ts`
Expected: FAIL, cannot resolve `./runs`.

- [ ] **Step 3: Write runs.ts**

`src/features/content/engine/runs.ts`:

```ts
/**
 * "When did each source kind last get written?" derived from the sources
 * table, so there is no runs table to keep in sync. The routine uses this to
 * pick its "since" window; the Sources page shows it as the mined log.
 */
export function lastRunByKind(rows: { kind: string; created_at: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!out[r.kind] || r.created_at > out[r.kind]) out[r.kind] = r.created_at;
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/features/content/engine/runs.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing context test**

`src/features/content/data/context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildContext, type ContextDb } from "./context";

function fakeDb(overrides: Partial<ContextDb> = {}): ContextDb {
  return {
    tasteRules: async () => [{ rule: "No episode numbering", evidence_count: 4 }],
    feedbackSince: async () => [
      { format: "reel", title: "t", hook: "h", status: "rejected", feedback_reason: "too abstract" },
    ],
    queueDepth: async () => ({ reel: 3, youtube: 1, newsletter: 0, story: 2, x: 0 }),
    ideaTitlesSince: async () => ["A W-2 is a runway, not a cage"],
    postedTitles: async () => ["Buy term and invest the difference"],
    sourceRules: async () => [{ kind: "allow", field: "title", pattern: "amplifica" }],
    sourceRuns: async () => [{ kind: "granola", created_at: "2026-09-17T11:00:00Z" }],
    voiceSummary: async () => null,
    ...overrides,
  };
}

describe("buildContext", () => {
  const now = new Date("2026-09-17T12:00:00Z");

  it("asks for 14 days of feedback and 90 days of titles", async () => {
    const seen: string[] = [];
    const db = fakeDb({
      feedbackSince: async (iso) => {
        seen.push(`feedback:${iso}`);
        return [];
      },
      ideaTitlesSince: async (iso) => {
        seen.push(`titles:${iso}`);
        return [];
      },
    });
    await buildContext(db, now);
    expect(seen).toContain("feedback:2026-09-03T12:00:00.000Z");
    expect(seen).toContain("titles:2026-06-19T12:00:00.000Z");
  });

  it("merges idea titles and posted titles into one dedupe list", async () => {
    const ctx = await buildContext(fakeDb(), now);
    expect(ctx.known_titles).toEqual([
      "A W-2 is a runway, not a cage",
      "Buy term and invest the difference",
    ]);
  });

  it("carries rules, feedback, depth, source rules, runs, and voice through", async () => {
    const ctx = await buildContext(fakeDb(), now);
    expect(ctx.generated_at).toBe("2026-09-17T12:00:00.000Z");
    expect(ctx.taste_rules[0].rule).toBe("No episode numbering");
    expect(ctx.recent_feedback[0].feedback_reason).toBe("too abstract");
    expect(ctx.queue_depth.reel).toBe(3);
    expect(ctx.source_rules[0].pattern).toBe("amplifica");
    expect(ctx.last_run_by_kind.granola).toBe("2026-09-17T11:00:00Z");
    expect(ctx.voice_summary).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/features/content/data/context.test.ts`
Expected: FAIL, cannot resolve `./context`.

- [ ] **Step 7: Write context.ts**

`src/features/content/data/context.ts`:

```ts
import type { Format } from "@/features/content/engine/types";
import { lastRunByKind } from "@/features/content/engine/runs";

/**
 * What a routine needs to know before it generates: what Miguel likes, what he
 * rejected lately and why, how full each queue is, what already exists so it
 * is not proposed twice, which meetings it may read, and when it last ran.
 */
export interface ContextDb {
  tasteRules(): Promise<{ rule: string; evidence_count: number }[]>;
  feedbackSince(iso: string): Promise<
    { format: string; title: string; hook: string; status: string; feedback_reason: string | null }[]
  >;
  queueDepth(): Promise<Record<Format, number>>;
  ideaTitlesSince(iso: string): Promise<string[]>;
  postedTitles(): Promise<string[]>;
  sourceRules(): Promise<{ kind: string; field: string; pattern: string }[]>;
  sourceRuns(): Promise<{ kind: string; created_at: string }[]>;
  voiceSummary(): Promise<string | null>;
}

export type ContentContext = {
  generated_at: string;
  taste_rules: { rule: string; evidence_count: number }[];
  recent_feedback: { format: string; title: string; hook: string; status: string; feedback_reason: string | null }[];
  queue_depth: Record<Format, number>;
  known_titles: string[];
  source_rules: { kind: string; field: string; pattern: string }[];
  last_run_by_kind: Record<string, string>;
  voice_summary: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildContext(db: ContextDb, now: Date): Promise<ContentContext> {
  const since = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const [taste_rules, recent_feedback, queue_depth, ideaTitles, postedTitles, source_rules, runs, voice_summary] =
    await Promise.all([
      db.tasteRules(),
      db.feedbackSince(since(14)),
      db.queueDepth(),
      db.ideaTitlesSince(since(90)),
      db.postedTitles(),
      db.sourceRules(),
      db.sourceRuns(),
      db.voiceSummary(),
    ]);
  return {
    generated_at: now.toISOString(),
    taste_rules,
    recent_feedback,
    queue_depth,
    known_titles: Array.from(new Set([...ideaTitles, ...postedTitles])),
    source_rules,
    last_run_by_kind: lastRunByKind(runs),
    voice_summary,
  };
}
```

- [ ] **Step 8: Run the context test to verify it passes**

Run: `pnpm vitest run src/features/content/data/context.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Add the Supabase adapter and the route**

Append to `src/features/content/data/supabase-db.ts`:

```ts
import { FORMATS, type Format } from "@/features/content/engine/types";
import type { ContextDb } from "./context";

export function supabaseContextDb(client: Client, userId: string): ContextDb {
  const fail = (what: string, message: string) => new Error(`${what}: ${message}`);
  return {
    async tasteRules() {
      const { data, error } = await client
        .from("content_taste_rules")
        .select("rule, evidence_count")
        .eq("user_id", userId)
        .eq("active", true)
        .order("evidence_count", { ascending: false });
      if (error) throw fail("taste rules", error.message);
      return data ?? [];
    },
    async feedbackSince(iso) {
      const { data, error } = await client
        .from("content_ideas")
        .select("format, title, hook, status, feedback_reason")
        .eq("user_id", userId)
        .in("status", ["queued", "rejected", "posted"])
        .gte("feedback_at", iso)
        .order("feedback_at", { ascending: false });
      if (error) throw fail("feedback", error.message);
      return data ?? [];
    },
    async queueDepth() {
      const { data, error } = await client
        .from("content_ideas")
        .select("format")
        .eq("user_id", userId)
        .eq("status", "queued");
      if (error) throw fail("queue depth", error.message);
      const depth = Object.fromEntries(FORMATS.map((f) => [f, 0])) as Record<Format, number>;
      for (const row of data ?? []) depth[row.format] += 1;
      return depth;
    },
    async ideaTitlesSince(iso) {
      const { data, error } = await client
        .from("content_ideas")
        .select("title")
        .eq("user_id", userId)
        .in("status", ["inbox", "queued", "posted"])
        .gte("created_at", iso);
      if (error) throw fail("idea titles", error.message);
      return (data ?? []).map((d) => d.title);
    },
    async postedTitles() {
      const { data, error } = await client
        .from("content_posts")
        .select("hook_used, caption")
        .eq("user_id", userId);
      if (error) throw fail("posted titles", error.message);
      return (data ?? []).map((d) => d.hook_used || d.caption).filter(Boolean);
    },
    async sourceRules() {
      const { data, error } = await client
        .from("content_source_rules")
        .select("kind, field, pattern")
        .eq("user_id", userId);
      if (error) throw fail("source rules", error.message);
      return data ?? [];
    },
    async sourceRuns() {
      const { data, error } = await client
        .from("content_sources")
        .select("kind, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw fail("source runs", error.message);
      return data ?? [];
    },
    async voiceSummary() {
      const { data, error } = await client
        .from("content_voice")
        .select("profile_md")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw fail("voice", error.message);
      return data?.profile_md ? data.profile_md.slice(0, 2000) : null;
    },
  };
}
```

Note: the `import` lines go at the top of the file with the existing imports, not mid-file.

`src/app/api/content/context/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { isAuthorized } from "@/features/content/data/api-auth";
import { buildContext } from "@/features/content/data/context";
import { supabaseContextDb } from "@/features/content/data/supabase-db";

export const dynamic = "force-dynamic";

// The routines' read path: taste, feedback, queue depth, dedupe titles,
// source rules, last-run times.
export async function GET(req: Request) {
  if (!isAuthorized(req, process.env.CONTENT_ENGINE_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owner = process.env.CONTENT_OWNER_USER_ID;
  if (!owner) {
    return NextResponse.json({ error: "CONTENT_OWNER_USER_ID is not set" }, { status: 500 });
  }
  try {
    const ctx = await buildContext(supabaseContextDb(createAdminClient(), owner), new Date());
    return NextResponse.json(ctx);
  } catch (e) {
    console.error("content context failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 10: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/features/content/engine/runs.ts src/features/content/engine/runs.test.ts src/features/content/data/context.ts src/features/content/data/context.test.ts src/features/content/data/supabase-db.ts src/app/api/content/context/route.ts
git commit -m "feat(content): context endpoint the routines read before generating

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Queue and post helpers, then the Server Actions

**Files:**
- Create: `src/features/content/engine/queue.ts`
- Create: `src/features/content/engine/queue.test.ts`
- Create: `src/features/content/engine/posts.ts`
- Create: `src/features/content/engine/posts.test.ts`
- Create: `src/features/content/data/actions.ts`

**Interfaces:**
- Produces:
  - `nextRank(ranks: (number | null)[]): number`
  - `neighborToSwap(ordered: { id: string; queue_rank: number | null }[], id: string, direction: "up" | "down"): { a: { id: string; rank: number }; b: { id: string; rank: number } } | null`
  - `platformFromUrl(url: string): Platform | null`
  - `externalIdFromUrl(url: string, platform: Platform): string`
  - Server Actions (`(formData: FormData) => Promise<void>`): `likeIdea`, `passIdea`, `archiveIdea`, `moveIdea`, `allowSource`, `denySource`, `addSourceRule`, `deleteSourceRule`. `markPosted` returns `Promise<{ error: string | null }>` because Next.js replaces a thrown server-action message with a generic one in production, and the URL error must reach the user.

- [ ] **Step 1: Write the failing queue test**

`src/features/content/engine/queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextRank, neighborToSwap } from "./queue";

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
```

- [ ] **Step 2: Write the failing posts test**

`src/features/content/engine/posts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { externalIdFromUrl, platformFromUrl } from "./posts";

describe("platformFromUrl", () => {
  it("recognizes the four platforms", () => {
    expect(platformFromUrl("https://www.instagram.com/reel/C9abc123/")).toBe("instagram");
    expect(platformFromUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(platformFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(platformFromUrl("https://newsletter.amplificawealth.com/p/net-worth-is-a-vanity-metric")).toBe("beehiiv");
    expect(platformFromUrl("https://x.com/amplifica/status/1234567890")).toBe("x");
    expect(platformFromUrl("https://twitter.com/amplifica/status/1234567890")).toBe("x");
  });
  it("is null for anything else or an unparsable string", () => {
    expect(platformFromUrl("https://example.com/post")).toBeNull();
    expect(platformFromUrl("not a url")).toBeNull();
  });
});

describe("externalIdFromUrl", () => {
  it("takes the shortcode, video id, slug, or status id", () => {
    expect(externalIdFromUrl("https://www.instagram.com/reel/C9abc123/", "instagram")).toBe("C9abc123");
    expect(externalIdFromUrl("https://www.instagram.com/p/C9abc123/?igsh=xyz", "instagram")).toBe("C9abc123");
    expect(externalIdFromUrl("https://youtu.be/dQw4w9WgXcQ", "youtube")).toBe("dQw4w9WgXcQ");
    expect(externalIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5", "youtube")).toBe("dQw4w9WgXcQ");
    expect(externalIdFromUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube")).toBe("dQw4w9WgXcQ");
    expect(externalIdFromUrl("https://newsletter.amplificawealth.com/p/net-worth-is-a-vanity-metric", "beehiiv")).toBe("net-worth-is-a-vanity-metric");
    expect(externalIdFromUrl("https://x.com/amplifica/status/1234567890", "x")).toBe("1234567890");
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm vitest run src/features/content/engine/queue.test.ts src/features/content/engine/posts.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write queue.ts and posts.ts**

`src/features/content/engine/queue.ts`:

```ts
/** The rank a newly queued idea takes: the bottom of its format's queue. */
export function nextRank(ranks: (number | null)[]): number {
  let max = 0;
  for (const r of ranks) if (r !== null && r > max) max = r;
  return max + 1;
}

/**
 * For an Up or Down press: which two rows swap ranks. `ordered` is the
 * format's queue in display order. Ranks may be null on rows queued before
 * ranking existed, so the new ranks come from positions, which also heals
 * gaps as the user reorders.
 */
export function neighborToSwap(
  ordered: { id: string; queue_rank: number | null }[],
  id: string,
  direction: "up" | "down"
): { a: { id: string; rank: number }; b: { id: string; rank: number } } | null {
  const i = ordered.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return null;
  return {
    a: { id: ordered[i].id, rank: j + 1 },
    b: { id: ordered[j].id, rank: i + 1 },
  };
}
```

`src/features/content/engine/posts.ts`:

```ts
import type { Platform } from "./types";

/** Which platform a pasted post URL belongs to, or null when it is none of ours. */
export function platformFromUrl(url: string): Platform | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host === "instagram.com") return "instagram";
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return "youtube";
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host.endsWith("beehiiv.com") || host === "newsletter.amplificawealth.com") return "beehiiv";
  return null;
}

/**
 * The stable id a metric cron will also see for the same post, so a post
 * logged by hand and one discovered by the cron land on one row.
 */
export function externalIdFromUrl(url: string, platform: Platform): string {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  switch (platform) {
    case "instagram": {
      const i = parts.findIndex((p) => p === "reel" || p === "p" || p === "reels");
      return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[parts.length - 1] ?? "";
    }
    case "youtube": {
      const v = u.searchParams.get("v");
      if (v) return v;
      if (u.hostname.replace(/^www\./, "") === "youtu.be") return parts[0] ?? "";
      const i = parts.findIndex((p) => p === "shorts" || p === "live" || p === "embed");
      return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[parts.length - 1] ?? "";
    }
    case "x": {
      const i = parts.indexOf("status");
      return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[parts.length - 1] ?? "";
    }
    case "beehiiv":
      return parts[parts.length - 1] ?? "";
  }
}
```

- [ ] **Step 5: Run both tests to verify they pass**

Run: `pnpm vitest run src/features/content/engine/queue.test.ts src/features/content/engine/posts.test.ts`
Expected: PASS, 4 + 3 tests.

- [ ] **Step 6: Write the Server Actions**

`src/features/content/data/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireContentOwner } from "@/features/content/data/owner";
import { str } from "@/shared/forms";
import { nextRank, neighborToSwap } from "@/features/content/engine/queue";
import { externalIdFromUrl, platformFromUrl } from "@/features/content/engine/posts";
import { FORMATS, type Format } from "@/features/content/engine/types";

// Every action: owner gate, a query scoped to the user, revalidate the whole
// /content tree. Writes carry .eq("user_id", user.id) on top of RLS.

const revalidate = () => revalidatePath("/content", "layout");

export async function likeIdea(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;

  const { data: idea } = await supabase
    .from("content_ideas")
    .select("id, format")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!idea) return;

  const { data: queued } = await supabase
    .from("content_ideas")
    .select("queue_rank")
    .eq("user_id", user.id)
    .eq("format", idea.format)
    .eq("status", "queued");

  const { error } = await supabase
    .from("content_ideas")
    .update({
      status: "queued",
      queue_rank: nextRank((queued ?? []).map((q) => q.queue_rank)),
      feedback_at: new Date().toISOString(),
      feedback_reason: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function passIdea(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  const reason = str(formData, "reason").trim().slice(0, 500);
  if (!id) return;
  const { error } = await supabase
    .from("content_ideas")
    .update({ status: "rejected", feedback_reason: reason || null, feedback_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function archiveIdea(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("content_ideas")
    .update({ status: "archived", queue_rank: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function moveIdea(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  const direction = str(formData, "direction") === "up" ? "up" : "down";
  const format = str(formData, "format") as Format;
  if (!id || !FORMATS.includes(format)) return;

  const { data: ordered } = await supabase
    .from("content_ideas")
    .select("id, queue_rank")
    .eq("user_id", user.id)
    .eq("format", format)
    .eq("status", "queued")
    .order("queue_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const swap = neighborToSwap(ordered ?? [], id, direction);
  if (!swap) return;

  for (const row of [swap.a, swap.b]) {
    const { error } = await supabase
      .from("content_ideas")
      .update({ queue_rank: row.rank })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }
  revalidate();
}

// Returns the error instead of throwing: a thrown message is replaced with a
// generic one in production, and "that is not a post URL" must reach the user.
export async function markPosted(formData: FormData): Promise<{ error: string | null }> {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  const url = str(formData, "url").trim();
  const platform = platformFromUrl(url);
  if (!id || !platform) return { error: "Paste a post URL from Instagram, YouTube, beehiiv, or X." };

  const { data: idea } = await supabase
    .from("content_ideas")
    .select("id, format, hook, pillar, hook_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!idea) return { error: "Idea not found." };

  const { error: postError } = await supabase.from("content_posts").upsert(
    {
      user_id: user.id,
      idea_id: idea.id,
      platform,
      external_id: externalIdFromUrl(url, platform),
      url,
      format: idea.format,
      hook_used: idea.hook,
      pillar: idea.pillar,
      hook_type: idea.hook_type,
      posted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform,external_id" }
  );
  if (postError) return { error: postError.message };

  const { error } = await supabase
    .from("content_ideas")
    .update({ status: "posted", queue_rank: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}

async function setSourceStatus(formData: FormData, status: "allowed" | "denied") {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("content_sources")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function allowSource(formData: FormData) {
  await setSourceStatus(formData, "allowed");
}

export async function denySource(formData: FormData) {
  await setSourceStatus(formData, "denied");
}

export async function addSourceRule(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const kind = str(formData, "kind") === "deny" ? "deny" : "allow";
  const field = str(formData, "field") === "participant" ? "participant" : "title";
  const pattern = str(formData, "pattern").trim().slice(0, 200);
  if (!pattern) return;
  const { error } = await supabase
    .from("content_source_rules")
    .insert({ user_id: user.id, kind, field, pattern });
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteSourceRule(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("content_source_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}
```

- [ ] **Step 7: Add the actions file to the privacy test's file list**

In `src/app/content-route.test.ts`, change the `files` array in the last test to:

```ts
    const files = [
      "src/app/(app)/content/page.tsx",
      "src/features/content/data/actions.ts",
    ];
```

- [ ] **Step 8: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/content/engine/queue.ts src/features/content/engine/queue.test.ts src/features/content/engine/posts.ts src/features/content/engine/posts.test.ts src/features/content/data/actions.ts src/app/content-route.test.ts
git commit -m "feat(content): server actions for feedback, queue order, posting, sources

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The Inbox

**Files:**
- Create: `src/features/content/ui/FormatBadge.tsx`
- Create: `src/features/content/ui/ContentTabs.tsx`
- Create: `src/features/content/ui/IdeaCard.tsx`
- Create: `src/features/content/ui/IdeaCard.test.tsx`
- Create: `src/features/content/ui/InboxList.tsx`
- Create: `src/features/content/ui/PendingSourcesStrip.tsx`
- Modify: `src/app/(app)/content/page.tsx` (replace the placeholder)

**Interfaces:**
- Consumes: `likeIdea`, `passIdea`, `allowSource`, `denySource` from Task 6; `ContentIdea`, `ContentSource` from Task 1; `FORMAT_LABEL` from Task 2.
- Produces: `IdeaCardProps = { idea: ContentIdea; sourceUrl: string | null; siblings: { id: string; format: Format }[]; focused?: boolean; onLike?: () => void; onPassOpen?: () => void }`; `InboxList({ ideas, sourceUrls, siblingsById })`.

- [ ] **Step 1: Write the small shared pieces**

`src/features/content/ui/FormatBadge.tsx`:

```tsx
import clsx from "clsx";
import { FORMAT_LABEL, type Format } from "@/features/content/engine/types";

const TONE: Record<Format, string> = {
  reel: "bg-purple/10 text-purple",
  youtube: "bg-red-500/10 text-red-600",
  newsletter: "bg-aqua/15 text-teal-700",
  story: "bg-amethyst/20 text-purple",
  x: "bg-ink/10 text-ink",
};

export default function FormatBadge({ format }: { format: Format }) {
  return (
    <span className={clsx("inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded", TONE[format])}>
      {FORMAT_LABEL[format]}
    </span>
  );
}
```

`src/features/content/ui/ContentTabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/content", label: "Inbox" },
  { href: "/content/queue", label: "Queues" },
  { href: "/content/sources", label: "Sources" },
];

// The pages under /content share one row of tabs. Performance, Week, and
// Taste are added by later PRs.
export default function ContentTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 mb-4 border-b border-edge">
      {TABS.map((t) => {
        const active = t.href === "/content" ? pathname === "/content" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "px-3 py-2 text-sm -mb-px border-b-2",
              active ? "border-purple text-purple font-medium" : "border-transparent text-sub hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Write the failing IdeaCard test**

`src/features/content/ui/IdeaCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import IdeaCard from "./IdeaCard";
import type { ContentIdea } from "@/shared/supabase/database.types";

vi.mock("@/features/content/data/actions", () => ({
  likeIdea: vi.fn(),
  passIdea: vi.fn(),
}));

const idea: ContentIdea = {
  id: "i1",
  user_id: "u1",
  source_id: "s1",
  format: "reel",
  title: "A W-2 is a runway, not a cage",
  hook: "I took a new W-2 job this month.",
  hook_alt: "The fastest way out of a paycheck is a bigger paycheck.",
  belief_attacked: "You have to quit to build FI",
  value_to_listener: "A rule for raises",
  why_it_stops: "Contradicts the freedom pitch",
  outline: [{ beat: "Offer letter on screen" }],
  quote: "every extra dollar goes to the machine",
  quote_ref: "Joe/Miguel 2026-09-17 ~00:12:40",
  pillar: "optionality",
  hook_type: "belief-attacking",
  chain_id: "c1",
  score: 0.82,
  batch_date: "2026-09-17",
  status: "inbox",
  queue_rank: null,
  feedback_reason: null,
  feedback_at: null,
  clickup_task_id: null,
  created_at: "2026-09-17T11:00:00Z",
  updated_at: "2026-09-17T11:00:00Z",
};

describe("IdeaCard", () => {
  it("shows the hook, the three why lines, the quote, and the source link", () => {
    render(
      <IdeaCard idea={idea} sourceUrl="https://notes.granola.ai/d/x" siblings={[{ id: "i2", format: "story" }]} />
    );
    expect(screen.getByText("I took a new W-2 job this month.")).toBeInTheDocument();
    expect(screen.getByText(/You have to quit to build FI/)).toBeInTheDocument();
    expect(screen.getByText(/A rule for raises/)).toBeInTheDocument();
    expect(screen.getByText(/Contradicts the freedom pitch/)).toBeInTheDocument();
    expect(screen.getByText(/every extra dollar goes to the machine/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Joe\/Miguel/ })).toHaveAttribute("href", "https://notes.granola.ai/d/x");
    expect(screen.getByText("Story")).toBeInTheDocument();
  });

  it("has Like and Pass buttons", () => {
    render(<IdeaCard idea={idea} sourceUrl={null} siblings={[]} />);
    expect(screen.getByRole("button", { name: /Like/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pass/ })).toBeInTheDocument();
  });
});
```

Also add a Vitest setup for jest-dom matchers if none exists. Check `vitest.config.ts`: it has no `setupFiles`. Create `src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

and add `setupFiles: ["./src/test-setup.ts"],` inside the `test` block of `vitest.config.ts`.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/features/content/ui/IdeaCard.test.tsx`
Expected: FAIL, cannot resolve `./IdeaCard`.

- [ ] **Step 4: Write IdeaCard**

`src/features/content/ui/IdeaCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { ContentIdea } from "@/shared/supabase/database.types";
import type { Format, OutlineBeat } from "@/features/content/engine/types";
import { likeIdea, passIdea } from "@/features/content/data/actions";
import FormatBadge from "./FormatBadge";

export type IdeaCardProps = {
  idea: ContentIdea;
  sourceUrl: string | null;
  siblings: { id: string; format: Format }[];
  focused?: boolean;
  /** When set, the card's own Pass button is not the only way in: the list
   *  can open the reason box from the keyboard. */
  passOpen?: boolean;
  onPassOpenChange?: (open: boolean) => void;
};

export default function IdeaCard({ idea, sourceUrl, siblings, focused, passOpen, onPassOpenChange }: IdeaCardProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = passOpen ?? localOpen;
  const setOpen = onPassOpenChange ?? setLocalOpen;
  const outline = (Array.isArray(idea.outline) ? idea.outline : []) as OutlineBeat[];

  return (
    <article
      data-idea-id={idea.id}
      className={clsx(
        "bg-card border rounded-lg p-4 mb-3",
        focused ? "border-purple ring-1 ring-purple" : "border-edge"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <FormatBadge format={idea.format} />
        {idea.pillar && <span className="text-[10px] text-sub uppercase tracking-wide">{idea.pillar}</span>}
        {idea.hook_type && <span className="text-[10px] text-sub">{idea.hook_type}</span>}
        <span className="ml-auto text-[10px] text-sub">score {idea.score.toFixed(2)}</span>
      </div>

      <Link href={`/content/ideas/${idea.id}`} className="block">
        <h3 className="font-display text-lg leading-snug mb-1">{idea.hook}</h3>
        <div className="text-xs text-sub mb-3">{idea.title}</div>
      </Link>

      <dl className="text-sm grid gap-1 mb-3">
        <div><dt className="inline text-sub">Attacks: </dt><dd className="inline">{idea.belief_attacked}</dd></div>
        <div><dt className="inline text-sub">Listener gets: </dt><dd className="inline">{idea.value_to_listener}</dd></div>
        <div><dt className="inline text-sub">Stops the scroll because: </dt><dd className="inline">{idea.why_it_stops}</dd></div>
      </dl>

      {outline.length > 0 && (
        <ol className="text-sm list-decimal pl-5 mb-3 text-ink/90">
          {outline.map((b, i) => (
            <li key={i}>{b.beat}{b.note ? <span className="text-sub"> ({b.note})</span> : null}</li>
          ))}
        </ol>
      )}

      {idea.quote && (
        <blockquote className="text-sm border-l-2 border-amethyst pl-3 text-sub italic mb-3">
          “{idea.quote}”
          {idea.quote_ref && (
            <span className="not-italic">
              {" "}
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-purple hover:underline">
                  {idea.quote_ref}
                </a>
              ) : (
                idea.quote_ref
              )}
            </span>
          )}
        </blockquote>
      )}

      {siblings.length > 0 && (
        <div className="flex items-center gap-1 mb-3 text-xs text-sub">
          Same recording:
          {siblings.map((s) => (
            <Link key={s.id} href={`/content/ideas/${s.id}`}>
              <FormatBadge format={s.format} />
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <form action={likeIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <button
            type="submit"
            className="bg-purple hover:bg-purple/90 text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1"
          >
            <ThumbsUp className="w-4 h-4" /> Like
          </button>
        </form>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm px-3 py-1.5 rounded text-sub hover:bg-edge inline-flex items-center gap-1"
          >
            <ThumbsDown className="w-4 h-4" /> Pass
          </button>
        ) : (
          <form action={passIdea} className="flex items-center gap-2 flex-1">
            <input type="hidden" name="id" value={idea.id} />
            <input
              name="reason"
              autoFocus
              placeholder="Why not? One line trains taste."
              className="flex-1 border border-edge rounded px-2 py-1.5 text-sm bg-card"
            />
            <button type="submit" className="text-sm px-3 py-1.5 rounded bg-edge hover:bg-edge/70">Pass</button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-sub hover:underline">Cancel</button>
          </form>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Run the IdeaCard test to verify it passes**

Run: `pnpm vitest run src/features/content/ui/IdeaCard.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Write InboxList and PendingSourcesStrip**

`src/features/content/ui/InboxList.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { ContentIdea } from "@/shared/supabase/database.types";
import type { Format } from "@/features/content/engine/types";
import { likeIdea } from "@/features/content/data/actions";
import IdeaCard from "./IdeaCard";

type Props = {
  ideas: ContentIdea[];
  sourceUrls: Record<string, string | null>;
  siblingsById: Record<string, { id: string; format: Format }[]>;
};

// J/K move focus, L likes the focused idea, X opens its Pass box. Keys are
// ignored while typing in an input so the reason box works.
export default function InboxList({ ideas, sourceUrls, siblingsById }: Props) {
  const [focus, setFocus] = useState(0);
  const [passOpenId, setPassOpenId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (ideas.length === 0) return;
      if (e.key === "j") setFocus((f) => Math.min(f + 1, ideas.length - 1));
      else if (e.key === "k") setFocus((f) => Math.max(f - 1, 0));
      else if (e.key === "l") {
        const fd = new FormData();
        fd.set("id", ideas[focus].id);
        void likeIdea(fd);
      } else if (e.key === "x") setPassOpenId(ideas[focus].id);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ideas, focus]);

  useEffect(() => {
    document.querySelector(`[data-idea-id="${ideas[focus]?.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus, ideas]);

  if (ideas.length === 0) {
    return <p className="text-sm text-sub">Inbox is clear. New ideas land here each morning.</p>;
  }

  return (
    <div>
      <p className="text-[11px] text-sub mb-2">J / K move · L like · X pass</p>
      {ideas.map((idea, i) => (
        <IdeaCard
          key={idea.id}
          idea={idea}
          sourceUrl={idea.source_id ? sourceUrls[idea.source_id] ?? null : null}
          siblings={siblingsById[idea.id] ?? []}
          focused={i === focus}
          passOpen={passOpenId === idea.id}
          onPassOpenChange={(open) => setPassOpenId(open ? idea.id : null)}
        />
      ))}
    </div>
  );
}
```

`src/features/content/ui/PendingSourcesStrip.tsx`:

```tsx
import type { ContentSource } from "@/shared/supabase/database.types";
import { allowSource, denySource } from "@/features/content/data/actions";

// Meetings the routine found but had no rule for. Nothing here has been read.
export default function PendingSourcesStrip({ sources }: { sources: ContentSource[] }) {
  if (sources.length === 0) return null;
  return (
    <section className="bg-amethyst/10 border border-amethyst/40 rounded-lg p-3 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-sub mb-2">
        {sources.length} recording{sources.length === 1 ? "" : "s"} waiting for a decision. None have been read.
      </div>
      <ul className="space-y-1">
        {sources.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span className="text-[10px] uppercase text-sub w-14">{s.kind}</span>
            <span className="flex-1 truncate">{s.title || s.external_id}</span>
            <form action={allowSource}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" className="text-xs text-purple hover:underline">Allow</button>
            </form>
            <form action={denySource}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" className="text-xs text-sub hover:underline">Deny</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 7: Replace the inbox page**

`src/app/(app)/content/page.tsx`:

```tsx
import { requireContentOwner } from "@/features/content/data/owner";
import ContentTabs from "@/features/content/ui/ContentTabs";
import InboxList from "@/features/content/ui/InboxList";
import PendingSourcesStrip from "@/features/content/ui/PendingSourcesStrip";
import type { Format } from "@/features/content/engine/types";

export default async function ContentInboxPage() {
  const { supabase, user } = await requireContentOwner();

  const [{ data: ideas }, { data: pending }] = await Promise.all([
    supabase
      .from("content_ideas")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "inbox")
      .order("batch_date", { ascending: false })
      .order("score", { ascending: false }),
    supabase
      .from("content_sources")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("occurred_at", { ascending: false }),
  ]);

  const list = ideas ?? [];
  const sourceIds = Array.from(new Set(list.map((i) => i.source_id).filter((s): s is string => Boolean(s))));
  const chainIds = Array.from(new Set(list.map((i) => i.chain_id).filter((c): c is string => Boolean(c))));

  const [{ data: sources }, { data: chainMates }] = await Promise.all([
    sourceIds.length
      ? supabase.from("content_sources").select("id, url").in("id", sourceIds)
      : Promise.resolve({ data: [] as { id: string; url: string | null }[] }),
    chainIds.length
      ? supabase.from("content_ideas").select("id, format, chain_id").in("chain_id", chainIds)
      : Promise.resolve({ data: [] as { id: string; format: Format; chain_id: string | null }[] }),
  ]);

  const sourceUrls = Object.fromEntries((sources ?? []).map((s) => [s.id, s.url]));
  const siblingsById: Record<string, { id: string; format: Format }[]> = {};
  for (const idea of list) {
    if (!idea.chain_id) continue;
    siblingsById[idea.id] = (chainMates ?? [])
      .filter((m) => m.chain_id === idea.chain_id && m.id !== idea.id)
      .map((m) => ({ id: m.id, format: m.format }));
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <PendingSourcesStrip sources={pending ?? []} />
      <InboxList ideas={list} sourceUrls={sourceUrls} siblingsById={siblingsById} />
    </div>
  );
}
```

- [ ] **Step 8: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts src/test-setup.ts src/features/content/ui "src/app/(app)/content/page.tsx"
git commit -m "feat(content): inbox with like, pass-with-reason, keyboard, pending sources

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Queues and the idea page

**Files:**
- Create: `src/features/content/ui/QueueCard.tsx`
- Create: `src/app/(app)/content/queue/page.tsx`
- Create: `src/app/(app)/content/ideas/[id]/page.tsx`
- Modify: `src/app/content-route.test.ts` (add the two pages to the file list)

**Interfaces:**
- Consumes: `moveIdea`, `markPosted`, `archiveIdea`, `likeIdea`, `passIdea` from Task 6; `FORMATS`, `FORMAT_LABEL` from Task 2.

- [ ] **Step 1: Add the two pages to the privacy test**

In `src/app/content-route.test.ts`, the `files` array becomes:

```ts
    const files = [
      "src/app/(app)/content/page.tsx",
      "src/app/(app)/content/queue/page.tsx",
      "src/app/(app)/content/ideas/[id]/page.tsx",
      "src/features/content/data/actions.ts",
    ];
```

Run: `pnpm vitest run src/app/content-route.test.ts`
Expected: FAIL, the two files do not exist.

- [ ] **Step 2: Write QueueCard**

`src/features/content/ui/QueueCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Archive, CheckCircle2 } from "lucide-react";
import type { ContentIdea } from "@/shared/supabase/database.types";
import { archiveIdea, markPosted, moveIdea } from "@/features/content/data/actions";
import FormatBadge from "./FormatBadge";

export default function QueueCard({ idea, position, total }: { idea: ContentIdea; position: number; total: number }) {
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <article className="bg-card border border-edge rounded-lg p-3 mb-2 flex gap-3">
      <div className="flex flex-col gap-1">
        <form action={moveIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <input type="hidden" name="format" value={idea.format} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" disabled={position === 0} aria-label="Move up" className="text-sub hover:text-ink disabled:opacity-30">
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
        <form action={moveIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <input type="hidden" name="format" value={idea.format} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" disabled={position === total - 1} aria-label="Move down" className="text-sub hover:text-ink disabled:opacity-30">
            <ArrowDown className="w-4 h-4" />
          </button>
        </form>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-sub w-5">{position + 1}.</span>
          <FormatBadge format={idea.format} />
          {idea.chain_id && <span className="text-[10px] text-sub">chained</span>}
        </div>
        <Link href={`/content/ideas/${idea.id}`} className="font-medium hover:underline block truncate">
          {idea.hook}
        </Link>
        <div className="text-xs text-sub truncate">{idea.title}</div>

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            disabled
            title="Drafting arrives in a later release"
            className="text-xs px-2 py-1 rounded border border-edge text-sub opacity-60 cursor-not-allowed"
          >
            Draft
          </button>
          {!posting ? (
            <button type="button" onClick={() => setPosting(true)} className="text-xs px-2 py-1 rounded border border-edge hover:bg-edge inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Mark posted
            </button>
          ) : (
            <form
              action={async (fd) => {
                const result = await markPosted(fd);
                if (result.error) setError(result.error);
                else {
                  setError(null);
                  setPosting(false);
                }
              }}
              className="flex items-center gap-1 flex-1"
            >
              <input type="hidden" name="id" value={idea.id} />
              <input name="url" autoFocus placeholder="Paste the post URL" className="flex-1 border border-edge rounded px-2 py-1 text-xs bg-card" />
              <button type="submit" className="text-xs px-2 py-1 rounded bg-purple text-white">Save</button>
              <button type="button" onClick={() => { setPosting(false); setError(null); }} className="text-xs text-sub hover:underline">Cancel</button>
            </form>
          )}
          <form action={archiveIdea} className="ml-auto">
            <input type="hidden" name="id" value={idea.id} />
            <button type="submit" aria-label="Archive" className="text-sub hover:text-ink">
              <Archive className="w-4 h-4" />
            </button>
          </form>
        </div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Write the queue page**

`src/app/(app)/content/queue/page.tsx`:

```tsx
import Link from "next/link";
import clsx from "clsx";
import { requireContentOwner } from "@/features/content/data/owner";
import ContentTabs from "@/features/content/ui/ContentTabs";
import QueueCard from "@/features/content/ui/QueueCard";
import { FORMATS, FORMAT_LABEL, type Format } from "@/features/content/engine/types";

export default async function ContentQueuePage({ searchParams }: { searchParams: { format?: string } }) {
  const { supabase, user } = await requireContentOwner();
  const format: Format = FORMATS.includes(searchParams.format as Format) ? (searchParams.format as Format) : "reel";

  const { data: queued } = await supabase
    .from("content_ideas")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "queued")
    .order("queue_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const all = queued ?? [];
  const counts = Object.fromEntries(FORMATS.map((f) => [f, all.filter((i) => i.format === f).length])) as Record<Format, number>;
  const list = all.filter((i) => i.format === format);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <div className="flex gap-1 mb-4">
        {FORMATS.map((f) => (
          <Link
            key={f}
            href={`/content/queue?format=${f}`}
            className={clsx(
              "text-sm px-3 py-1 rounded-full border",
              f === format ? "bg-purple text-white border-purple" : "border-edge text-sub hover:text-ink"
            )}
          >
            {FORMAT_LABEL[f]} <span className="opacity-70">{counts[f]}</span>
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-sub">Nothing queued for {FORMAT_LABEL[format]} yet. Like an idea in the Inbox to add one.</p>
      ) : (
        list.map((idea, i) => <QueueCard key={idea.id} idea={idea} position={i} total={list.length} />)
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the idea page**

`src/app/(app)/content/ideas/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContentOwner } from "@/features/content/data/owner";
import ContentTabs from "@/features/content/ui/ContentTabs";
import IdeaCard from "@/features/content/ui/IdeaCard";
import FormatBadge from "@/features/content/ui/FormatBadge";
import Card from "@/shared/ui/Card";
import { fmtDate } from "@/shared/format";
import type { Format } from "@/features/content/engine/types";

export default async function ContentIdeaPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireContentOwner();

  const { data: idea } = await supabase
    .from("content_ideas")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!idea) notFound();

  const [{ data: source }, { data: mates }, { data: post }] = await Promise.all([
    idea.source_id
      ? supabase.from("content_sources").select("*").eq("id", idea.source_id).maybeSingle()
      : Promise.resolve({ data: null }),
    idea.chain_id
      ? supabase.from("content_ideas").select("id, format, hook, status").eq("chain_id", idea.chain_id).neq("id", idea.id)
      : Promise.resolve({ data: [] as { id: string; format: Format; hook: string; status: string }[] }),
    supabase.from("content_posts").select("*").eq("idea_id", idea.id).maybeSingle(),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <Link href="/content" className="text-xs text-sub hover:underline">← Inbox</Link>

      <div className="mt-3">
        <IdeaCard
          idea={idea}
          sourceUrl={source?.url ?? null}
          siblings={(mates ?? []).map((m) => ({ id: m.id, format: m.format }))}
        />
      </div>

      <Card title="Status">
        <dl className="text-sm grid grid-cols-2 gap-2">
          <dt className="text-sub">Status</dt><dd>{idea.status}{idea.queue_rank ? ` (rank ${idea.queue_rank})` : ""}</dd>
          <dt className="text-sub">Batch</dt><dd>{idea.batch_date}</dd>
          {idea.feedback_reason && (<><dt className="text-sub">Pass reason</dt><dd>{idea.feedback_reason}</dd></>)}
          {idea.hook_alt && (<><dt className="text-sub">Trial hook</dt><dd>{idea.hook_alt}</dd></>)}
          {post && (
            <>
              <dt className="text-sub">Posted</dt>
              <dd>
                <a href={post.url} target="_blank" rel="noreferrer" className="text-purple hover:underline">{post.platform}</a>
                {" "}{fmtDate(post.posted_at)}
              </dd>
            </>
          )}
        </dl>
      </Card>

      {source && (
        <Card title="Source">
          <div className="text-sm flex items-center gap-2">
            <span className="text-[10px] uppercase text-sub">{source.kind}</span>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="text-purple hover:underline">{source.title || source.external_id}</a>
            ) : (
              <span>{source.title || source.external_id}</span>
            )}
            {source.occurred_at && <span className="text-sub text-xs">{fmtDate(source.occurred_at)}</span>}
          </div>
        </Card>
      )}

      {(mates ?? []).length > 0 && (
        <Card title="Same recording">
          <ul className="text-sm space-y-1">
            {(mates ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <FormatBadge format={m.format} />
                <Link href={`/content/ideas/${m.id}`} className="hover:underline truncate">{m.hook}</Link>
                <span className="text-xs text-sub ml-auto">{m.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
```

Note: `fmtDate` exists in `src/shared/format.ts` (used by the LoC page). If its signature takes a string, pass the ISO string as shown.

- [ ] **Step 5: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/content/ui/QueueCard.tsx "src/app/(app)/content/queue/page.tsx" "src/app/(app)/content/ideas/[id]/page.tsx" src/app/content-route.test.ts
git commit -m "feat(content): per-format queues with reorder and mark-posted; idea detail page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The Sources page

**Files:**
- Create: `src/app/(app)/content/sources/page.tsx`
- Modify: `src/app/content-route.test.ts` (add the page)

**Interfaces:**
- Consumes: `addSourceRule`, `deleteSourceRule`, `allowSource`, `denySource` from Task 6; `lastRunByKind` from Task 5; `PendingSourcesStrip` from Task 7.

- [ ] **Step 1: Add the page to the privacy test**

In `src/app/content-route.test.ts`, add `"src/app/(app)/content/sources/page.tsx",` to the `files` array. Run the test; expected FAIL on the missing file.

- [ ] **Step 2: Write the page**

`src/app/(app)/content/sources/page.tsx`:

```tsx
import { Trash2 } from "lucide-react";
import { requireContentOwner } from "@/features/content/data/owner";
import { addSourceRule, deleteSourceRule } from "@/features/content/data/actions";
import ContentTabs from "@/features/content/ui/ContentTabs";
import PendingSourcesStrip from "@/features/content/ui/PendingSourcesStrip";
import { lastRunByKind } from "@/features/content/engine/runs";
import { SOURCE_KINDS } from "@/features/content/engine/types";
import Card from "@/shared/ui/Card";
import { fmtDate } from "@/shared/format";

export default async function ContentSourcesPage() {
  const { supabase, user } = await requireContentOwner();

  const [{ data: rules }, { data: pending }, { data: recent }] = await Promise.all([
    supabase.from("content_source_rules").select("*").eq("user_id", user.id).order("kind").order("pattern"),
    supabase.from("content_sources").select("*").eq("user_id", user.id).eq("status", "pending").order("occurred_at", { ascending: false }),
    supabase.from("content_sources").select("id, kind, title, external_id, status, occurred_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
  ]);

  const lastRun = lastRunByKind(recent ?? []);
  const countByKind = Object.fromEntries(SOURCE_KINDS.map((k) => [k, (recent ?? []).filter((s) => s.kind === k).length]));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />

      <PendingSourcesStrip sources={pending ?? []} />

      <Card title="Who gets read">
        <p className="text-xs text-sub mb-3">
          Allow rules open a recording to the routine; deny rules keep it closed. A recording matching neither waits
          above until you decide. Client engagements belong on the deny list.
        </p>
        <form action={addSourceRule} className="flex flex-wrap items-end gap-2 mb-3">
          <select name="kind" className="border border-edge rounded px-2 py-1.5 text-sm bg-card">
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
          <select name="field" className="border border-edge rounded px-2 py-1.5 text-sm bg-card">
            <option value="title">title contains</option>
            <option value="participant">participant contains</option>
          </select>
          <input name="pattern" required placeholder="e.g. Amplifica" className="border border-edge rounded px-2 py-1.5 text-sm bg-card flex-1 min-w-40" />
          <button type="submit" className="bg-purple hover:bg-purple/90 text-white text-sm px-3 py-1.5 rounded">Add rule</button>
        </form>
        {(rules ?? []).length === 0 ? (
          <p className="text-sm text-sub">No rules yet. Until there are, every recording waits for a decision.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {(rules ?? []).map((r) => (
                <tr key={r.id} className="border-b border-edge">
                  <td className={r.kind === "allow" ? "text-teal-700 py-1" : "text-red-600 py-1"}>{r.kind}</td>
                  <td className="text-sub">{r.field} contains</td>
                  <td className="font-mono">{r.pattern}</td>
                  <td className="text-right">
                    <form action={deleteSourceRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" aria-label="Delete rule" className="text-sub hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Mined log">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
              <th className="py-2">Source</th><th>Rows (last 200)</th><th>Last written</th>
            </tr>
          </thead>
          <tbody>
            {SOURCE_KINDS.map((k) => (
              <tr key={k} className="border-b border-edge">
                <td className="py-1">{k}</td>
                <td>{countByKind[k]}</td>
                <td className="text-sub">{lastRun[k] ? fmtDate(lastRun[k]) : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Recent">
        <ul className="text-sm space-y-1">
          {(recent ?? []).slice(0, 40).map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-sub w-14">{s.kind}</span>
              <span className="flex-1 truncate">{s.title || s.external_id}</span>
              <span className="text-xs text-sub">{s.status}</span>
              <span className="text-xs text-sub">{s.occurred_at ? fmtDate(s.occurred_at) : ""}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/content/sources/page.tsx" src/app/content-route.test.ts
git commit -m "feat(content): sources page with allow/deny rules and the mined log

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Folder map, repo map, seed instructions, build

**Files:**
- Create: `src/features/content/CLAUDE.md`
- Modify: `CLAUDE.md` (repo root, the small-features table)
- Modify: `docs/PRODUCT-STATUS.md` (one line in the directory map, one row in the env vars line)

- [ ] **Step 1: Write the feature CLAUDE.md**

`src/features/content/CLAUDE.md`:

```markdown
# features/content — the content engine

Spec: `docs/superpowers/specs/2026-09-17-content-engine-design.md`. Owner-only:
every page and action opens with `requireContentOwner()` from `data/owner.ts`.

## Map

- `engine/` — pure, tested. `schema.ts` is the ingest contract the routines
  write against; `types.ts` mirrors migration 0008's check constraints.
- `data/` — `actions.ts` (Server Actions), `ingest.ts` and `context.ts` (endpoint
  logic behind an interface), `supabase-db.ts` (the adapter), `api-auth.ts`.
- `ui/` — one file per component. `IdeaCard` is used by the inbox and the idea page.
- Routes: `src/app/(app)/content/**` and `src/app/api/content/**`.

## Invariants

- Ingest is all-or-nothing: zod validates the whole body before any write.
- A source that already exists keeps its status on re-ingest (insert-ignore).
- An idea's provenance is mandatory except newsletter ideas flagged
  `from_hook_backlog`.
- Ranks are per format; `neighborToSwap` heals gaps from positions.

## Seeding by hand

With `CONTENT_ENGINE_SECRET` set and the app running:

```bash
curl -sS -X POST "$NEXT_PUBLIC_SITE_URL/api/content/ingest" \
  -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" \
  -H "Content-Type: application/json" \
  --data @routines/examples/daily-ingest.json
```

Then read the context a routine would see:

```bash
curl -sS "$NEXT_PUBLIC_SITE_URL/api/content/context" \
  -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" | jq .
```

## Applying the migration

Run `supabase/migrations/0008_content_engine.sql` in the Supabase SQL editor,
then set `CONTENT_OWNER_USER_ID` (from `auth.users`) and `CONTENT_ENGINE_SECRET`
in Vercel and `.env.local`.
```

- [ ] **Step 2: Add the feature to the repo map**

In the root `CLAUDE.md`, add a row to "The small features" table:

```markdown
| `content/` | Owner-only content engine: idea inbox, per-format queues, sources. Routines write through `api/content/ingest`. Spec in `docs/superpowers/specs/2026-09-17-content-engine-design.md`. |
```

In `docs/PRODUCT-STATUS.md`, in the directory map under `features/`, add:

```
    content/            # owner-only content engine (inbox, queues, sources) — see its CLAUDE.md
```

and extend the env var sentence in §2 with: `CONTENT_OWNER_USER_ID` + `CONTENT_ENGINE_SECRET` (content engine).

- [ ] **Step 3: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all three pass. The build must succeed with `CONTENT_OWNER_USER_ID` unset; the page is simply a 404 for everyone.

- [ ] **Step 4: Commit**

```bash
git add src/features/content/CLAUDE.md CLAUDE.md docs/PRODUCT-STATUS.md
git commit -m "docs(content): folder map, repo map row, seed instructions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual smoke test (owner does this, not the executor)**

1. Apply migration 0008 in Supabase.
2. Set the two env vars locally, `pnpm dev`, sign in as the owner. The sidebar shows Content.
3. POST the example payload with the curl from the feature CLAUDE.md. The inbox shows two ideas with a chain link; the pending strip shows the client meeting.
4. Press L on the first idea. It appears under Queues → Reel with rank 1. Press X on the second, type a reason, Pass.
5. On Queues, Mark posted with an Instagram URL. The idea page shows the post.
6. On Sources, add an allow rule "Amplifica" and deny the pending meeting.
7. GET the context endpoint. `recent_feedback` has the pass reason, `queue_depth.reel` is 0 after posting, `known_titles` has both titles.
