import { absoluteUrl, DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME } from "@/lib/seo";

export function SiteStructuredData() {
  const graph = [
    {
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      logo: absoluteUrl("/nexmarkets-logo-light.png")
    },
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      description: DEFAULT_DESCRIPTION,
      publisher: { "@id": absoluteUrl("/#organization") },
      inLanguage: "en-US"
    },
    {
      "@type": "WebApplication",
      "@id": absoluteUrl("/#webapp"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: DEFAULT_TITLE,
      browserRequirements: "Requires JavaScript and a web3 wallet for trading actions."
    }
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": graph
        })
      }}
    />
  );
}
