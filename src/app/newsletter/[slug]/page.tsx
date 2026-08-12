import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNewsletterPost, listNewsletterSlugs } from "@/lib/beehiiv";

export const revalidate = 3600;

// Pre-render known posts at build; new slugs are rendered on demand and cached.
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    return (await listNewsletterSlugs()).map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

function formatDate(d: Date | null) {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await getNewsletterPost(params.slug).catch(() => null);
  if (!post) return {};
  return {
    title: { absolute: post.metaTitle },
    description: post.metaDescription ?? undefined,
    // Canonical points at the main domain so it — not the beehiiv mirror —
    // is the version search engines index.
    alternates: { canonical: `/newsletter/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.metaDescription ?? undefined,
      type: "article",
      url: `/newsletter/${post.slug}`,
    },
  };
}

export default async function NewsletterPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getNewsletterPost(params.slug).catch(() => null);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-cream text-ink">
      <article className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        <Link href="/newsletter" className="text-sm text-purple hover:underline">
          ← All issues
        </Link>
        <header className="mt-6">
          <time className="text-xs uppercase tracking-wide text-sub">
            {formatDate(post.publishedAt)}
          </time>
          <h1 className="mt-2 text-4xl leading-tight">{post.title}</h1>
          {post.subtitle && (
            <p className="mt-4 text-lg text-sub leading-relaxed">{post.subtitle}</p>
          )}
        </header>

        {post.bodyHtml ? (
          // beehiiv RSS content is a self-contained fragment with scoped
          // `.beehiiv` styles. WIP: styling still needs a polish pass to sit
          // cleanly inside the site theme.
          <div
            className="mt-10 beehiiv-content"
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
          />
        ) : (
          <p className="mt-10 text-sm text-sub">
            This issue is available on our{" "}
            <a href={post.beehiivUrl ?? "#"} className="text-purple hover:underline">
              newsletter page
            </a>
            .
          </p>
        )}
      </article>
    </div>
  );
}
