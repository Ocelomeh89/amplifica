import type { Metadata } from "next";
import Link from "next/link";
import { listNewsletterPosts, type NewsletterListItem } from "@/lib/beehiiv";

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

export default async function NewsletterIndex() {
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
