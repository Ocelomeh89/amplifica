import { getResultByToken } from "@/features/quiz/data/results";
import { buildResultPdf } from "@/features/quiz/pdf/buildResultPdf";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const result = await getResultByToken(params.token);
  if (!result) return new Response("Not found", { status: 404 });

  const bytes = await buildResultPdf({
    name: result.name,
    archetype: result.archetype,
    runnerUp: result.runnerUp,
    createdAt: result.createdAt,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="amplifica-investor-profile.pdf"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
