import { requireContentOwner } from "@/features/content/data/owner";

export default async function ContentInboxPage() {
  await requireContentOwner();
  return <h1 className="text-xl font-semibold">Content</h1>;
}
