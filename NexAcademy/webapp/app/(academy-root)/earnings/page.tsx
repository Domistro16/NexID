import type { Metadata } from "next";
import AcademyEarningsPage from "../../academy/earnings/page";

export const metadata: Metadata = {
  title: "Earnings",
  robots: {
    index: false,
    follow: true,
  },
};

export default function EarningsPage() {
  return <AcademyEarningsPage />;
}
