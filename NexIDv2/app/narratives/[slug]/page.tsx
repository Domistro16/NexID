import { redirect } from "next/navigation";

export default async function NarrativeDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  await params;
  redirect("/pulse");
}
