import { PrismaClient } from "@prisma/client";
import {
  buildPartnerModuleGroupsFromItems,
  campaignModulesAreGrouped,
  flattenCampaignModuleItems,
  type CampaignModuleGroup,
  normalizeCompletedUntil,
} from "../lib/campaign-modules";

const prisma = new PrismaClient();

async function ensureCompletedUntilColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "CampaignParticipant"
    ADD COLUMN IF NOT EXISTS "completedUntil" INTEGER NOT NULL DEFAULT -1
  `);
}

async function migratePartnerCampaignModules() {
  console.log("Starting partner campaign module migration...");
  await ensureCompletedUntilColumn();

  const campaigns = await prisma.campaign.findMany({
    where: { contractType: "PARTNER_CAMPAIGNS" },
    select: { id: true, title: true, modules: true },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${campaigns.length} partner campaign(s).`);

  let updatedCampaigns = 0;
  let migratedParticipants = 0;

  for (const campaign of campaigns) {
    const existingModules = campaign.modules;
    const flatItems = flattenCampaignModuleItems(existingModules);
    const isAllVideoCampaign = flatItems.length > 0 && flatItems.every((item) => item.type === "video");
    const alreadyGrouped = campaignModulesAreGrouped(existingModules);
    const groupedModules: CampaignModuleGroup[] = isAllVideoCampaign
      ? [{ title: "Module 1", items: flatItems }]
      : buildPartnerModuleGroupsFromItems(flatItems);

    const participants = await prisma.$queryRaw<
      Array<{ id: string; completedUntil: number }>
    >`
      SELECT
        "id",
        COALESCE("completedUntil", -1) AS "completedUntil"
      FROM "CampaignParticipant"
      WHERE "campaignId" = ${campaign.id}
    `;

    for (const participant of participants) {
      const normalizedCompletedUntil = isAllVideoCampaign
        ? (flatItems.length > 0 && participant.completedUntil >= 0 ? 0 : -1)
        : normalizeCompletedUntil(existingModules, participant.completedUntil);
      if (normalizedCompletedUntil !== participant.completedUntil) {
        await prisma.$executeRaw`
          UPDATE "CampaignParticipant"
          SET "completedUntil" = ${normalizedCompletedUntil}, "updatedAt" = NOW()
          WHERE "id" = ${participant.id}
        `;
        migratedParticipants += 1;
      }
    }

    const shouldUpdateModules =
      groupedModules.length > 0 &&
      (!alreadyGrouped || isAllVideoCampaign) &&
      JSON.stringify(existingModules) !== JSON.stringify(groupedModules);

    if (shouldUpdateModules) {
      await prisma.$executeRaw`
        UPDATE "Campaign"
        SET "modules" = ${JSON.stringify(groupedModules)}::jsonb, "updatedAt" = NOW()
        WHERE "id" = ${campaign.id}
      `;
      updatedCampaigns += 1;
      console.log(
        `Converted campaign ${campaign.id} (${campaign.title}) to ${groupedModules.length} grouped module(s).`,
      );
    }
  }

  console.log("Migration complete.");
  console.log(`Campaigns updated: ${updatedCampaigns}`);
  console.log(`Participant progress rows migrated: ${migratedParticipants}`);
}

migratePartnerCampaignModules()
  .catch((error) => {
    console.error("Partner campaign module migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
