import { ReviewerWorkbench } from "../../../components/reviewer-workbench";

export default async function ReviewerCasePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReviewerWorkbench initialView="case" initialCaseId={id} />;
}
