import fs from "node:fs/promises";
import path from "node:path";

type CampaignAdminSection = "campaigns" | "builder" | "quiz" | "users" | "bots" | "settings";
type SearchParams = Record<string, string | string[] | undefined>;

const VALID_SECTIONS = new Set<CampaignAdminSection>([
  "campaigns",
  "builder",
  "quiz",
  "users",
  "bots",
  "settings",
]);

function normalizeSection(rawValue: string | string[] | undefined): CampaignAdminSection {
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  return value && VALID_SECTIONS.has(value as CampaignAdminSection)
    ? (value as CampaignAdminSection)
    : "campaigns";
}

function buildSectionBootstrap(section: CampaignAdminSection) {
  if (section === "campaigns") {
    return "";
  }

  return `
<script>
(function () {
  var section = ${JSON.stringify(section)};
  var railIndexBySection = {
    campaigns: 0,
    builder: 1,
    quiz: 2,
    users: 3,
    bots: 4,
    settings: 5
  };

  function activateSection() {
    var buttons = document.querySelectorAll('.rail-btn');
    var target = buttons[railIndexBySection[section]];
    if (target && typeof target.click === 'function') {
      target.click();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(activateSection, 0);
    });
  } else {
    window.setTimeout(activateSection, 0);
  }
})();
</script>`;
}

async function loadCampaignAdminHtml(section: CampaignAdminSection) {
  const templatePath = path.join(
    process.cwd(),
    "app",
    "admin",
    "campaigns",
    "_template",
    "nexid-admin.html",
  );
  const template = await fs.readFile(templatePath, "utf8");
  return template.replace("</body>", `${buildSectionBootstrap(section)}</body>`);
}

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const section = normalizeSection(resolvedSearchParams.section);
  const srcDoc = await loadCampaignAdminHtml(section);

  return (
    <div className="h-screen w-full bg-black">
      <iframe
        key={section}
        title="Campaign Admin"
        srcDoc={srcDoc}
        className="h-full w-full border-0"
      />
    </div>
  );
}
