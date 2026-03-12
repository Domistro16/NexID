import LandingFooter from "@/components/LandingFooter";
import LandingNavbar from "@/components/LandingNavbar";

type TermsBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "list";
      items: string[];
    }
  | {
      type: "contact";
      prefix: string;
      email: string;
    };

type TermsSection = {
  number: string;
  title: string;
  blocks: TermsBlock[];
};

const termsSections: TermsSection[] = [
  {
    number: "01.",
    title: "About NexID",
    blocks: [
      {
        type: "paragraph",
        text: "NexID provides an interactive education and identity infrastructure platform designed for Web3 users, builders, and organizations. The platform may include features such as:",
      },
      {
        type: "list",
        items: [
          "AI-powered educational content and interactive learning experiences",
          "On-chain credential issuance",
          "Blockchain-based identity domains (.id domains)",
          "Reputation and trust scoring systems",
          "Campaign participation systems for partner projects",
          "Referral reward systems",
          "Payment and invoicing tools associated with domain identities",
          "APIs for developers and AI agent domain minting",
        ],
      },
      {
        type: "paragraph",
        text: "NexID may modify, expand, or discontinue features at any time.",
      },
    ],
  },
  {
    number: "02.",
    title: "Eligibility",
    blocks: [
      {
        type: "paragraph",
        text: "To use NexID, you must:",
      },
      {
        type: "list",
        items: [
          "Be at least 18 years old",
          "Have the legal capacity to enter into binding agreements",
          "Comply with all applicable laws and regulations",
        ],
      },
      {
        type: "paragraph",
        text: "By using the Services, you represent and warrant that you meet these requirements.",
      },
    ],
  },
  {
    number: "03.",
    title: "Accounts and Wallet Access",
    blocks: [
      {
        type: "paragraph",
        text: "Some features of the platform may require users to create an account or connect a digital wallet. Users are responsible for:",
      },
      {
        type: "list",
        items: [
          "Maintaining the security of their accounts",
          "Safeguarding private keys and wallet credentials",
          "All activities conducted through their accounts or wallets",
        ],
      },
      {
        type: "paragraph",
        text: "NexID does not store or control users private keys and cannot recover lost wallet access. NexID is not responsible for any loss of digital assets due to compromised accounts, lost credentials, or wallet errors.",
      },
    ],
  },
  {
    number: "04.",
    title: "Blockchain and Smart Contract Services",
    blocks: [
      {
        type: "paragraph",
        text: "Certain NexID services operate using blockchain networks and smart contracts. By interacting with these services, users acknowledge that:",
      },
      {
        type: "list",
        items: [
          "Blockchain transactions are irreversible",
          "Network congestion or failures may occur",
          "Transaction fees may change or vary",
          "NexID does not control blockchain networks",
        ],
      },
      {
        type: "paragraph",
        text: "Users assume full responsibility for any blockchain transactions they initiate.",
      },
    ],
  },
  {
    number: "05.",
    title: "NexID Domains (.id Domains)",
    blocks: [
      {
        type: "paragraph",
        text: "NexID provides blockchain-based identity domains known as .id domains. These domains may be minted and stored in compatible digital wallets and may be used for purposes such as:",
      },
      {
        type: "list",
        items: [
          "Representing a Web3 identity",
          "Storing educational credentials",
          "Maintaining reputation or trust scores",
          "Generating payment links or invoices",
          "Participating in referral programs",
          "Accessing platform features",
        ],
      },
      {
        type: "paragraph",
        text: "Ownership of a domain is determined by the applicable blockchain smart contract. NexID does not guarantee permanent availability of domain-related services or utilities.",
      },
    ],
  },
  {
    number: "06.",
    title: "Domain Pricing and Distribution",
    blocks: [
      {
        type: "paragraph",
        text: "Domain mint pricing may vary depending on factors such as:",
      },
      {
        type: "list",
        items: [
          "Domain length",
          "Rarity classification",
          "Campaign distribution rules",
          "Special promotional allocations",
        ],
      },
      {
        type: "paragraph",
        text: "NexID reserves the right to modify pricing or minting structures at any time. Certain domains may be distributed through educational or promotional campaigns.",
      },
    ],
  },
  {
    number: "07.",
    title: "AI Agent Domains and API Access",
    blocks: [
      {
        type: "paragraph",
        text: "NexID may allow domains to be minted for automated systems or AI agents via APIs. Such access may be subject to:",
      },
      {
        type: "list",
        items: [
          "Rate limits",
          "Technical compliance requirements",
          "Restricted transferability of certain domains",
        ],
      },
      {
        type: "paragraph",
        text: "Developers and users deploying automated systems are responsible for ensuring that such systems comply with applicable laws and ethical standards.",
      },
    ],
  },
  {
    number: "08.",
    title: "Educational Content",
    blocks: [
      {
        type: "paragraph",
        text: "NexID hosts educational materials including video lessons, quizzes, interactive learning modules, and gamified experiences. Completion of courses or campaigns may result in the issuance of:",
      },
      {
        type: "list",
        items: ["Digital credentials", "Points or rewards", "Reputation scores", "Domain allocations"],
      },
      {
        type: "paragraph",
        text: "These credentials are informational in nature. NexID does not guarantee that any credential or score will have professional, financial, or employment value.",
      },
    ],
  },
  {
    number: "09.",
    title: "Campaign Participation",
    blocks: [
      {
        type: "paragraph",
        text: "NexID may host educational or engagement campaigns in partnership with third-party projects. Participation in campaigns may require users to:",
      },
      {
        type: "list",
        items: [
          "Complete educational tasks",
          "Perform social actions",
          "Interact with external blockchain applications",
        ],
      },
      {
        type: "paragraph",
        text: "Campaign rules may vary depending on the partner project. NexID is not responsible for the products, services, or representations of third-party campaign partners.",
      },
    ],
  },
  {
    number: "10.",
    title: "Referral Programs",
    blocks: [
      {
        type: "paragraph",
        text: "Users who own NexID domains may participate in referral programs. Referral programs may allow users to earn rewards when others mint domains through their referral links. NexID reserves the right to:",
      },
      {
        type: "list",
        items: [
          "Modify referral reward structures",
          "Suspend or terminate referral programs",
          "Revoke rewards obtained through manipulation or abuse",
        ],
      },
    ],
  },
  {
    number: "11.",
    title: "Reputation Scores and Wallet Analytics",
    blocks: [
      {
        type: "paragraph",
        text: "NexID may generate wallet scores, trust scores, or reputation metrics using blockchain data and third-party analytics services. These scores are informational only and may not be accurate or complete. Users should not rely on these metrics for financial, legal, or professional decisions.",
      },
    ],
  },
  {
    number: "12.",
    title: "Payment Links and Invoicing",
    blocks: [
      {
        type: "paragraph",
        text: "NexID domains may include functionality allowing users to generate payment requests or invoice links. NexID does not act as:",
      },
      {
        type: "list",
        items: ["A financial institution", "A payment processor", "An escrow service"],
      },
      {
        type: "paragraph",
        text: "Users are solely responsible for transactions conducted using these features and for complying with tax or financial regulations.",
      },
    ],
  },
  {
    number: "13.",
    title: "Intellectual Property",
    blocks: [
      {
        type: "paragraph",
        text: "All platform software, branding, design, educational content, and materials are owned by NexID or its licensors. Users may not copy, reproduce, distribute, or create derivative works from NexID materials without written permission.",
      },
    ],
  },
  {
    number: "14.",
    title: "Acceptable Use",
    blocks: [
      {
        type: "paragraph",
        text: "Users agree not to use the platform to:",
      },
      {
        type: "list",
        items: [
          "Exploit technical vulnerabilities",
          "Manipulate reward systems",
          "Operate bot networks or automated farming systems",
          "Violate intellectual property rights",
          "Distribute harmful or illegal content",
          "Misuse APIs or infrastructure",
        ],
      },
      {
        type: "paragraph",
        text: "NexID reserves the right to suspend or terminate accounts that violate these rules.",
      },
    ],
  },
  {
    number: "15.",
    title: "Third-Party Services",
    blocks: [
      {
        type: "paragraph",
        text: "NexID integrates with external services and technologies, including but not limited to:",
      },
      {
        type: "list",
        items: [
          "Blockchain networks",
          "AI video infrastructure providers",
          "Authentication services",
          "Analytics providers",
        ],
      },
      {
        type: "paragraph",
        text: "NexID is not responsible for outages, security incidents, or policy changes affecting these third-party services.",
      },
    ],
  },
  {
    number: "16.",
    title: "Disclaimer of Warranties",
    blocks: [
      {
        type: "paragraph",
        text: "The NexID platform and all services are provided as is and as available. NexID makes no guarantees regarding:",
      },
      {
        type: "list",
        items: [
          "Continuous availability of the platform",
          "Performance of blockchain networks",
          "Financial value of digital assets or domains",
          "Market demand for domains or credentials",
          "Results from educational programs",
        ],
      },
      {
        type: "paragraph",
        text: "Use of the platform is at the users own risk.",
      },
    ],
  },
  {
    number: "17.",
    title: "Limitation of Liability",
    blocks: [
      {
        type: "paragraph",
        text: "To the maximum extent permitted by law, NexID and its team members shall not be liable for:",
      },
      {
        type: "list",
        items: [
          "Loss of digital assets",
          "Blockchain transaction errors",
          "Lost profits or revenue",
          "Service interruptions",
          "Indirect or consequential damages",
        ],
      },
      {
        type: "paragraph",
        text: "Total liability shall not exceed the amount paid by the user to NexID for the specific service giving rise to the claim.",
      },
    ],
  },
  {
    number: "18.",
    title: "Changes to the Platform",
    blocks: [
      {
        type: "paragraph",
        text: "NexID may update or modify any aspect of the platform at any time, including:",
      },
      {
        type: "list",
        items: ["Platform features", "Reward programs", "Pricing structures", "Domain utilities"],
      },
      {
        type: "paragraph",
        text: "These changes may occur without prior notice.",
      },
    ],
  },
  {
    number: "19.",
    title: "Suspension or Termination",
    blocks: [
      {
        type: "paragraph",
        text: "NexID reserves the right to suspend or terminate access to the platform if:",
      },
      {
        type: "list",
        items: [
          "Users violate these Terms",
          "Fraudulent or abusive activity is detected",
          "Legal or regulatory requirements require such action",
        ],
      },
      {
        type: "paragraph",
        text: "Users may stop using the platform at any time.",
      },
    ],
  },
  {
    number: "20.",
    title: "Governing Law",
    blocks: [
      {
        type: "paragraph",
        text: "These Terms shall be governed by the laws applicable in the jurisdiction where NexID operates. Any disputes arising from these Terms shall be resolved according to applicable laws and legal procedures.",
      },
    ],
  },
  {
    number: "21.",
    title: "Updates to These Terms",
    blocks: [
      {
        type: "paragraph",
        text: "NexID may revise these Terms periodically. Continued use of the platform after updates indicates acceptance of the revised Terms. Users are encouraged to review the Terms regularly.",
      },
    ],
  },
  {
    number: "22.",
    title: "Contact",
    blocks: [
      {
        type: "contact",
        prefix: "For legal questions or inquiries related to these Terms, please contact: ",
        email: "legal@nexid.io",
      },
    ],
  },
];

const Terms = () => {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-nexid-base font-sans text-nexid-text antialiased">
      <div className="bg-stardust" aria-hidden="true" />
      <div className="shooting-star star-1" aria-hidden="true" />
      <div className="shooting-star star-2" aria-hidden="true" />

      <LandingNavbar protocolHref="/#protocol" />

      <main className="w-full pt-28">
        <div className="mx-auto w-full max-w-4xl px-6 pb-20">
          <header className="mb-16 text-center">
            <h1 className="font-display mb-4 text-4xl font-black uppercase tracking-tight text-white md:text-5xl">
              NexID Terms of Service
            </h1>
            <div className="font-mono text-sm font-semibold uppercase tracking-widest text-nexid-gold">
              Last Updated: March 1, 2026
            </div>
          </header>

          <section className="mb-12 border-b border-nexid-border pb-8 text-lg leading-relaxed text-nexid-muted">
            <p className="mb-4">
              Welcome to NexID. These Terms of Service (Terms) govern your access to and use of the NexID platform,
              including our website, applications, APIs, smart contracts, domain minting services, educational
              content, and related services (collectively, the Services).
            </p>
            <p>
              By accessing or using NexID, you agree to be bound by these Terms. If you do not agree with these Terms,
              you must not use the Services.
            </p>
          </section>

          <div className="space-y-12">
            {termsSections.map((section) => (
              <section key={section.number}>
                <h2 className="font-display mb-4 flex items-center text-2xl text-white">
                  <span className="mr-3 text-base text-nexid-gold">{section.number}</span>
                  {section.title}
                </h2>

                {section.blocks.map((block, blockIndex) => {
                  if (block.type === "paragraph") {
                    return (
                      <p key={`${section.number}-${blockIndex}`} className="mb-4 leading-relaxed text-nexid-text/90">
                        {block.text}
                      </p>
                    );
                  }

                  if (block.type === "list") {
                    return (
                      <ul key={`${section.number}-${blockIndex}`} className="mb-6 space-y-2">
                        {block.items.map((item) => (
                          <li
                            key={item}
                            className="relative pl-6 text-nexid-muted before:absolute before:left-0 before:text-nexid-gold before:content-['•']"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    );
                  }

                  return (
                    <p key={`${section.number}-${blockIndex}`} className="mb-4 leading-relaxed text-nexid-text/90">
                      {block.prefix}
                      <a
                        href={`mailto:${block.email}`}
                        className="text-nexid-gold transition-colors hover:text-[#ffd15c]"
                      >
                        {block.email}
                      </a>
                    </p>
                  );
                })}
              </section>
            ))}
          </div>

          <div className="mt-16 border-t border-nexid-border pt-8 text-center font-mono text-xs uppercase tracking-widest text-nexid-muted">
            Powered by NexID. Sovereign Knowledge Layer.
          </div>
        </div>

        <LandingFooter />
      </main>
    </div>
  );
};

export default Terms;
