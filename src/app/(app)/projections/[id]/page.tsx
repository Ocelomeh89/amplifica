import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditorForm from "./EditorForm";

export default async function ProjectionEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projection, error } = await supabase
    .from("projections")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error || !projection) notFound();

  return (
    <div className="max-w-5xl">
      <EditorForm projection={projection} justSaved={Boolean(searchParams.saved)} />
    </div>
  );
}
