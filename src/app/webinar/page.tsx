import type { Metadata } from "next";
import WebinarSignup from "@/features/webinar/ui/WebinarSignup";
import { WEBINAR } from "@/features/webinar/event";
import PublicHeader from "@/shared/ui/public/PublicHeader";
import PublicFooter from "@/shared/ui/public/PublicFooter";

export const metadata: Metadata = {
  title: "Webinar",
  description: WEBINAR.dateLine,
  alternates: { canonical: "/webinar" },
  openGraph: {
    title: "Webinar | Amplifica Wealth",
    description: WEBINAR.dateLine,
    type: "website",
    url: "/webinar",
  },
};

export default function WebinarPage({
  searchParams,
}: {
  searchParams: { utm_source?: string; utm_medium?: string; utm_campaign?: string };
}) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <PublicHeader />

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-display text-2xl mb-2">Live webinar</h1>
        <p className="text-sm text-sub leading-relaxed mb-6">{WEBINAR.dateLine}</p>
        <WebinarSignup utm={searchParams} />
      </main>

      <PublicFooter />
    </div>
  );
}
