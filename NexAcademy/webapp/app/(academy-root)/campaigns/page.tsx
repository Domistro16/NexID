import type { Metadata } from "next";
import AcademyBrowsePage from "../../academy/page";

export const metadata: Metadata = {
  title: "Campaign library",
  description:
    "Browse NexID campaign learning tracks, assessments, and verification flows.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function CampaignsPage() {
  return <AcademyBrowsePage />;
}
