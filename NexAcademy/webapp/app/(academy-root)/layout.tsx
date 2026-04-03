import AcademyShell from "../academy/_components/AcademyShell";

export default function AcademyRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AcademyShell>{children}</AcademyShell>;
}
