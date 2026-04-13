import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import CampaignDetailClient from "../../../academy/campaign/[id]/CampaignDetailClient";
import { absoluteUrl, resolveSeoImage, truncateDescription } from "@/lib/seo";

interface CampaignPageProps {
  params: Promise<{ id: string }>;
}

async function getCampaignSeoRecord(id: string) {
  const campaignId = Number(id);
  return prisma.campaign.findFirst({
    where: {
      ...(Number.isFinite(campaignId) ? { id: campaignId } : { slug: id }),
      isPublished: true,
      status: { in: ["LIVE", "ENDED"] },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      objective: true,
      sponsorName: true,
      coverImageUrl: true,
      updatedAt: true,
    },
  });
}

export async function generateMetadata({ params }: CampaignPageProps): Promise<Metadata> {
  const { id } = await params;
  const campaign = await getCampaignSeoRecord(id);

  if (!campaign) {
    return {
      title: "Campaign",
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const description = truncateDescription(campaign.objective, 160);
  const image = resolveSeoImage(campaign.coverImageUrl);
  const path = `/campaign/${campaign.slug || campaign.id}`;

  return {
    title: campaign.title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "article",
      url: path,
      title: campaign.title,
      description,
      images: [
        {
          url: image,
          alt: campaign.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: campaign.title,
      description,
      images: [image],
    },
  };
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  const campaign = await getCampaignSeoRecord(id);

  const structuredData = campaign
    ? {
        "@context": "https://schema.org",
        "@type": "Course",
        name: campaign.title,
        description: truncateDescription(campaign.objective, 220),
        provider: {
          "@type": "Organization",
          name: campaign.sponsorName,
        },
        url: absoluteUrl(`/campaign/${campaign.slug || campaign.id}`),
        image: resolveSeoImage(campaign.coverImageUrl),
        dateModified: campaign.updatedAt.toISOString(),
      }
    : null;

  return (
    <>
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      ) : null}
      <CampaignDetailClient campaignId={id} />
    </>
  );
}
