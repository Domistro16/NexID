import prisma from "@/lib/prisma";

export async function resolveCampaignId(idOrSlug: string): Promise<number | null> {
  const numericId = Number(idOrSlug);
  if (Number.isInteger(numericId) && numericId > 0) {
    return numericId;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { slug: idOrSlug },
    select: { id: true },
  });

  return campaign?.id ?? null;
}
