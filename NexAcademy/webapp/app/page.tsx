import type { Metadata } from "next";
import AcademyShell from "./academy/_components/AcademyShell";
import AcademyBrowsePage from "./academy/page";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Interactive campaigns, AI assessments, and portable reputation",
  description:
    "Browse live campaigns, complete AI-graded learning flows, and build a portable on-chain reputation profile with NexID.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: "Interactive campaigns, AI assessments, and portable reputation",
    description:
      "Browse live campaigns, complete AI-graded learning flows, and build a portable on-chain reputation profile with NexID.",
    images: [
      {
        url: absoluteUrl("/nexid_logo.png"),
        alt: "NexID",
      },
    ],
  },
};

export default function RootPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "NexID",
        url: absoluteUrl("/"),
        logo: absoluteUrl("/nexid_logo.png"),
      },
      {
        "@type": "WebSite",
        name: "NexID",
        url: absoluteUrl("/"),
        potentialAction: {
          "@type": "SearchAction",
          target: `${absoluteUrl("/")}?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <AcademyShell>
        <AcademyBrowsePage />
      </AcademyShell>
    </>
  );
}
