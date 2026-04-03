import AcademyShell from "./academy/_components/AcademyShell";
import AcademyBrowsePage from "./academy/page";

export default function RootPage() {
  return (
    <AcademyShell>
      <AcademyBrowsePage />
    </AcademyShell>
  );
}
