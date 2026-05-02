import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "web3-security-the-complete-course";

const modules = [
  {
    title: "Lesson 1: Intro",
    description: "Introductory overview of the Web3 security threat landscape.",
    items: [
      {
        type: "video",
        title: "Lesson 1: Intro",
        videoUrl: "https://share.synthesia.io/embeds/videos/a59d294f-d786-423f-a0cd-61d2840d3b44",
        durationSeconds: 100,
      },
    ],
  },
  {
    title: "Lesson 2: Phishing",
    items: [
      {
        type: "video",
        title: "Lesson 2: Phishing",
        videoUrl: "https://share.synthesia.io/embeds/videos/23771511-1be6-43c5-aa43-11fe2cfb64df",
        durationSeconds: 284,
      },
    ],
  },
  {
    title: "Lesson 3: Fake Zoom",
    items: [
      {
        type: "video",
        title: "Lesson 3: Fake Zoom",
        videoUrl: "https://share.synthesia.io/embeds/videos/e124337b-d50c-4bbb-8a6b-d1f76161e7c1",
        durationSeconds: 237,
      },
    ],
  },
  {
    title: "Lesson 4: Wallet safety",
    items: [
      {
        type: "video",
        title: "Lesson 4: Wallet safety",
        videoUrl: "https://share.synthesia.io/embeds/videos/2aa60e87-6a4a-41a6-8f97-fdfa20f928b2",
        durationSeconds: 254,
      },
    ],
  },
  {
    title: "Lesson 5: Social Engineering (Basic)",
    items: [
      {
        type: "video",
        title: "Lesson 5: Social Engineering (Basic)",
        videoUrl: "https://share.synthesia.io/embeds/videos/fcd1501c-6958-46a1-9c53-ec418047f840",
        durationSeconds: 260,
      },
    ],
  },
  {
    title: "Lesson 6: DeFi Risks",
    items: [
      {
        type: "video",
        title: "Lesson 6: DeFi Risks",
        videoUrl: "https://share.synthesia.io/embeds/videos/6a89efbb-382c-4b0c-980a-06105b8a8d9a",
        durationSeconds: 274,
      },
    ],
  },
  {
    title: "Lesson 7: Social Engineering (Advanced)",
    items: [
      {
        type: "video",
        title: "Lesson 7: Social Engineering (Advanced)",
        videoUrl: "https://share.synthesia.io/embeds/videos/f1de5169-dbcd-4de6-b140-13d3383d83ef",
        durationSeconds: 420,
      },
    ],
  },
  {
    title: "Lesson 8: OpSec",
    items: [
      {
        type: "video",
        title: "Lesson 8: OpSec",
        videoUrl: "https://share.synthesia.io/embeds/videos/2da4ab3e-f481-450e-8118-f191918a23dc",
        durationSeconds: 224,
      },
    ],
  },
  {
    title: "Lesson 9: Bridg and Security",
    items: [
      {
        type: "video",
        title: "Lesson 9: Bridg and Security",
        videoUrl: "https://share.synthesia.io/embeds/videos/5939becf-b342-4576-9802-77784474b46b",
        durationSeconds: 280,
      },
    ],
  },
  {
    title: "Lesson 10: What To Do",
    items: [
      {
        type: "video",
        title: "Lesson 10: What To Do",
        videoUrl: "https://share.synthesia.io/embeds/videos/b21e62d8-cfcf-4b1e-987e-57114c0af7c4",
        durationSeconds: 210,
      },
    ],
  },
];

const questions = [
  ["What is the number one attack vector used to steal crypto from individuals?", "Ignores and does not click. Explains that no legitimate project sends reward links via DM and identifies the urgency or countdown as a manipulation tactic.", "Knows to ignore it but cannot explain why the DM channel itself is a red flag, or does not mention verifying on the official site.", "Says they would click it, check it out, or ask the sender for more info before clicking."],
  ["In your own words, explain what a seed phrase is and why it matters.", "Explains it is 12 or 24 words that control full wallet access, that it is not a password but the actual key to funds, and that anyone who has it can take everything with no recourse.", "Knows it is important and should not be shared, but describes it as a password rather than distinguishing that it is the money itself, not access to someone else's system.", "Confuses it with a PIN or login password, or cannot explain why it is different from regular credentials."],
  ["Someone on a video call asks you to click a link to update your Zoom app. How do you respond?", "Ends the call immediately. Can explain that Zoom updates through its own app and that links sent by strangers during calls are a known malware delivery method (Contagious Interview).", "Would not click the link but hesitates or says they would ask more questions first, without identifying the pattern as a defined attack type.", "Would click it or says they would verify the link first before installing."],
  ["Explain what a token approval is and why unlimited approvals are a risk.", "Explains that approvals grant contracts permission to spend tokens, that unlimited means all tokens of that type forever, and that if the contract is compromised later the approval can still be used to drain the wallet.", "Understands approvals are permissions given to contracts, but describes unlimited as only dangerous at the time of the transaction rather than as a permanent ongoing risk.", "Cannot explain what a token approval is, or confuses it with signing a specific transaction."],
  ["What is the difference between a hot wallet and a hardware wallet?", "Hot wallet is connected to the internet and keys exist on a networked device. Hardware wallet stores keys on a dedicated offline device. Signing happens on the hardware itself, so a compromised computer cannot extract keys.", "Knows hardware is safer and that it is offline, but cannot explain the specific mechanism - that signing happens on the device and keys never touch the connected computer.", "Describes a hardware wallet as just a USB or storage device without understanding the key management distinction."],
  ["Why should you keep a separate browser profile dedicated to crypto?", "Isolates the wallet extension from other browsing activity. Other extensions can access page content and interact with wallet transactions. Saved logins and browsing history create additional attack surface the crypto profile should not have.", "Knows it is safer but explains it only in terms of keeping things separate without identifying the specific attack surface that other extensions and logins create.", "Cannot explain the security reasoning beyond general privacy."],
  ["What are three signs that a new token might be a rug pull before it happens?", "Anonymous team with no verifiable track record, unlocked liquidity the team can remove at any time, and contract anti-sell mechanisms or extremely high sell taxes. Can explain why each one specifically enables a rug.", "Names two of three correctly, or names all three but cannot explain what each one specifically allows the team to do.", "Names only one sign or focuses on price action and hype rather than structural contract features."],
  ["Your wallet was just compromised. Walk me through what you do, in order.", "Move remaining assets to a clean wallet immediately, first and most urgent. Then revoke all token approvals from a clean device. Disconnect and wipe the compromised device. Change all passwords from a clean device. Document transaction hashes for investigation.", "Gets the first step right, moving assets, but misses the approval revocation step or puts the steps in an order that delays asset protection.", "Starts by changing passwords or contacting support before moving assets, or cannot recall the priority sequence."],
  ["Why is SMS-based two-factor authentication less secure than an authenticator app?", "SIM swap attacks allow an attacker to convince a phone carrier to transfer your number to their SIM, intercepting SMS codes. Authenticator apps generate codes locally and are not routed through the phone network, so SIM swaps cannot intercept them.", "Knows SMS is less safe and mentions SIM swapping, but cannot explain the technical mechanism of how the attack intercepts the codes.", "Cannot explain why SMS is weaker beyond general statements about SMS being not encrypted."],
  ["What does not your keys, not your coins mean to you in practice?", "Assets on exchanges are controlled by the exchange. You are an unsecured creditor, not an asset owner. If the exchange is hacked, goes bankrupt, or freezes withdrawals, your funds are at risk without the protections of bank deposit insurance.", "Understands the concept but frames it only as exchanges can get hacked rather than explaining the legal and custody distinction between owning assets and holding a claim against a company.", "Recites the phrase without being able to explain what it means in terms of actual custody and risk."],
  ["How do North Korean hackers actually get hired at crypto companies?", "Use fake identities for remote developer applications. Maintain these identities convincingly through technical interviews and coding assessments. Once hired, they use internal access to steal data, introduce backdoors, or enable larger coordinated attacks.", "Knows they use fake identities but cannot describe how those identities are maintained through the hiring process or what the hired operatives actually do once inside.", "Describes it as hacking rather than social infiltration through legitimate hiring channels."],
  ["Why are bridges specifically attractive targets for large-scale attacks?", "Bridges concentrate large amounts of assets in smart contracts secured by a small number of validator keys. Compromising a threshold of those keys grants access to the entire locked treasury. The Ronin pattern - 9 validators, needed 5, got 5 - shows how this plays out.", "Knows bridges hold large values and are attacked, but does not explain the validator key model or why the small number of keys creates the specific vulnerability.", "Cannot explain the structural reason bridges are attacked beyond they hold a lot of money."],
  ["What is a multisig wallet and why does it matter for protocol teams specifically?", "Requires multiple signatures from different keyholders to approve transactions. For protocols, this means no single person, compromised or acting alone, can execute admin functions unilaterally. The threshold structure distributes the attack surface.", "Understands the basic concept of multiple approvals but cannot explain why the specific threshold, such as 2-of-5 vs 3-of-5, matters significantly in practice.", "Describes it as a wallet that requires a password or PIN rather than understanding the multi-key signing structure."],
  ["Walk me through why unlimited token approvals are dangerous even if the contract seemed safe when you approved it.", "The approval persists indefinitely. If the contract's code is upgraded, the team is compromised, or a new exploit is found, the unlimited approval you granted months ago can be used immediately without any new signature from you. The risk is not at the moment of approval. It is at any point afterward.", "Understands the approval is permanent but focuses on the contract being compromised at the time rather than the ongoing window the approval creates.", "Believes revoking is only necessary if something goes wrong at the time of the original transaction."],
  ["What is social engineering in a crypto security context?", "Manipulating someone into taking an action, clicking, downloading, or sharing credentials, by exploiting trust, urgency, or impersonation rather than breaking any technical system. The target is human judgment, not code.", "Describes it as tricking people, but does not distinguish it from technical hacking or explain why targeting people rather than code makes it harder to defend against.", "Confuses social engineering with phishing specifically or cannot give an example."],
  ["An investor emails you saying they want to fund your protocol. What do you do before responding?", "Goes to the fund's official website independently. Finds the real contact information for the named person. Reaches out through that verified channel before responding to the original email. Does not open attachments from the initial email.", "Knows to verify but says they would Google the person or check LinkedIn, which can be spoofed, rather than going directly to the fund's official website for contact details.", "Responds to the email directly or opens the attachment to review the term sheet."],
  ["What should a protocol team do in the first hour after discovering an exploit?", "Pause the protocol if possible to prevent further loss. Engage security researchers and incident response. Communicate transparently with the community within the first hour: what happened, what is known, and what is being done. Silence or minimization at this stage is itself a crisis.", "Knows to pause and communicate but does not explain why the timing of communication matters, or puts investigation before transparency.", "Says to investigate fully before telling anyone, or focuses only on the technical response without mentioning community communication."],
  ["Why is the Drift Protocol hack in 2026 a case study that every protocol team should understand?", "The attacker spent six months building a relationship before exploiting trust. The vulnerability was entirely human; no code was broken. It shows that patient social engineering against team members can be more effective than any technical attack, and that access controls need to account for trusted-but-compromised insiders.", "Knows it involved social engineering and took months, but cannot articulate the specific implication for how protocols should manage access and external relationships.", "Recalls only that Drift was hacked without being able to describe the mechanism."],
  ["What is a burner wallet and describe a situation where you would use one?", "A separate wallet with minimal funds used specifically for risky interactions, such as a new NFT mint, an untested DEX, or a contract they have not vetted. If the burner is drained, main holdings are protected. Can give a specific scenario naturally.", "Understands the concept but describes using it only in obviously suspicious situations rather than any new or untested interaction.", "Cannot describe a specific use case or confuses it with a test wallet used in development."],
  ["What happened in the Bybit hack of February 2025?", "North Korean Lazarus Group compromised the Safe multisig wallet interface used by Bybit, injecting malicious JavaScript months before the attack. When Bybit signers used the compromised interface, they unknowingly signed a transaction that transferred $1.46 billion to the attackers. The largest single theft in financial history.", "Knows it was North Korean hackers and involved a large amount, but cannot explain the supply chain attack vector: that the interface was compromised upstream rather than Bybit's systems directly.", "Knows Bybit was hacked but cannot describe the mechanism or the attribution."],
  ["A website popup asks for your seed phrase. What is happening and what do you do?", "This is a phishing attack. No legitimate application ever requests a seed phrase through a browser popup. Close the tab, clear cache, and check if the site was a compromised or fake version of what you intended to visit.", "Knows not to enter it and to close the page, but does not check whether the original site was compromised or explain the next steps for securing the wallet if credentials may have been exposed.", "Considers entering it or believes there are legitimate scenarios where a popup would need the seed phrase."],
  ["Why should admin key devices never be used for general browsing or email?", "Every piece of software and every site visited on a device creates attack surface. Malicious browser extensions, compromised sites, and phishing emails all provide pathways to key extraction. An admin device used only for signing has an attack surface of nearly zero. Adding browsing adds every risk associated with general internet use to the most critical key in the system.", "Knows it increases risk but cannot articulate the specific threat mechanisms that browsing introduces to a signing device.", "Believes the multisig protects the key regardless of how the device is used."],
  ["What is the most important thing to verify before buying a new token?", "Whether the liquidity is locked and by whom, whether the contract contains sell restrictions or unusual tax structures, and whether the team has a verifiable real-world track record. At least one reputable token scanner check before any purchase.", "Focuses on team anonymity only or mentions price action rather than structural contract features that reveal rug pull design.", "Relies on social proof - what other people are saying about it - rather than contract-level verification."],
  ["Describe how fake job scams in crypto actually work mechanically.", "Fake DMs or job posts about paid positions. The job involves downloading software, such as a game to test, a coding tool, or an app to fix audio, that contains malware. Once installed, it scans for browser wallet extensions, extracts encrypted vaults, and logs credentials. The job and payment are entirely fabricated to get the download to happen.", "Knows the download is malware but describes the attack as starting from a website or email rather than the video call social engineering setup that makes it convincing.", "Describes it vaguely as fake jobs with malware without explaining the social engineering mechanism that makes people download."],
  ["What is the specific lesson from the Ronin Bridge hack about how temporary access permissions should be managed?", "A temporary permission was granted to the Axie DAO to operate validator keys during a traffic spike, then never revoked when the need passed. Months later, that forgotten permission gave the Lazarus Group the fifth key they needed to reach the signing threshold. Temporary access must be explicitly revoked; it does not expire on its own.", "Knows a permission was forgotten and led to the hack, but cannot explain the chain of how the forgotten permission became the operational path to the theft.", "Recalls Ronin was hacked but cannot describe the permission mechanism at the centre of it."],
  ["How do you store your seed phrase to protect against both theft and physical loss?", "Handwritten on paper or stamped on metal, in a physically secure location. Some split it across two locations so that one loss or theft does not compromise the full phrase. Never digitally: no cloud, no photos, no password managers. Metal is better than paper for fire and water resilience.", "Knows to keep it offline and written down, but does not address redundancy against physical loss: what happens if the one copy is lost or destroyed.", "Suggests keeping it in a password manager or taking a photograph of the written copy for backup."],
  ["Why does phishing remain the most successful attack type in crypto despite being one of the oldest?", "It is simple, scalable, and exploits human behavior rather than technical systems. The fakes have become convincing enough to deceive careful people under time pressure. Urgency specifically disables the verification reflex, which is why scarcity and deadlines are always part of the design. No technical defense fully counters an attack that is aimed at the person, not the system.", "Explains that the fakes are convincing, but does not identify the role of urgency specifically in disabling the check-before-acting reflex.", "Says people are careless, without engaging with why careful people also get caught."],
  ["Why is password reuse across services a security risk even if each individual service seems secure?", "When one service is breached and credentials are leaked, attackers test those credentials across all major services automatically. One breach at a small service becomes access to every account using the same password. Unique passwords per service contain any single breach to that service only.", "Knows reuse is dangerous and mentions breaches, but does not explain the credential stuffing attack that makes leaked credentials from one site immediately dangerous on every other site.", "Focuses on someone watching you type the password or guessing it rather than the automated credential stuffing threat."],
  ["What does a time-lock on an admin action actually do for protocol security?", "Creates a mandatory delay between when an admin action is proposed and when it executes. This window allows the team and community to see what is proposed, verify it is legitimate, and take action to cancel it if it is not. Without it, an unauthorized admin action executes immediately after being signed; there is no intervention window.", "Understands the concept of a delay, but cannot explain why the specific window between proposal and execution is the operative protection mechanism rather than just a governance requirement.", "Describes time-lock as a cooldown period after the action executes rather than before."],
  ["After completing this course, what is the first security action you plan to take, and why that one specifically?", "Names a specific action, such as reviewing token approvals on revoke.cash, moving a seed phrase offline, setting up a hardware wallet, enabling authenticator 2FA, or creating a dedicated crypto browser profile, and can explain why that particular action is the most urgent given their current setup. Shows genuine personalized reflection rather than reciting a list.", "Names a valid action but cannot explain why that one specifically is the priority, or lists multiple things without ranking urgency.", "Cannot name a specific action, gives a vague answer like be more careful, or says they already do everything correctly."],
] as const;

function buildRubric(high: string, mid: string, low: string) {
  return [
    "[76-100] " + high,
    "[41-75] " + mid,
    "[0-40] " + low,
    "Passing threshold: 76%. Grade the answer against the security behavior and reasoning, not speaking style.",
  ].join("\n");
}

async function main() {
  const campaign = await prisma.campaign.upsert({
    where: { slug: SLUG },
    create: {
      slug: SLUG,
      title: "Web3 Security: The Complete Course",
      objective:
        "Teach learners how to identify and respond to Web3 security threats including phishing, fake calls, wallet approvals, social engineering, DeFi risk, bridge security, and incident response.",
      sponsorName: "NexID Academy",
      sponsorNamespace: "nexid",
      tier: "CUSTOM",
      ownerType: "NEXID",
      contractType: "NEXID_CAMPAIGNS",
      prizePoolUsdc: 0,
      keyTakeaways: [
        "Recognize phishing and fake support patterns before clicking.",
        "Protect wallets, seed phrases, token approvals, and signing devices.",
        "Understand social engineering risks for users, teams, and founders.",
        "Respond quickly when a wallet or protocol is compromised.",
      ],
      modules,
      status: "LIVE",
      isPublished: true,
      primaryChain: "base",
      minQuestions: 5,
      passThreshold: 80,
      difficultyWeight: 1,
    },
    update: {
      title: "Web3 Security: The Complete Course",
      objective:
        "Teach learners how to identify and respond to Web3 security threats including phishing, fake calls, wallet approvals, social engineering, DeFi risk, bridge security, and incident response.",
      sponsorName: "NexID Academy",
      sponsorNamespace: "nexid",
      tier: "CUSTOM",
      ownerType: "NEXID",
      contractType: "NEXID_CAMPAIGNS",
      prizePoolUsdc: 0,
      keyTakeaways: [
        "Recognize phishing and fake support patterns before clicking.",
        "Protect wallets, seed phrases, token approvals, and signing devices.",
        "Understand social engineering risks for users, teams, and founders.",
        "Respond quickly when a wallet or protocol is compromised.",
      ],
      modules,
      status: "LIVE",
      isPublished: true,
      primaryChain: "base",
      minQuestions: 5,
      passThreshold: 80,
      difficultyWeight: 1,
    },
    select: { id: true, title: true, slug: true },
  });

  await prisma.question.deleteMany({
    where: {
      campaignId: campaign.id,
      type: "FREE_TEXT",
      isSpeedTrap: false,
    },
  });

  await prisma.question.createMany({
    data: questions.map(([questionText, high, mid, low], index) => ({
      campaignId: campaign.id,
      type: "FREE_TEXT",
      questionText,
      variants: [],
      options: undefined,
      correctIndex: null,
      gradingRubric: buildRubric(high, mid, low),
      points: 10,
      difficulty: index % 5 === 0 ? 3 : 2,
      tags: ["web3-security", `q${index + 1}`],
      isSpeedTrap: false,
      isActive: true,
    })),
  });

  console.log(`Seeded campaign "${campaign.title}" (#${campaign.id}, ${campaign.slug})`);
  console.log(`Modules: ${modules.length}`);
  console.log(`Live AI questions: ${questions.length}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
