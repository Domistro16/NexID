import type { Metadata } from "next";
import AcademyIdentityPage from "../../academy/identity/page";

export const metadata: Metadata = {
  title: "Identity",
  robots: {
    index: false,
    follow: true,
  },
};

export default function IdentityPage() {
  return <AcademyIdentityPage />;
}
