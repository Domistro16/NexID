import CampaignDetailClient from "./CampaignDetailClient";

interface CampaignPageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  return <CampaignDetailClient campaignId={id} />;
}
