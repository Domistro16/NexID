import type { Metadata } from "next";
import AcademyDashboardPage from "../../academy/dashboard/page";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: {
    index: false,
    follow: true,
  },
};

export default function DashboardPage() {
  return <AcademyDashboardPage />;
}
