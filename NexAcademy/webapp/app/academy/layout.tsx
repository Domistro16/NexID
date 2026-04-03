import AcademyShell from "./_components/AcademyShell";

export default function AcademyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AcademyShell>{children}</AcademyShell>;
}
