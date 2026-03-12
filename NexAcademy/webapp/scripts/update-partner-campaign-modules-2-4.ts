import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeCampaignModules, type CampaignModuleGroup } from "../lib/campaign-modules";

const prisma = new PrismaClient();

const NEW_MODULES_2_TO_4: CampaignModuleGroup[] = [
  {
    title: "Module 2",
    items: [
      {
        type: "video",
        title: "2.1 - The Big Umbrella of UX",
        videoUrl: "https://share.synthesia.io/embeds/videos/a5644c21-c843-4661-a0d1-09c2e0ecb1d7",
      },
      {
        type: "video",
        title: "2.2 - Context & The Empty State",
        videoUrl: "https://share.synthesia.io/embeds/videos/8cfb6f2f-cebc-4473-95e5-c24d9aacdba2",
      },
      {
        type: "video",
        title: "2.3 - Designing the Conversation",
        videoUrl: "https://share.synthesia.io/embeds/videos/c452546e-bea9-4567-abc1-c69f7ff9fdfd",
      },
    ],
  },
  {
    title: "Module 3",
    items: [
      {
        type: "video",
        title: "3.1 - Gradual Engagement",
        videoUrl: "https://share.synthesia.io/embeds/videos/158777d9-0d75-483c-85ab-b4ec1c6a1f2a",
      },
      {
        type: "video",
        title: "3.2 - Simple on the Surface",
        videoUrl: "https://share.synthesia.io/embeds/videos/94144bc5-2716-42a2-8c5a-41e4ae1fdeb9",
      },
      {
        type: "video",
        title: "3.3 Trust Indicators & Security UX",
        videoUrl: "https://share.synthesia.io/embeds/videos/c3b6208e-9ecd-4d35-87f3-01f82fb9b665",
      },
      {
        type: "video",
        title: "3.4 Designing for Everyone",
        videoUrl: "https://share.synthesia.io/embeds/videos/798df0d7-5dbf-42e0-9532-4ae820f1d21f",
      },
    ],
  },
  {
    title: "Module 4",
    items: [
      {
        type: "video",
        title: "4.1 - The AI-Powered Design Sprint",
        videoUrl: "https://share.synthesia.io/embeds/videos/6d2dec7a-caa5-4f04-bae7-028e83d5d7a8",
      },
      {
        type: "video",
        title: "4.2 - Testing with Real Users",
        videoUrl: "https://share.synthesia.io/embeds/videos/e809b8a2-ec9e-46de-aa78-26bc94f715e9",
      },
      {
        type: "video",
        title: "4.3 - Are We Done?",
        videoUrl: "https://share.synthesia.io/embeds/videos/ce4a84d9-8f9d-468c-92e5-0e8dc0ceb4d4",
      },
      {
        type: "video",
        title: "4.4 - Product-Led Growth",
        videoUrl: "https://share.synthesia.io/embeds/videos/d689976d-97a5-4780-9e3e-a074b28d9cd5",
      },
    ],
  },
];

function getCampaignIdFromArgs(): number | null {
  const arg = process.argv.find((entry) => entry.startsWith("--campaignId="));
  if (!arg) {
    return null;
  }
  const value = Number(arg.split("=")[1]);
  return Number.isFinite(value) ? value : null;
}

function isModule2To4Title(value: string): boolean {
  return /^module\s*[234]\b/i.test(value.trim());
}

async function resolveTargetCampaignId(): Promise<number> {
  const fromArg = getCampaignIdFromArgs();
  if (fromArg !== null) {
    return fromArg;
  }

  const partnerCampaigns = await prisma.campaign.findMany({
    where: { contractType: "PARTNER_CAMPAIGNS" },
    select: { id: true, title: true },
    orderBy: { id: "asc" },
  });

  if (partnerCampaigns.length === 1) {
    return partnerCampaigns[0].id;
  }

  if (partnerCampaigns.length === 0) {
    throw new Error("No partner campaign found.");
  }

  const options = partnerCampaigns
    .map((campaign) => `id=${campaign.id} (${campaign.title})`)
    .join(", ");
  throw new Error(
    `Found ${partnerCampaigns.length} partner campaigns. Re-run with --campaignId=<id>. Options: ${options}`,
  );
}

async function updateModules() {
  const dryRun = process.argv.includes("--dry-run");
  const replaceAll = process.argv.includes("--replace-all");
  const campaignId = await resolveTargetCampaignId();

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, title: true, contractType: true, modules: true },
  });

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }
  if (campaign.contractType !== "PARTNER_CAMPAIGNS") {
    throw new Error(`Campaign ${campaignId} is not a partner campaign.`);
  }

  const existingModules = normalizeCampaignModules(campaign.modules);
  const nextModules: CampaignModuleGroup[] = replaceAll
    ? [...NEW_MODULES_2_TO_4]
    : (() => {
        const module1 = existingModules[0] ? [existingModules[0]] : [];
        const extraModules = existingModules
          .slice(1)
          .filter((module) => !isModule2To4Title(module.title));
        return [...module1, ...NEW_MODULES_2_TO_4, ...extraModules];
      })();

  console.log(`Target campaign: ${campaign.id} (${campaign.title})`);
  console.log(`Existing grouped modules: ${existingModules.length}`);
  console.log(`New grouped modules: ${nextModules.length}`);
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
  console.log(`Replace all modules: ${replaceAll ? "yes" : "no"}`);

  if (dryRun) {
    console.log(JSON.stringify(nextModules, null, 2));
    return;
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      modules: nextModules as unknown as Prisma.InputJsonValue,
    },
  });

  console.log("Campaign modules updated successfully.");
}

updateModules()
  .catch((error) => {
    console.error("Failed to update partner campaign modules:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
