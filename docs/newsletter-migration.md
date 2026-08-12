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

## Open decisions before ship

1. **Duplicate content / canonical.** The beehiiv mirror
   (`amplifica-wealth.beehiiv.com/p/...`) will still exist. Our pages set
   canonical to the main domain, but ideally the beehiiv posts should also
   canonical to the main domain, or the beehiiv site set to `noindex`, or the
   subdomain 301'd. Decide the mirror strategy.
2. **Styling polish.** The injected RSS fragment needs a CSS pass to sit cleanly
   in the site theme (`.beehiiv-content` hook is in place).
3. **Nav switch-over.** `src/app/page.tsx` still links "Newsletter" to the
   beehiiv subdomain (`NEWSLETTER_URL`). Point it at `/newsletter` once shipped.
4. **Subscribe CTA.** Add an email-capture form on `/newsletter` (reuse the
   calculator's beehiiv subscribe path) so the first-party page also converts.
5. **Sitemap.** Add `/newsletter` + post URLs to `sitemap.xml`.

## Alternative (fallback)

If native rendering is undesirable, `newsletter.amplificawealth.com` via a
beehiiv custom domain is the lower-effort option — better than `beehiiv.com`,
but a subdomain, not a true subpath, and it forfeits full first-party control.
