# amplifica v2 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the amplifica v2 MVP per `docs/superpowers/specs/2026-05-27-amplifica-prd.md` — a multi-user Next.js app on Supabase with two domain objects (AmortizedInvestment / Amplicon, LineOfCredit), personal settings, four pages (Dashboard, Amplicons, Lines of Credit, Settings), and email-password + magic-link auth.

**Architecture:** Next.js 14 App Router. Supabase (Postgres + Auth) for storage and identity. Server components by default, server actions for mutations. Pure-TS finance module (`src/lib/finance/`) for amortization + projections — unit-tested, no React/server dependencies. RLS-scoped tables ensure users only see their own data.

**Tech Stack:** Next.js 14, TypeScript (strict), Tailwind 3, Supabase (`@supabase/ssr` + `@supabase/supabase-js`), Recharts 2, lucide-react, Vitest 2 (finance tests only).

**Working directory:** `/Users/miguelgraf/Documents/GitHub/amplifica`
**Branch:** `feat/v2-prd` (already created off `main`)

**Files to salvage from `feat/amplifica-mvp` branch (use as references):**
- `src/engine/amortization.ts` → ports to `src/lib/finance/amortization.ts`
- `src/engine/dates.ts` → ports to `src/lib/finance/dates.ts`
- `src/ui/common/format.ts` → ports to `src/lib/format.ts`

The previous branch's scaffold (Vite, IndexedDB, Zustand, Dexie) is NOT salvaged. Fresh Next.js scaffold.

---

## File structure (after plan executes)

```
amplifica/
├── package.json                       (Next.js + Supabase deps)
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── .env.local                         (gitignored: Supabase URL + keys)
├── .env.example                       (template)
├── middleware.ts                      (Supabase auth refresh)
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql
├── src/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              (browser client)
│   │   │   ├── server.ts              (server/RSC + actions client)
│   │   │   ├── middleware.ts          (cookie refresh helper)
│   │   │   └── database.types.ts      (Postgres → TS types)
│   │   ├── finance/
│   │   │   ├── amortization.ts        (salvaged + extended)
│   │   │   ├── amortization.test.ts
│   │   │   ├── dates.ts               (salvaged)
│   │   │   ├── dates.test.ts
│   │   │   ├── projection.ts          (NEW: monthly cash-flow + NW series)
│   │   │   └── projection.test.ts
│   │   └── format.ts                  (currency: USD / kUSD / MUSD)
│   ├── components/
│   │   ├── Field.tsx
│   │   ├── NumberInput.tsx
│   │   ├── PercentInput.tsx
│   │   ├── Card.tsx
│   │   ├── Sidebar.tsx
│   │   └── InfoBox.tsx                (hover tooltip for PV note)
│   └── app/
│       ├── layout.tsx                 (root <html>)
│       ├── globals.css
│       ├── page.tsx                   (redirects to /dashboard or /login)
│       ├── login/page.tsx
│       ├── login/actions.ts           ("use server" auth actions)
│       ├── signup/page.tsx
│       ├── signup/actions.ts
│       ├── auth/callback/route.ts     (magic-link callback)
│       └── (app)/
│           ├── layout.tsx             (auth-gated layout: Sidebar + main)
│           ├── dashboard/page.tsx
│           ├── amplicons/page.tsx
│           ├── amplicons/actions.ts
│           ├── loc/page.tsx
│           ├── loc/actions.ts
│           ├── settings/page.tsx
│           └── settings/actions.ts
└── vitest.config.ts                   (finance tests only)
```

---

## Task 1: Next.js scaffold + Tailwind + Vitest

Stand up Next.js 14 App Router + TypeScript strict + Tailwind 3 + Vitest. Empty `/` route. No app logic yet.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `vitest.config.ts`
- Create: `src/lib/finance/__sanity.test.ts`

- [ ] **Step 1: package.json**

```json
{
  "name": "amplifica",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install deps**

```bash
cd /Users/miguelgraf/Documents/GitHub/amplifica
pnpm add next@14 react@18 react-dom@18 recharts@2 lucide-react clsx
pnpm add @supabase/ssr @supabase/supabase-js
pnpm add -D typescript@5 @types/react@18 @types/react-dom@18 @types/node tailwindcss@3 postcss autoprefixer eslint eslint-config-next vitest@2 @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

Expected: installs without errors. If pnpm not present, use `npm install` / `npm install --save-dev`.

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "jsx": "preserve",
    "incremental": true,
    "allowJs": false,
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: next.config.mjs**

```js
const nextConfig = {
  reactStrictMode: true,
};
export default nextConfig;
```

- [ ] **Step 5: tailwind.config.ts + postcss.config.js**

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1115",
        sub: "#6a6a72",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`postcss.config.js`:
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: src/app/globals.css + layout + page**

`src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
```

`src/app/layout.tsx`:
```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "amplifica",
  description: "Quiet systems for lasting wealth.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 text-ink">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <div className="p-8 text-lg">amplifica v2 scaffold OK</div>;
}
```

- [ ] **Step 7: vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
```

- [ ] **Step 8: Sanity test**

`src/lib/finance/__sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: .gitignore additions**

The repo already has a `.gitignore`. Append:

```
# Next.js
.next/
next-env.d.ts
*.tsbuildinfo

# Supabase
supabase/.branches
supabase/.temp
```

- [ ] **Step 10: Verify**

```bash
pnpm typecheck
pnpm test
pnpm dev
```

Expected: typecheck clean, sanity test passes, dev server runs at http://localhost:3000 showing "amplifica v2 scaffold OK". Stop the dev server.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 14 + TS strict + Tailwind + Vitest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Supabase client wiring + env config

Set up the three Supabase clients (browser, server, middleware) and the env config. No DB schema yet — that's Task 3.

**Files:**
- Create: `.env.example`, `.env.local`
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- Create: `middleware.ts` (Next.js root middleware)

- [ ] **Step 1: .env.example**

Create `.env.example` at repo root:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
```

- [ ] **Step 2: .env.local (developer must fill this)**

Create `.env.local` with the same shape as `.env.example`. Real values come from the user's Supabase project dashboard (Settings → API).

**Important:** If you are an implementer agent and don't have access to a real Supabase project, write placeholder values to `.env.local` and report DONE_WITH_CONCERNS noting that the user must populate before running. The remaining tasks (auth, CRUD, etc.) won't function until real credentials are filled in, but typecheck and build will pass.

Placeholder content for `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
```

- [ ] **Step 3: Browser client**

`src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Server client (RSC + server actions)**

`src/lib/supabase/server.ts`:
```ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Read-only context (RSC). Safe to ignore.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Read-only context (RSC). Safe to ignore.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Middleware client (cookie refresh)**

`src/lib/supabase/middleware.ts`:
```ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser();

  // Gate protected routes
  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/amplicons") ||
    path.startsWith("/loc") ||
    path.startsWith("/settings");
  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
```

- [ ] **Step 6: Next.js root middleware**

`middleware.ts` (at repo root):
```ts
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
```

- [ ] **Step 7: Verify**

```bash
pnpm typecheck
pnpm build
```

Both clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Supabase clients (browser/server/middleware) + auth route gating

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Initial DB migration — profiles, amplicons, locs + RLS

Write the SQL migration that defines the three tables and their RLS policies. Also: a trigger that auto-creates a `profiles` row on user signup.

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`
- Create: `src/lib/supabase/database.types.ts` (hand-written; can be regenerated via CLI later)

- [ ] **Step 1: Migration SQL**

`supabase/migrations/0001_initial_schema.sql`:
```sql
-- profiles: one-to-one with auth.users, stores Personal Settings
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  monthly_savings_contribution numeric(14, 2) not null default 0,
  net_worth_goal numeric(8, 4) not null default 0,
  monthly_cashflow_goal numeric(10, 4) not null default 0,
  external_net_worth numeric(8, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- amplicons: AmortizedInvestment records owned by the user
create table public.amplicons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  ai_type text not null default '',
  face_value numeric(14, 2) not null,
  term_months integer not null check (term_months > 0),
  interest_pct numeric(7, 6) not null check (interest_pct >= 0),
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index amplicons_user_id_idx on public.amplicons(user_id);

-- locs: LineOfCredit records owned by the user
create table public.locs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  loc_type text not null check (loc_type in ('HELOC', 'PLOC')),
  size numeric(14, 2) not null check (size >= 0),
  utilization numeric(14, 2) not null default 0 check (utilization >= 0),
  utilization_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locs_user_id_idx on public.locs(user_id);

-- Auto-update updated_at on modify
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger amplicons_touch_updated_at
  before update on public.amplicons
  for each row execute function public.touch_updated_at();

create trigger locs_touch_updated_at
  before update on public.locs
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.amplicons enable row level security;
alter table public.locs enable row level security;

-- profiles: each user can read/update only their own row
create policy "profiles: self select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: self update" on public.profiles
  for update using (auth.uid() = id);

-- amplicons: each user can CRUD only their own
create policy "amplicons: self select" on public.amplicons
  for select using (auth.uid() = user_id);
create policy "amplicons: self insert" on public.amplicons
  for insert with check (auth.uid() = user_id);
create policy "amplicons: self update" on public.amplicons
  for update using (auth.uid() = user_id);
create policy "amplicons: self delete" on public.amplicons
  for delete using (auth.uid() = user_id);

-- locs: each user can CRUD only their own
create policy "locs: self select" on public.locs
  for select using (auth.uid() = user_id);
create policy "locs: self insert" on public.locs
  for insert with check (auth.uid() = user_id);
create policy "locs: self update" on public.locs
  for update using (auth.uid() = user_id);
create policy "locs: self delete" on public.locs
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: TypeScript database types (hand-written)**

`src/lib/supabase/database.types.ts`:
```ts
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          monthly_savings_contribution: number;
          net_worth_goal: number;
          monthly_cashflow_goal: number;
          external_net_worth: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          monthly_savings_contribution?: number;
          net_worth_goal?: number;
          monthly_cashflow_goal?: number;
          external_net_worth?: number;
        };
        Update: {
          monthly_savings_contribution?: number;
          net_worth_goal?: number;
          monthly_cashflow_goal?: number;
          external_net_worth?: number;
        };
      };
      amplicons: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          ai_type: string;
          face_value: number;
          term_months: number;
          interest_pct: number;
          start_date: string; // ISO YYYY-MM-DD
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          ai_type?: string;
          face_value: number;
          term_months: number;
          interest_pct: number;
          start_date: string;
        };
        Update: {
          name?: string;
          ai_type?: string;
          face_value?: number;
          term_months?: number;
          interest_pct?: number;
          start_date?: string;
        };
      };
      locs: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          loc_type: "HELOC" | "PLOC";
          size: number;
          utilization: number;
          utilization_updated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          loc_type: "HELOC" | "PLOC";
          size: number;
          utilization?: number;
        };
        Update: {
          name?: string;
          loc_type?: "HELOC" | "PLOC";
          size?: number;
          utilization?: number;
          utilization_updated_at?: string;
        };
      };
    };
  };
};

export type Amplicon = Database["public"]["Tables"]["amplicons"]["Row"];
export type AmpliconInsert = Database["public"]["Tables"]["amplicons"]["Insert"];
export type AmpliconUpdate = Database["public"]["Tables"]["amplicons"]["Update"];
export type LoC = Database["public"]["Tables"]["locs"]["Row"];
export type LoCInsert = Database["public"]["Tables"]["locs"]["Insert"];
export type LoCUpdate = Database["public"]["Tables"]["locs"]["Update"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
```

- [ ] **Step 3: Update Supabase clients to use the type**

Update `src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Update `src/lib/supabase/server.ts` analogously: `createServerClient<Database>(...)`.

- [ ] **Step 4: How to apply this migration**

This is a developer-instruction step, not code. Add to `README.md` or note here:

> The migration in `supabase/migrations/0001_initial_schema.sql` must be applied to your Supabase project.
>
> **Easiest path (no Docker):** Open your Supabase project dashboard → SQL Editor → paste the contents of the migration → Run.
>
> **Local-Supabase path (requires Docker):** `supabase start` then `supabase db push`.

If you are the implementer agent and have no Supabase access, do NOT attempt to run the migration. Mark this step complete by adding a `supabase/README.md` with the instructions above and proceed.

- [ ] **Step 5: Verify**

```bash
pnpm typecheck
pnpm build
```

Both clean (build doesn't need real DB to pass).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add initial DB migration (profiles, amplicons, locs) + RLS + TS types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Auth pages (login + signup, email/password + magic link)

Login at `/login`, signup at `/signup`. Both support email/password. Login page also has a "Send magic link" option. Magic link callback at `/auth/callback`.

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`
- Create: `src/app/signup/page.tsx`, `src/app/signup/actions.ts`
- Create: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Login page**

`src/app/login/page.tsx`:
```tsx
import { login, requestMagicLink } from "./actions";
import Link from "next/link";

export default function LoginPage({ searchParams }: { searchParams: { error?: string; sent?: string } }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-zinc-50">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-1">Log in to amplifica</h1>
        <p className="text-sm text-sub mb-5">Quiet systems for lasting wealth.</p>

        {searchParams.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-4">{searchParams.error}</p>
        )}
        {searchParams.sent && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
            Magic link sent. Check your email.
          </p>
        )}

        <form action={login} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Email</span>
            <input name="email" type="email" required className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Password</span>
            <input name="password" type="password" required className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="w-full bg-ink text-white text-sm py-2 rounded">Log in</button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="flex-1 h-px bg-zinc-200" />
          <span className="text-xs text-sub">or</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

        <form action={requestMagicLink} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Email for magic link</span>
            <input name="email" type="email" required className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="w-full bg-zinc-100 hover:bg-zinc-200 text-sm py-2 rounded">Send magic link</button>
        </form>

        <p className="text-sm text-sub mt-5">
          No account? <Link href="/signup" className="text-blue-700 hover:underline">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Login actions**

`src/app/login/actions.ts`:
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dashboard");
}

export async function requestMagicLink(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") ?? "");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/login?sent=1");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 3: Signup page**

`src/app/signup/page.tsx`:
```tsx
import { signup } from "./actions";
import Link from "next/link";

export default function SignupPage({ searchParams }: { searchParams: { error?: string; sent?: string } }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-zinc-50">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-1">Create your account</h1>
        <p className="text-sm text-sub mb-5">amplifica is single-tenant per user.</p>

        {searchParams.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-4">{searchParams.error}</p>
        )}
        {searchParams.sent && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
            Confirmation email sent. Check your inbox.
          </p>
        )}

        <form action={signup} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Email</span>
            <input name="email" type="email" required className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Password</span>
            <input name="password" type="password" required minLength={8} className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="w-full bg-ink text-white text-sm py-2 rounded">Sign up</button>
        </form>

        <p className="text-sm text-sub mt-5">
          Already have an account? <Link href="/login" className="text-blue-700 hover:underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Signup action**

`src/app/signup/actions.ts`:
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signup(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/signup?sent=1");
}
```

- [ ] **Step 5: OAuth callback for magic links and email confirmations**

`src/app/auth/callback/route.ts`:
```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = createClient();
    await supabase.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/dashboard", url));
}
```

Note: `supabase.auth.exchangeCodeForSession(code)` is the correct method on the SSR client. The `auth` namespace is implicit. If TS complains, use `await supabase.auth.exchangeCodeForSession(code);`.

Correction — the code as written has a typo. The corrected line is:
```ts
await supabase.auth.exchangeCodeForSession(code);
```

Apply that. Full file:
```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/dashboard", url));
}
```

- [ ] **Step 6: Root page redirect**

Replace `src/app/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
```

- [ ] **Step 7: Verify**

```bash
pnpm typecheck
pnpm build
```

Both clean. `pnpm dev` should serve `/login` and `/signup` (visit them in browser).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add login, signup, and magic-link auth flows

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: App layout with sidebar + auth gate

Authenticated routes live under `src/app/(app)/`. They share a layout that renders the sidebar and confirms an authenticated user (middleware already gates this; the layout does a double-check + provides the user to children via props).

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/components/Sidebar.tsx`
- Create: `src/app/(app)/dashboard/page.tsx` (placeholder)
- Create: `src/app/(app)/amplicons/page.tsx` (placeholder)
- Create: `src/app/(app)/loc/page.tsx` (placeholder)
- Create: `src/app/(app)/settings/page.tsx` (placeholder)

- [ ] **Step 1: Sidebar component**

`src/components/Sidebar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Coins, CreditCard, Settings as SettingsIcon, LogOut } from "lucide-react";
import clsx from "clsx";
import { logout } from "@/app/login/actions";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/amplicons", label: "Amplicons", icon: Coins },
  { to: "/loc", label: "Lines of Credit", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-ink text-zinc-300 px-3 py-5 flex-shrink-0 flex flex-col min-h-screen">
      <div className="text-white font-bold text-base mb-1 px-2">amplifica</div>
      <div className="text-xs text-zinc-500 mb-6 px-2 truncate">{email}</div>
      {items.map((item) => {
        const isActive = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            href={item.to}
            className={clsx(
              "flex items-center gap-2 px-2 py-1.5 rounded text-sm mb-0.5",
              isActive ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"
            )}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <div className="mt-auto">
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full hover:bg-zinc-900"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Authenticated layout**

`src/app/(app)/layout.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar email={user.email ?? ""} />
      <main className="flex-1 p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Placeholder pages**

`src/app/(app)/dashboard/page.tsx`:
```tsx
export default function DashboardPage() {
  return <h1 className="text-xl font-semibold">Dashboard</h1>;
}
```

`src/app/(app)/amplicons/page.tsx`:
```tsx
export default function AmpliconsPage() {
  return <h1 className="text-xl font-semibold">Amplicons</h1>;
}
```

`src/app/(app)/loc/page.tsx`:
```tsx
export default function LoCPage() {
  return <h1 className="text-xl font-semibold">Lines of Credit</h1>;
}
```

`src/app/(app)/settings/page.tsx`:
```tsx
export default function SettingsPage() {
  return <h1 className="text-xl font-semibold">Settings</h1>;
}
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
pnpm build
```

Clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add (app) layout with sidebar, auth gate, and 4 placeholder pages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Port finance modules (amortization, dates, format)

Salvage the pure finance code from the previous `feat/amplifica-mvp` branch. These modules have no DB or React dependencies and are heavily tested.

**Source files (read-only reference on the parked branch):**
- `feat/amplifica-mvp:src/engine/amortization.ts` (and its `__tests__/amortization.test.ts`)
- `feat/amplifica-mvp:src/engine/dates.ts` (and its `__tests__/dates.test.ts`)
- `feat/amplifica-mvp:src/ui/common/format.ts`

**Approach:** rewrite the modules in `src/lib/finance/` and `src/lib/format.ts` using the code below (transcribed verbatim, with import paths updated). Don't `git cherry-pick` — the source branch and the v2 branch have different file layouts.

**Files:**
- Create: `src/lib/finance/amortization.ts`
- Create: `src/lib/finance/amortization.test.ts`
- Create: `src/lib/finance/dates.ts`
- Create: `src/lib/finance/dates.test.ts`
- Create: `src/lib/format.ts`

- [ ] **Step 1: amortization.ts**

`src/lib/finance/amortization.ts`:
```ts
export interface AmortizationRow {
  monthIndex: number;
  payment: number;
  interest: number;
  principal: number;
  remainingPrincipal: number;
}

export function monthlyPayment(principal: number, aprPct: number, termMonths: number): number {
  if (termMonths <= 0) return 0;
  if (aprPct === 0) return principal / termMonths;
  const r = aprPct / 12;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

export function amortizationSchedule(
  principal: number,
  aprPct: number,
  termMonths: number
): AmortizationRow[] {
  const pmt = monthlyPayment(principal, aprPct, termMonths);
  const r = aprPct / 12;
  const rows: AmortizationRow[] = [];
  let balance = principal;
  for (let i = 0; i < termMonths; i++) {
    const interest = balance * r;
    const principalPaid = Math.min(pmt - interest, balance);
    balance -= principalPaid;
    rows.push({
      monthIndex: i,
      payment: pmt,
      interest,
      principal: principalPaid,
      remainingPrincipal: balance,
    });
  }
  if (rows.length > 0) {
    rows[rows.length - 1].remainingPrincipal = 0;
  }
  return rows;
}

export function remainingPrincipalAfter(
  principal: number,
  aprPct: number,
  termMonths: number,
  monthsElapsed: number
): number {
  if (monthsElapsed <= 0) return principal;
  if (monthsElapsed >= termMonths) return 0;
  const schedule = amortizationSchedule(principal, aprPct, termMonths);
  return schedule[monthsElapsed - 1].remainingPrincipal;
}
```

- [ ] **Step 2: amortization.test.ts**

`src/lib/finance/amortization.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  monthlyPayment,
  amortizationSchedule,
  remainingPrincipalAfter,
} from "./amortization";

describe("amortization", () => {
  it("monthlyPayment: $100k at 8% / 36mo ≈ $3,133.64", () => {
    expect(monthlyPayment(100000, 0.08, 36)).toBeCloseTo(3133.64, 2);
  });

  it("monthlyPayment: zero rate is linear", () => {
    expect(monthlyPayment(12000, 0, 12)).toBeCloseTo(1000, 2);
  });

  it("amortizationSchedule: 36 rows, ends at 0 remaining", () => {
    const s = amortizationSchedule(100000, 0.08, 36);
    expect(s).toHaveLength(36);
    expect(s[s.length - 1].remainingPrincipal).toBeCloseTo(0, 2);
    const totalPrincipal = s.reduce((acc, r) => acc + r.principal, 0);
    expect(totalPrincipal).toBeCloseTo(100000, 2);
  });

  it("first month: interest = P × r", () => {
    const s = amortizationSchedule(100000, 0.08, 36);
    expect(s[0].interest).toBeCloseTo(100000 * (0.08 / 12), 4);
  });

  it("remainingPrincipalAfter: 0 → full, term → 0, 6 of 36 at 8% ≈ 84949.28", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 0)).toBeCloseTo(100000, 2);
    expect(remainingPrincipalAfter(100000, 0.08, 36, 36)).toBeCloseTo(0, 2);
    expect(remainingPrincipalAfter(100000, 0.08, 36, 6)).toBeCloseTo(84949.28, 1);
  });

  it("remainingPrincipalAfter: clamps months > term to 0", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 100)).toBe(0);
  });
});
```

- [ ] **Step 3: dates.ts**

`src/lib/finance/dates.ts`:
```ts
export type YearMonth = string; // "YYYY-MM"

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

export function formatYearMonth({ year, month }: { year: number; month: number }): YearMonth {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const { year, month } = parseYearMonth(ym);
  const idx = year * 12 + (month - 1) + n;
  const newYear = Math.floor(idx / 12);
  const newMonth = (idx % 12) + 1;
  return formatYearMonth({ year: newYear, month: newMonth });
}

export function monthsBetween(a: YearMonth, b: YearMonth): number {
  const A = parseYearMonth(a);
  const B = parseYearMonth(b);
  return (B.year - A.year) * 12 + (B.month - A.month);
}

export function dateToYearMonth(d: Date): YearMonth {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isoToYearMonth(iso: string): YearMonth {
  // "2026-05-22" or full ISO → "2026-05"
  return iso.slice(0, 7);
}

export function currentYearMonth(): YearMonth {
  return dateToYearMonth(new Date());
}
```

- [ ] **Step 4: dates.test.ts**

`src/lib/finance/dates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  addMonths,
  monthsBetween,
  parseYearMonth,
  formatYearMonth,
  dateToYearMonth,
  isoToYearMonth,
} from "./dates";

describe("dates", () => {
  it("addMonths handles year rollover", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });

  it("addMonths handles negative offsets", () => {
    expect(addMonths("2026-03", -5)).toBe("2025-10");
  });

  it("monthsBetween counts forward", () => {
    expect(monthsBetween("2026-01", "2026-04")).toBe(3);
  });

  it("monthsBetween counts backward", () => {
    expect(monthsBetween("2026-04", "2026-01")).toBe(-3);
  });

  it("parseYearMonth + formatYearMonth roundtrip", () => {
    expect(formatYearMonth(parseYearMonth("2026-05"))).toBe("2026-05");
  });

  it("dateToYearMonth strips day", () => {
    expect(dateToYearMonth(new Date("2026-05-22T10:00:00Z"))).toBe("2026-05");
  });

  it("isoToYearMonth slices first 7 chars", () => {
    expect(isoToYearMonth("2026-05-22")).toBe("2026-05");
    expect(isoToYearMonth("2026-05-22T10:00:00Z")).toBe("2026-05");
  });
});
```

- [ ] **Step 5: format.ts (with new MUSD/kUSD units)**

`src/lib/format.ts`:
```ts
// Generic compact USD: $1.2k, $42k, $1.4M
export function fmtCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${sign}$${(v / 1_000).toFixed(0)}k`;
  if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}k`;
  return `${sign}$${v.toFixed(0)}`;
}

// USD stored, displayed in MUSD with 2 decimals (e.g. 1234567 → "$1.23M")
export function fmtMUSD(usd: number): string {
  if (!isFinite(usd)) return "—";
  return `$${(usd / 1_000_000).toFixed(2)}M`;
}

// USD stored, displayed in kUSD with 1 decimal (e.g. 4250 → "$4.3k")
export function fmtKUSD(usd: number): string {
  if (!isFinite(usd)) return "—";
  return `$${(usd / 1_000).toFixed(1)}k`;
}

export function fmtPct(decimal: number, fractionDigits = 1): string {
  return `${(decimal * 100).toFixed(fractionDigits)}%`;
}

export function fmtMonth(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(m) - 1]} '${y.slice(2)}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}, ${d.getFullYear()}`;
}
```

- [ ] **Step 6: Verify**

```bash
pnpm test
pnpm typecheck
```

Expected: all finance + dates tests pass. Typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Port finance modules (amortization, dates, format) from v1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Projection engine (cash flow + net worth series)

Pure TypeScript module that takes a list of Amplicons + the user's ExternalNetWorth and produces month-by-month cash-flow and net-worth series. Heavy TDD.

**Files:**
- Create: `src/lib/finance/projection.ts`
- Create: `src/lib/finance/projection.test.ts`

- [ ] **Step 1: Projection tests (TDD)**

`src/lib/finance/projection.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  monthlyPayoutOf,
  pvAtMonth,
  isActiveAt,
  buildSeries,
  type ProjectionInput,
  type AmpliconLite,
} from "./projection";

const inv25k36mo: AmpliconLite = {
  id: "i1",
  faceValue: 25000,
  interestPct: 0.08,
  termMonths: 36,
  startMonth: "2026-05",
};

describe("monthlyPayoutOf", () => {
  it("$25k / 8% / 36mo ≈ $783.41", () => {
    expect(monthlyPayoutOf(inv25k36mo)).toBeCloseTo(783.41, 2);
  });
});

describe("isActiveAt", () => {
  it("at startMonth: active", () => {
    expect(isActiveAt(inv25k36mo, "2026-05")).toBe(true);
  });
  it("before startMonth: not active", () => {
    expect(isActiveAt(inv25k36mo, "2026-04")).toBe(false);
  });
  it("at startMonth + termMonths: not active (term has lapsed)", () => {
    expect(isActiveAt(inv25k36mo, "2029-05")).toBe(false);
  });
  it("one month before end: still active", () => {
    expect(isActiveAt(inv25k36mo, "2029-04")).toBe(true);
  });
});

describe("pvAtMonth (PV = remaining amortization balance, discount = loan rate)", () => {
  it("at startMonth: full faceValue", () => {
    expect(pvAtMonth(inv25k36mo, "2026-05")).toBeCloseTo(25000, 2);
  });
  it("before startMonth: 0", () => {
    expect(pvAtMonth(inv25k36mo, "2026-04")).toBe(0);
  });
  it("at endMonth: 0", () => {
    expect(pvAtMonth(inv25k36mo, "2029-05")).toBe(0);
  });
  it("6 months in: matches amortization schedule remaining balance", () => {
    // remaining after 6 payments of a $25k / 8% / 36mo loan = approx $21,237.32
    expect(pvAtMonth(inv25k36mo, "2026-11")).toBeCloseTo(21237.32, 1);
  });
});

describe("buildSeries", () => {
  it("returns months from inception (earliest StartDate) through last EndDate", () => {
    const input: ProjectionInput = {
      amplicons: [inv25k36mo],
      externalNetWorth: 0,
      range: "inception",
      today: "2026-05",
    };
    const series = buildSeries(input);
    expect(series[0].month).toBe("2026-05");
    expect(series[series.length - 1].month).toBe("2029-04"); // last active month
    expect(series).toHaveLength(36);
  });

  it("range='current' starts at today's month", () => {
    const input: ProjectionInput = {
      amplicons: [inv25k36mo],
      externalNetWorth: 0,
      range: "current",
      today: "2027-05",
    };
    const series = buildSeries(input);
    expect(series[0].month).toBe("2027-05");
  });

  it("cashFlow at startMonth equals monthly payout", () => {
    const input: ProjectionInput = {
      amplicons: [inv25k36mo],
      externalNetWorth: 0,
      range: "inception",
      today: "2026-05",
    };
    const series = buildSeries(input);
    expect(series[0].cashFlow).toBeCloseTo(783.41, 2);
  });

  it("netWorth at startMonth = externalNetWorth + faceValue", () => {
    const input: ProjectionInput = {
      amplicons: [inv25k36mo],
      externalNetWorth: 100000,
      range: "inception",
      today: "2026-05",
    };
    const series = buildSeries(input);
    expect(series[0].netWorth).toBeCloseTo(125000, 1);
  });

  it("multiple amplicons: cash flow + NW are additive at each month", () => {
    const inv2: AmpliconLite = {
      id: "i2",
      faceValue: 50000,
      interestPct: 0.06,
      termMonths: 24,
      startMonth: "2026-08",
    };
    const input: ProjectionInput = {
      amplicons: [inv25k36mo, inv2],
      externalNetWorth: 0,
      range: "inception",
      today: "2026-05",
    };
    const series = buildSeries(input);
    // month 0 (2026-05): only inv1 active
    expect(series[0].cashFlow).toBeCloseTo(monthlyPayoutOf(inv25k36mo), 2);
    // month 3 (2026-08): both active
    const aug = series.find((s) => s.month === "2026-08")!;
    expect(aug.cashFlow).toBeCloseTo(
      monthlyPayoutOf(inv25k36mo) + monthlyPayoutOf(inv2),
      2
    );
  });

  it("empty amplicons + zero external NW = flat zero series of length 1", () => {
    const input: ProjectionInput = {
      amplicons: [],
      externalNetWorth: 0,
      range: "inception",
      today: "2026-05",
    };
    const series = buildSeries(input);
    expect(series).toHaveLength(1);
    expect(series[0].cashFlow).toBe(0);
    expect(series[0].netWorth).toBe(0);
  });
});
```

- [ ] **Step 2: Run and verify fails**

```bash
pnpm test src/lib/finance/projection.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement projection.ts**

`src/lib/finance/projection.ts`:
```ts
import {
  monthlyPayment,
  remainingPrincipalAfter,
} from "./amortization";
import { addMonths, monthsBetween, type YearMonth } from "./dates";

export interface AmpliconLite {
  id: string;
  faceValue: number;       // USD principal
  interestPct: number;     // decimal, e.g. 0.08 = 8%
  termMonths: number;
  startMonth: YearMonth;
}

export interface ProjectionInput {
  amplicons: AmpliconLite[];
  externalNetWorth: number;  // USD
  range: "inception" | "current";
  today: YearMonth;
}

export interface ProjectionPoint {
  month: YearMonth;
  monthIndex: number;        // 0-based from series start
  cashFlow: number;          // USD: sum of monthly payouts of active amplicons
  netWorth: number;          // USD: externalNetWorth + Σ PV(active amplicons)
}

export function monthlyPayoutOf(inv: AmpliconLite): number {
  return monthlyPayment(inv.faceValue, inv.interestPct, inv.termMonths);
}

export function isActiveAt(inv: AmpliconLite, month: YearMonth): boolean {
  const elapsed = monthsBetween(inv.startMonth, month);
  return elapsed >= 0 && elapsed < inv.termMonths;
}

export function pvAtMonth(inv: AmpliconLite, month: YearMonth): number {
  const elapsed = monthsBetween(inv.startMonth, month);
  if (elapsed < 0) return 0;
  if (elapsed >= inv.termMonths) return 0;
  // PV with discount = loan rate is the outstanding amortization balance
  return remainingPrincipalAfter(
    inv.faceValue,
    inv.interestPct,
    inv.termMonths,
    elapsed
  );
}

export function buildSeries(input: ProjectionInput): ProjectionPoint[] {
  const { amplicons, externalNetWorth, range, today } = input;

  if (amplicons.length === 0) {
    return [{ month: today, monthIndex: 0, cashFlow: 0, netWorth: externalNetWorth }];
  }

  // Earliest startMonth across all amplicons
  const earliestStart = amplicons.reduce<YearMonth>((acc, inv) => {
    return monthsBetween(inv.startMonth, acc) > 0 ? inv.startMonth : acc;
  }, amplicons[0].startMonth);

  // Latest endMonth (startMonth + termMonths) — series ends at endMonth - 1 (last active month)
  const latestEnd = amplicons.reduce<YearMonth>((acc, inv) => {
    const end = addMonths(inv.startMonth, inv.termMonths);
    return monthsBetween(end, acc) > 0 ? end : acc;
  }, addMonths(amplicons[0].startMonth, amplicons[0].termMonths));

  const lastActiveMonth = addMonths(latestEnd, -1);
  const startMonth: YearMonth = range === "inception" ? earliestStart : today;

  const length = monthsBetween(startMonth, lastActiveMonth) + 1;
  if (length <= 0) {
    return [{ month: startMonth, monthIndex: 0, cashFlow: 0, netWorth: externalNetWorth }];
  }

  const series: ProjectionPoint[] = [];
  for (let i = 0; i < length; i++) {
    const month = addMonths(startMonth, i);
    let cashFlow = 0;
    let pvTotal = 0;
    for (const inv of amplicons) {
      if (isActiveAt(inv, month)) {
        cashFlow += monthlyPayoutOf(inv);
      }
      pvTotal += pvAtMonth(inv, month);
    }
    series.push({
      month,
      monthIndex: i,
      cashFlow,
      netWorth: externalNetWorth + pvTotal,
    });
  }
  return series;
}
```

- [ ] **Step 4: Run and verify pass**

```bash
pnpm test src/lib/finance/projection.test.ts
pnpm test
pnpm typecheck
```

All green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add projection engine — cash flow + PV-based net worth series

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Settings page (read + update)

Form-driven page that displays + edits the Personal Settings on `profiles`. Server action handles the upsert.

**Files:**
- Create: `src/components/Field.tsx`
- Create: `src/components/NumberInput.tsx`
- Create: `src/components/Card.tsx`
- Replace: `src/app/(app)/settings/page.tsx`
- Create: `src/app/(app)/settings/actions.ts`

- [ ] **Step 1: Shared primitives**

`src/components/Field.tsx`:
```tsx
import type { ReactNode } from "react";

export default function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-sub mt-1">{hint}</span>}
    </label>
  );
}
```

`src/components/NumberInput.tsx`:
```tsx
export default function NumberInput({
  name,
  defaultValue,
  step,
  min,
  required,
}: {
  name: string;
  defaultValue?: number;
  step?: number;
  min?: number;
  required?: boolean;
}) {
  return (
    <input
      name={name}
      type="number"
      step={step ?? "any"}
      min={min}
      defaultValue={defaultValue}
      required={required}
      className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}
```

`src/components/Card.tsx`:
```tsx
import type { ReactNode } from "react";

export default function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-zinc-200 rounded-lg p-4 mb-4">
      {title && <h2 className="font-semibold mb-3">{title}</h2>}
      {children}
    </section>
  );
}
```

- [ ] **Step 2: Settings action**

`src/app/(app)/settings/actions.ts`:
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveSettings(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const monthly_savings_contribution = Number(formData.get("monthly_savings_contribution") ?? 0);
  const net_worth_goal = Number(formData.get("net_worth_goal") ?? 0);
  const monthly_cashflow_goal = Number(formData.get("monthly_cashflow_goal") ?? 0);
  const external_net_worth = Number(formData.get("external_net_worth") ?? 0);

  const { error } = await supabase
    .from("profiles")
    .update({
      monthly_savings_contribution,
      net_worth_goal,
      monthly_cashflow_goal,
      external_net_worth,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
}
```

- [ ] **Step 3: Settings page**

`src/app/(app)/settings/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Card from "@/components/Card";
import Field from "@/components/Field";
import NumberInput from "@/components/NumberInput";
import { saveSettings } from "./actions";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      <form action={saveSettings}>
        <Card title="Personal settings">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly savings contribution ($)" hint="What you contribute to investments each month, in USD.">
              <NumberInput
                name="monthly_savings_contribution"
                defaultValue={profile?.monthly_savings_contribution ?? 0}
                min={0}
                step={100}
              />
            </Field>
            <Field label="External net worth ($M)" hint="Assets held outside amplifica, in millions of USD.">
              <NumberInput
                name="external_net_worth"
                defaultValue={profile?.external_net_worth ?? 0}
                min={0}
                step={0.01}
              />
            </Field>
            <Field label="Net worth goal ($M)" hint="Total target, in millions of USD.">
              <NumberInput
                name="net_worth_goal"
                defaultValue={profile?.net_worth_goal ?? 0}
                min={0}
                step={0.01}
              />
            </Field>
            <Field label="Monthly cash flow goal ($k)" hint="Target monthly cash flow from Amplicons, in thousands of USD.">
              <NumberInput
                name="monthly_cashflow_goal"
                defaultValue={profile?.monthly_cashflow_goal ?? 0}
                min={0}
                step={0.1}
              />
            </Field>
          </div>
        </Card>

        <button type="submit" className="bg-ink text-white text-sm px-4 py-2 rounded">
          Save settings
        </button>
      </form>
    </div>
  );
}
```

Important: `external_net_worth` and `net_worth_goal` are stored as MUSD (millions) because the PRD displays them that way. `monthly_cashflow_goal` is stored as kUSD (thousands). These match the DB column units (the migration stores them as the displayed numeric value, not USD).

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
pnpm build
```

Both clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Settings page: read + update Personal Settings via server action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Amplicons page (CRUD list)

List view + inline new-row form + per-row edit/delete.

**Files:**
- Replace: `src/app/(app)/amplicons/page.tsx`
- Create: `src/app/(app)/amplicons/actions.ts`
- Create: `src/app/(app)/amplicons/NewAmpliconForm.tsx`

- [ ] **Step 1: Amplicons actions**

`src/app/(app)/amplicons/actions.ts`:
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createAmplicon(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const ai_type = String(formData.get("ai_type") ?? "").trim();
  const face_value = Number(formData.get("face_value") ?? 0);
  const term_months = Number(formData.get("term_months") ?? 0);
  const interest_pct = Number(formData.get("interest_pct") ?? 0) / 100;
  const start_date = String(formData.get("start_date") ?? "");

  if (!name || face_value <= 0 || term_months <= 0 || !start_date) {
    throw new Error("Missing or invalid required fields.");
  }

  const { error } = await supabase.from("amplicons").insert({
    user_id: user.id,
    name,
    ai_type,
    face_value,
    term_months,
    interest_pct,
    start_date,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
}

export async function deleteAmplicon(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase.from("amplicons").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
}
```

- [ ] **Step 2: NewAmpliconForm**

`src/app/(app)/amplicons/NewAmpliconForm.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createAmplicon } from "./actions";
import Card from "@/components/Card";
import Field from "@/components/Field";
import NumberInput from "@/components/NumberInput";

export default function NewAmpliconForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-ink text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1 mb-4"
      >
        <Plus className="w-4 h-4" /> Add Amplicon
      </button>
    );
  }

  return (
    <Card title="New Amplicon">
      <form action={async (fd) => { await createAmplicon(fd); setOpen(false); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              name="name"
              required
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Type" hint="e.g. Real Estate Note, Trust Deed">
            <input
              name="ai_type"
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Face value ($)">
            <NumberInput name="face_value" defaultValue={25000} min={0} step={1000} required />
          </Field>
          <Field label="Term (months)">
            <NumberInput name="term_months" defaultValue={36} min={1} step={1} required />
          </Field>
          <Field label="Annual interest (%)">
            <NumberInput name="interest_pct" defaultValue={8} min={0} step={0.1} required />
          </Field>
          <Field label="Start date">
            <input
              name="start_date"
              type="date"
              required
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-ink text-white text-sm px-4 py-1.5 rounded">
            Add Amplicon
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm px-4 py-1.5 rounded text-sub hover:bg-zinc-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 3: Amplicons page**

`src/app/(app)/amplicons/page.tsx`:
```tsx
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isoToYearMonth, addMonths } from "@/lib/finance/dates";
import { monthlyPayoutOf, isActiveAt } from "@/lib/finance/projection";
import { fmtCurrency, fmtPct, fmtDate } from "@/lib/format";
import Card from "@/components/Card";
import NewAmpliconForm from "./NewAmpliconForm";
import { deleteAmplicon } from "./actions";

export default async function AmpliconsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: amplicons } = await supabase
    .from("amplicons")
    .select("*")
    .order("start_date", { ascending: false });

  const todayMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Amplicons</h1>

      <NewAmpliconForm />

      <Card>
        {!amplicons || amplicons.length === 0 ? (
          <p className="text-sm text-sub">No Amplicons yet. Click "Add Amplicon" to start.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-zinc-200">
                <th className="py-2">Name</th>
                <th>Type</th>
                <th>Face value</th>
                <th>Rate</th>
                <th>Term</th>
                <th>Start</th>
                <th>End</th>
                <th>Monthly</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {amplicons.map((a) => {
                const startMonth = isoToYearMonth(a.start_date);
                const endMonth = addMonths(startMonth, a.term_months);
                const lite = {
                  id: a.id,
                  faceValue: a.face_value,
                  interestPct: a.interest_pct,
                  termMonths: a.term_months,
                  startMonth,
                };
                const monthly = monthlyPayoutOf(lite);
                const active = isActiveAt(lite, todayMonth);
                return (
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="py-2">{a.name}</td>
                    <td>{a.ai_type || "—"}</td>
                    <td>{fmtCurrency(a.face_value)}</td>
                    <td>{fmtPct(a.interest_pct, 2)}</td>
                    <td>{a.term_months} mo</td>
                    <td>{fmtDate(a.start_date)}</td>
                    <td>{endMonth}</td>
                    <td>{fmtCurrency(monthly)}</td>
                    <td className={active ? "text-emerald-700" : "text-sub"}>
                      {active ? "Active" : "Inactive"}
                    </td>
                    <td>
                      <form action={deleteAmplicon}>
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          className="text-zinc-500 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
pnpm build
```

Clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Amplicons page: list, add form, delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Lines of Credit page (CRUD + totals + inline utilization edit)

**Files:**
- Replace: `src/app/(app)/loc/page.tsx`
- Create: `src/app/(app)/loc/actions.ts`
- Create: `src/app/(app)/loc/NewLoCForm.tsx`
- Create: `src/app/(app)/loc/UtilizationCell.tsx`

- [ ] **Step 1: LoC actions**

`src/app/(app)/loc/actions.ts`:
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createLoC(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const loc_type = String(formData.get("loc_type") ?? "") as "HELOC" | "PLOC";
  const size = Number(formData.get("size") ?? 0);
  const utilization = Number(formData.get("utilization") ?? 0);

  if (!name || (loc_type !== "HELOC" && loc_type !== "PLOC") || size <= 0) {
    throw new Error("Missing or invalid required fields.");
  }

  const { error } = await supabase.from("locs").insert({
    user_id: user.id,
    name,
    loc_type,
    size,
    utilization,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/loc");
}

export async function updateUtilization(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const utilization = Number(formData.get("utilization") ?? 0);
  if (!id || utilization < 0) return;

  const { error } = await supabase
    .from("locs")
    .update({ utilization, utilization_updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/loc");
}

export async function deleteLoC(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { error } = await supabase.from("locs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/loc");
}
```

- [ ] **Step 2: NewLoCForm**

`src/app/(app)/loc/NewLoCForm.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createLoC } from "./actions";
import Card from "@/components/Card";
import Field from "@/components/Field";
import NumberInput from "@/components/NumberInput";

export default function NewLoCForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-ink text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1 mb-4"
      >
        <Plus className="w-4 h-4" /> Add Line of Credit
      </button>
    );
  }

  return (
    <Card title="New Line of Credit">
      <form action={async (fd) => { await createLoC(fd); setOpen(false); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              name="name"
              required
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Type">
            <select
              name="loc_type"
              required
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
              defaultValue="HELOC"
            >
              <option value="HELOC">HELOC</option>
              <option value="PLOC">PLOC</option>
            </select>
          </Field>
          <Field label="Size ($)">
            <NumberInput name="size" defaultValue={50000} min={0} step={1000} required />
          </Field>
          <Field label="Utilization ($)">
            <NumberInput name="utilization" defaultValue={0} min={0} step={1000} />
          </Field>
        </div>
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-ink text-white text-sm px-4 py-1.5 rounded">
            Add
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm px-4 py-1.5 rounded text-sub hover:bg-zinc-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 3: UtilizationCell (inline edit)**

`src/app/(app)/loc/UtilizationCell.tsx`:
```tsx
"use client";

import { useState } from "react";
import { updateUtilization } from "./actions";

export default function UtilizationCell({ id, value }: { id: string; value: number }) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-left hover:underline"
        title="Click to edit"
      >
        ${value.toLocaleString()}
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await updateUtilization(fd);
        setEditing(false);
      }}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="utilization"
        type="number"
        autoFocus
        value={localValue}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        step={100}
        min={0}
        className="w-24 border border-zinc-300 rounded px-1 py-0.5 text-sm"
      />
      <button type="submit" className="text-xs text-blue-700 hover:underline">Save</button>
      <button
        type="button"
        onClick={() => { setLocalValue(value); setEditing(false); }}
        className="text-xs text-sub hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}
```

- [ ] **Step 4: LoC page**

`src/app/(app)/loc/page.tsx`:
```tsx
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fmtCurrency, fmtPct, fmtDate } from "@/lib/format";
import Card from "@/components/Card";
import NewLoCForm from "./NewLoCForm";
import UtilizationCell from "./UtilizationCell";
import { deleteLoC } from "./actions";

export default async function LoCPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: locs } = await supabase
    .from("locs")
    .select("*")
    .order("name");

  const totalSize = (locs ?? []).reduce((s, l) => s + l.size, 0);
  const totalUtil = (locs ?? []).reduce((s, l) => s + l.utilization, 0);
  const totalAvailable = totalSize - totalUtil;
  const aggregatePct = totalSize > 0 ? totalUtil / totalSize : 0;

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Lines of Credit</h1>

      <NewLoCForm />

      {/* Totals */}
      <Card>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Total Size</div>
            <div className="text-lg font-bold">{fmtCurrency(totalSize)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Total Utilization</div>
            <div className="text-lg font-bold">{fmtCurrency(totalUtil)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Total Available</div>
            <div className="text-lg font-bold">{fmtCurrency(totalAvailable)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Aggregate Utilization</div>
            <div className="text-lg font-bold">{fmtPct(aggregatePct, 1)}</div>
          </div>
        </div>
      </Card>

      <Card>
        {!locs || locs.length === 0 ? (
          <p className="text-sm text-sub">No lines of credit yet. Click "Add Line of Credit" to start.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-zinc-200">
                <th className="py-2">Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Utilization</th>
                <th>Available</th>
                <th>Util %</th>
                <th>Last updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locs.map((l) => {
                const available = l.size - l.utilization;
                const pct = l.size > 0 ? l.utilization / l.size : 0;
                return (
                  <tr key={l.id} className="border-b border-zinc-100">
                    <td className="py-2">{l.name}</td>
                    <td>{l.loc_type}</td>
                    <td>{fmtCurrency(l.size)}</td>
                    <td>
                      <UtilizationCell id={l.id} value={l.utilization} />
                    </td>
                    <td>{fmtCurrency(available)}</td>
                    <td>{fmtPct(pct, 1)}</td>
                    <td className="text-sub text-xs">{fmtDate(l.utilization_updated_at)}</td>
                    <td>
                      <form action={deleteLoC}>
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          type="submit"
                          className="text-zinc-500 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

```bash
pnpm typecheck
pnpm build
```

Clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Lines of Credit page: list, totals, inline utilization edit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Dashboard stats row + PV info tooltip

Five stats (per PRD §5.1) plus an info-box hover on the Net Worth stat explaining the PV-discount-rate choice.

**Files:**
- Create: `src/components/InfoBox.tsx`
- Replace: `src/app/(app)/dashboard/page.tsx` (stats row only for now; charts in Task 12)

- [ ] **Step 1: InfoBox component**

`src/components/InfoBox.tsx`:
```tsx
import { Info } from "lucide-react";

export default function InfoBox({ message }: { message: string }) {
  return (
    <span className="inline-block ml-1 align-middle group relative">
      <Info className="w-3.5 h-3.5 text-sub inline cursor-help" />
      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-64 p-2 text-xs text-zinc-100 bg-zinc-800 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
        {message}
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Dashboard page (stats only, charts in Task 12)**

`src/app/(app)/dashboard/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fmtCurrency, fmtKUSD, fmtMUSD } from "@/lib/format";
import { isoToYearMonth, currentYearMonth } from "@/lib/finance/dates";
import { monthlyPayoutOf, isActiveAt, pvAtMonth, type AmpliconLite } from "@/lib/finance/projection";
import Card from "@/components/Card";
import InfoBox from "@/components/InfoBox";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: amplicons }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("amplicons").select("*"),
  ]);

  const todayMonth = currentYearMonth();
  const lites: AmpliconLite[] = (amplicons ?? []).map((a) => ({
    id: a.id,
    faceValue: a.face_value,
    interestPct: a.interest_pct,
    termMonths: a.term_months,
    startMonth: isoToYearMonth(a.start_date),
  }));

  const activeNow = lites.filter((a) => isActiveAt(a, todayMonth));
  const currentMonthlyCashflow = activeNow.reduce((s, a) => s + monthlyPayoutOf(a), 0);

  // Net Worth: external (stored as MUSD in DB) + Σ PV(active) (which is in USD)
  // External NW in DB is MUSD per Task 8 — convert to USD for the sum
  const externalNWUSD = (profile?.external_net_worth ?? 0) * 1_000_000;
  const totalPVUSD = lites.reduce((s, a) => s + pvAtMonth(a, todayMonth), 0);
  const currentTotalNetWorth = externalNWUSD + totalPVUSD;

  // Targets: stored in display units (MUSD for NW goal, kUSD for cashflow goal)
  const cashflowGoalUSD = (profile?.monthly_cashflow_goal ?? 0) * 1_000;
  const netWorthGoalUSD = (profile?.net_worth_goal ?? 0) * 1_000_000;

  const ampliconsCount = lites.length;
  const monthlyContribution = profile?.monthly_savings_contribution ?? 0;

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>

      <div className="grid grid-cols-5 gap-3 mb-4">
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Monthly contribution</div>
          <div className="text-xl font-bold">{fmtCurrency(monthlyContribution)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Amplicons</div>
          <div className="text-xl font-bold">{ampliconsCount}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Current monthly cashflow</div>
          <div className="text-xl font-bold">{fmtKUSD(currentMonthlyCashflow)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Monthly cashflow target</div>
          <div className="text-xl font-bold">{fmtKUSD(cashflowGoalUSD)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">
            Current total net worth
            <InfoBox message="Present Value uses each loan's own interest as the discount rate. PV therefore equals each loan's outstanding amortization balance." />
          </div>
          <div className="text-xl font-bold">{fmtMUSD(currentTotalNetWorth)}</div>
          <div className="text-[11px] text-sub mt-0.5">Target: {fmtMUSD(netWorthGoalUSD)}</div>
        </Card>
      </div>

      <Card>
        <p className="text-sm text-sub">Charts coming in next task.</p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
pnpm build
```

Clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add Dashboard stats row + PV info tooltip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Dashboard charts (cash flow + net worth, smoothed) + range toggle

Two Recharts line charts beneath the stats. Smoothed (monotone). Target dashed lines. Inception ↔ Current month toggle.

**Files:**
- Create: `src/app/(app)/dashboard/ChartPair.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (replace the "Charts coming in next task" placeholder)

- [ ] **Step 1: ChartPair (client component)**

`src/app/(app)/dashboard/ChartPair.tsx`:
```tsx
"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ProjectionPoint } from "@/lib/finance/projection";
import { fmtCurrency, fmtKUSD, fmtMUSD } from "@/lib/format";

interface Props {
  inceptionSeries: ProjectionPoint[];
  currentSeries: ProjectionPoint[];
  cashflowTargetUSD: number;   // converted to USD
  netWorthTargetUSD: number;
}

export default function ChartPair({
  inceptionSeries,
  currentSeries,
  cashflowTargetUSD,
  netWorthTargetUSD,
}: Props) {
  const [range, setRange] = useState<"inception" | "current">("inception");
  const series = range === "inception" ? inceptionSeries : currentSeries;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-sub uppercase tracking-wide">Time range</span>
        <button
          onClick={() => setRange("inception")}
          className={`text-xs px-2 py-1 rounded ${
            range === "inception" ? "bg-ink text-white" : "bg-zinc-100 text-sub"
          }`}
        >
          Since inception
        </button>
        <button
          onClick={() => setRange("current")}
          className={`text-xs px-2 py-1 rounded ${
            range === "current" ? "bg-ink text-white" : "bg-zinc-100 text-sub"
          }`}
        >
          From current month
        </button>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Monthly cash flow</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => fmtCurrency(v)}
                labelFormatter={(l) => `Month ${l}`}
              />
              <Line
                type="monotone"
                dataKey="cashFlow"
                stroke="#4f7cff"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {cashflowTargetUSD > 0 && (
                <ReferenceLine
                  y={cashflowTargetUSD}
                  stroke="#2e8a4a"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${fmtKUSD(cashflowTargetUSD)}`, fontSize: 10, position: "right" }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Net worth</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => fmtCurrency(v)}
                labelFormatter={(l) => `Month ${l}`}
              />
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="#2e8a4a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {netWorthTargetUSD > 0 && (
                <ReferenceLine
                  y={netWorthTargetUSD}
                  stroke="#b08020"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${fmtMUSD(netWorthTargetUSD)}`, fontSize: 10, position: "right" }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update Dashboard page to use ChartPair**

Modify `src/app/(app)/dashboard/page.tsx`. Replace the trailing placeholder Card with the full chart pair. Full updated file:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fmtCurrency, fmtKUSD, fmtMUSD } from "@/lib/format";
import { isoToYearMonth, currentYearMonth } from "@/lib/finance/dates";
import {
  monthlyPayoutOf,
  isActiveAt,
  pvAtMonth,
  buildSeries,
  type AmpliconLite,
} from "@/lib/finance/projection";
import Card from "@/components/Card";
import InfoBox from "@/components/InfoBox";
import ChartPair from "./ChartPair";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: amplicons }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("amplicons").select("*"),
  ]);

  const todayMonth = currentYearMonth();
  const lites: AmpliconLite[] = (amplicons ?? []).map((a) => ({
    id: a.id,
    faceValue: a.face_value,
    interestPct: a.interest_pct,
    termMonths: a.term_months,
    startMonth: isoToYearMonth(a.start_date),
  }));

  const activeNow = lites.filter((a) => isActiveAt(a, todayMonth));
  const currentMonthlyCashflow = activeNow.reduce((s, a) => s + monthlyPayoutOf(a), 0);

  const externalNWUSD = (profile?.external_net_worth ?? 0) * 1_000_000;
  const totalPVUSD = lites.reduce((s, a) => s + pvAtMonth(a, todayMonth), 0);
  const currentTotalNetWorth = externalNWUSD + totalPVUSD;

  const cashflowGoalUSD = (profile?.monthly_cashflow_goal ?? 0) * 1_000;
  const netWorthGoalUSD = (profile?.net_worth_goal ?? 0) * 1_000_000;

  const ampliconsCount = lites.length;
  const monthlyContribution = profile?.monthly_savings_contribution ?? 0;

  // Series for charts
  const inceptionSeries = buildSeries({
    amplicons: lites,
    externalNetWorth: externalNWUSD,
    range: "inception",
    today: todayMonth,
  });
  const currentSeries = buildSeries({
    amplicons: lites,
    externalNetWorth: externalNWUSD,
    range: "current",
    today: todayMonth,
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>

      <div className="grid grid-cols-5 gap-3 mb-4">
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Monthly contribution</div>
          <div className="text-xl font-bold">{fmtCurrency(monthlyContribution)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Amplicons</div>
          <div className="text-xl font-bold">{ampliconsCount}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Current monthly cashflow</div>
          <div className="text-xl font-bold">{fmtKUSD(currentMonthlyCashflow)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Monthly cashflow target</div>
          <div className="text-xl font-bold">{fmtKUSD(cashflowGoalUSD)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">
            Current total net worth
            <InfoBox message="Present Value uses each loan's own interest as the discount rate. PV therefore equals each loan's outstanding amortization balance." />
          </div>
          <div className="text-xl font-bold">{fmtMUSD(currentTotalNetWorth)}</div>
          <div className="text-[11px] text-sub mt-0.5">Target: {fmtMUSD(netWorthGoalUSD)}</div>
        </Card>
      </div>

      <ChartPair
        inceptionSeries={inceptionSeries}
        currentSeries={currentSeries}
        cashflowTargetUSD={cashflowGoalUSD}
        netWorthTargetUSD={netWorthGoalUSD}
      />
    </div>
  );
}
```

- [ ] **Step 3: Final verification**

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

All four MUST be clean.

- [ ] **Step 4: Manual smoke test (developer task)**

Assuming `.env.local` is populated with real Supabase credentials and the migration is applied:

1. `pnpm dev`
2. Visit http://localhost:3000 → redirects to /login
3. Sign up with a test email + password
4. Confirm via email link → land on /dashboard
5. Settings → fill in: monthly savings $3,000, external net worth $0.25 (MUSD = $250k), net worth goal $1 (MUSD = $1M), cashflow goal $5 (kUSD = $5k/mo). Save.
6. Amplicons → add a 36-month / 8% / $25k Amplicon starting today
7. Lines of Credit → add a HELOC: size $50,000, utilization $0
8. Dashboard → verify all 5 stats reflect the inputs; charts render with smoothed lines and target dashes; toggle range between "Since inception" and "From current month"

If implementer agent doesn't have real credentials, skip steps 2-8 and report DONE_WITH_CONCERNS.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "Add Dashboard charts (cash flow + net worth) with smoothed lines, target refs, inception/current toggle — MVP complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
