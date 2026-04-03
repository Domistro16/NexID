import type { Metadata } from "next";
import AcademyFaqPage from "../../academy/faq/page";

export const metadata: Metadata = {
  title: "Protocol FAQ",
  description:
    "Architecture, verification, and reward-flow documentation for NexID campaigns.",
  alternates: {
    canonical: "/faq",
  },
};

export default function FaqPage() {
  return <AcademyFaqPage />;
}
