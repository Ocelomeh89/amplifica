import { notFound } from "next/navigation";
import { requireUser } from "@/shared/supabase/auth";
import EditorForm from "@/features/projections/ui/EditorForm";

export default async function ProjectionEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const { supabase } = await requireUser();

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
