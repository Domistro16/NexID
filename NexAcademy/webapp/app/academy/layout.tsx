import type { Metadata } from "next";
import AcademyShell from "./_components/AcademyShell";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function AcademyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AcademyShell>{children}</AcademyShell>;
}
