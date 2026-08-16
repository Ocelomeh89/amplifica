# Newsletter on the main domain (`/newsletter`)

Goal: serve newsletter posts at `amplificawealth.com/newsletter` instead of the
beehiiv subdomain, so SEO authority accrues to the root domain.

## Feasibility

- **beehiiv cannot host a subpath** (`/newsletter`) on our apex domain. beehiiv
  custom domains are host-level only (e.g. `newsletter.amplificawealth.com`), not
  path-level. So a true `/newsletter` subpath is only achievable by rendering
  posts **natively in this Next app**.
- The beehiiv **v2 API works** on our plan and returns post content. We use
  `content.free.rss` — a clean, self-contained article fragment with scoped
  `.beehiiv` styles — NOT `content.free.web`, which is a full standalone HTML
  document that can't be embedded.

## What's built (this branch — WIP, not deployed)

- `src/lib/beehiiv.ts` — added read-only client: `listNewsletterPosts`,
  `listNewsletterSlugs`, `getNewsletterPost(slug)`. (Existing
  `subscribeToNewsletter` untouched.)
- `src/app/newsletter/page.tsx` — index/listing (metadata-driven, 1h ISR).
- `src/app/newsletter/[slug]/page.tsx` — post render via RSS fragment, canonical
  set to the main-domain URL, 1h ISR, `generateStaticParams` for known slugs.

## Decision (2026-08)

**Native render on the main domain + hide the beehiiv web version.** The main
domain is the single canonical, indexed home for posts; beehiiv stays for email
sending only. Chosen because beehiiv posts have ~zero indexation today, so
there's no equity to migrate and no redirect debt.

## Done (this branch)

1. **Canonical.** `/newsletter/[slug]` sets canonical to the main-domain URL.
2. **Styling.** `.beehiiv-content` rules in `globals.css` fit the RSS fragment
   to the site theme (responsive media, brand links, readable measure).
3. **Nav switch-over.** `src/app/page.tsx` and `calculator/InfoSections.tsx` now
   link "Newsletter" to `/newsletter` instead of the beehiiv subdomain.
4. **Subscribe CTA.** `/newsletter` has an email-capture form
   (`newsletter/actions.ts`) reusing the durable lead + beehiiv subscribe path
   (attributed `utm_source=newsletter`).
5. **Sitemap.** `sitemap.ts` is async and includes `/newsletter` + every post.

## Remaining before/after merge

- **Beehiiv dashboard (you): hide the web version from search** so the main
  domain is the only indexed copy. Options in beehiiv settings: disable the
  website / make posts email-only, or set the site to noindex. (MCP can't write
  these; do it in the dashboard.)
- **Rebase/merge** this branch onto current `main` (which now has the auth fix).
- **Verify** live: `/newsletter` lists posts, a post renders, sitemap includes
  the URLs, and the beehiiv site no longer competes in search.

## Alternative (not chosen)

`newsletter.amplificawealth.com` via a beehiiv custom domain — lower effort but
a subdomain, not a true subpath, and forfeits first-party HTML/SEO control.
