import PublicHeader from "@/shared/ui/public/PublicHeader";
import PublicFooter from "@/shared/ui/public/PublicFooter";

/** Page frame for the quiz and its results: shared public header and footer, one centered column. */
export default function QuizShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <PublicHeader />
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">{children}</main>
      <PublicFooter />
    </div>
  );
}
