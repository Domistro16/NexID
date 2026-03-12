type CampaignRewardContext = {
  ownerType?: string | null;
  contractType?: string | null;
  sponsorName?: string | null;
  sponsorNamespace?: string | null;
};

export function isInternalCoreCampaign(campaign: CampaignRewardContext): boolean {
  return campaign.ownerType === "NEXID" || campaign.contractType === "NEXID_CAMPAIGNS";
}

export function isGenesisRewardCampaign(campaign: CampaignRewardContext): boolean {
  if (isInternalCoreCampaign(campaign)) {
    return false;
  }

  const sponsor = campaign.sponsorName?.toLowerCase() ?? "";
  const sponsorNamespace = campaign.sponsorNamespace?.toLowerCase() ?? "";

  return sponsor.includes("nexid") || sponsorNamespace.includes("nexid");
}

export function getCampaignCompletionPoints(campaign: CampaignRewardContext): number {
  return isGenesisRewardCampaign(campaign) ? 100 : 0;
}
