import type { Metadata } from "next";
import Link from "next/link";
import { listNewsletterPosts, type NewsletterListItem } from "@/lib/beehiiv";
import { subscribe } from "./actions";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Newsletter — Amplifica Wealth" },
  description:
    "The weekly Amplifica Wealth letter: turning consistent savings into monthly investment income, with real numbers and no promised returns.",
  alternates: { canonical: "/newsletter" },
  openGraph: {
    title: "The Amplifica Wealth letter",
    description:
      "Turn consistent savings into monthly investment income. Real numbers, weekly.",
    type: "website",
    url: "/newsletter",
  },
};

function formatDate(d: Date | null) {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function NewsletterIndex({
  searchParams,
}: {
  searchParams: { subscribed?: string; error?: string };
}) {
  let posts: NewsletterListItem[] = [];
  let failed = false;
  try {
    posts = await listNewsletterPosts();
  } catch {
    failed = true;
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="max-w-3xl mx-auto px-6 pt-16 pb-10">
        <p className="text-sm tracking-wide text-purple mb-4">The weekly letter</p>
        <h1 className="text-4xl sm:text-5xl leading-tight">Newsletter</h1>
        <p className="mt-5 text-base text-sub leading-relaxed max-w-xl">
          Turning consistent savings into monthly investment income — the math, the
          wins, and the expensive lessons, with real numbers. No promised returns.
        </p>

        {searchParams.subscribed ? (
          <p className="mt-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
            You&apos;re in. Check your inbox to confirm.
          </p>
        ) : (
          <form action={subscribe} className="mt-6 flex flex-col sm:flex-row gap-3 max-w-md">
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="you@email.com"
              aria-label="Email address"
              className="flex-1 border border-edge rounded px-3 py-2 text-sm bg-card"
            />
            <button
              type="submit"
              className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-5 py-2 rounded whitespace-nowrap"
            >
              Subscribe
            </button>
          </form>
        )}
        {searchParams.error && (
          <p className="mt-3 text-sm text-red-700">Please enter a valid email address.</p>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 pb-24">
        {failed && (
          <p className="text-sm text-sub">
            The letter is loading elsewhere right now. Please check back shortly.
          </p>
        )}
        {!failed && posts.length === 0 && (
          <p className="text-sm text-sub">No issues published yet.</p>
        )}
        <ul className="divide-y divide-edge">
          {posts.map((post) => (
            <li key={post.id} className="py-8">
              <Link href={`/newsletter/${post.slug}`} className="group block">
                <time className="text-xs uppercase tracking-wide text-sub">
                  {formatDate(post.publishedAt)}
                </time>
                <h2 className="mt-2 text-2xl leading-snug group-hover:text-purple transition-colors">
                  {post.title}
                </h2>
                {post.subtitle && (
                  <p className="mt-2 text-sm text-sub leading-relaxed">{post.subtitle}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
