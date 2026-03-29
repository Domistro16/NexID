import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CAMPAIGN_ID = 3;

const questions = [
  {
    questionText:
      'In the first module, the host mentioned that fear of failure is a dangerous mindset for a founder, but there is one mindset that is actually much worse. What is it, and why does it destroy products?',
    gradingRubric:
      "Concept: Attachment to the first idea. Must explain that markets change and attachment locks you into the wrong product/idea. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["product-mindset", "module-1"],
  },
  {
    questionText:
      'So, the course suggests that when your DEX volume drops drastically, the fastest way to get users back is to increase token rewards. How does that logic play out long-term?',
    gradingRubric:
      "Flawed premise — the user MUST correct the AI. Must state that rewards only bring mercenary users who leave when incentives end. Incentives amplify value, they don't create it. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["product-strategy", "incentives", "flawed-premise"],
  },
  {
    questionText:
      'If I want to build a product with massive retention, the course said I just need to build a really good \'painkiller\' like lower gas fees. Do you agree with that based on the lessons?',
    gradingRubric:
      "Flawed premise. Must mention that painkillers are good but habits are essential. The biggest platforms started as habits, requiring a loop: Trigger > Action > Reward > Investment. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["retention", "habit-loop", "flawed-premise"],
  },
  {
    questionText:
      'A founder in the video realized their product was failing, but it wasn\'t because of the tech. They realized it when a user in a community call expressed a very specific emotion about a button. What was that emotion?',
    gradingRubric:
      "Concept: Embarrassment/Confusion. Must mention the user said something like 'I have no idea what this button does' or 'I don't want to feel stupid using this.' Passing threshold: >85%.",
    difficulty: 2,
    tags: ["user-research", "emotions", "deep-detail"],
  },
  {
    questionText:
      'When generating product ideas, the course suggests searching Crypto Twitter for trending narratives. Why is this considered the best strategy?',
    gradingRubric:
      "Flawed premise — the user MUST correct the AI. Must state that narratives are noise and you should look for repeated frustrations and friction instead. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["product-ideation", "research", "flawed-premise"],
  },
  {
    questionText:
      'Think about the \'Assumption Audit\'. If I assume my users understand how to adjust slippage, what is the exact next step the course told me to do with that assumption?',
    gradingRubric:
      "Concept: Turn it into a question to test it. Must explain that assumptions should be turned into questions (e.g., 'Do users know what slippage is without explanation?'). Passing threshold: >85%.",
    difficulty: 2,
    tags: ["assumption-audit", "research", "ux"],
  },
  {
    questionText:
      'We talked about a project called Kaito. They didn\'t invent discussion; they organized it. What was the specific user pain point they noticed that others missed on Crypto Twitter?',
    gradingRubric:
      "Concept: Cognitive overload / Noise. Must mention there was information everywhere but no structured signal or clarity. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["case-study", "kaito", "product-ideation"],
  },
  {
    questionText:
      'Your competitor just launched an AI wallet suggestion feature and everyone is talking about it. According to the course\'s module on competition, what is the first question you should ask your team?',
    gradingRubric:
      "Concept: Validation of need. Must mention checking if their actual users are asking for it or if it solves a real user problem (reducing friction). Passing threshold: >85%.",
    difficulty: 2,
    tags: ["competition", "product-strategy", "scenario"],
  },
  {
    questionText:
      'One of the founders in the video had a dashboard where users were constantly asking support what metrics meant. To fix this, they added more advanced analytics to clarify the data. Why was this the right move?',
    gradingRubric:
      "Flawed premise — the user MUST correct the AI. Must state they didn't add features; they changed the language, renamed metrics, and removed cognitive load and choices. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["ux-writing", "cognitive-load", "flawed-premise"],
  },
  {
    questionText:
      'A consumer app founder realized 70% of their traffic was coming from one integration partner. What did they learn about the difference between exposure and demand?',
    gradingRubric:
      "Concept: Distribution reliance. Must explain that accidental discovery is not the same as users actively choosing you, and dependence on one source is fragility. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["distribution", "growth", "synthesis"],
  },
  {
    questionText:
      'In the train station analogy for UX, if the user is the traveler and the goal is the destination, what does the \'context\' represent?',
    gradingRubric:
      "Concept: The environment/situation. Must mention it represents things like rush hour, midnight, being on mobile, or being distracted. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["ux-fundamentals", "metaphor", "context"],
  },
  {
    questionText:
      'A developer tells you their smart contract is gas-optimized and secure, therefore the UX is perfect. How did the course differentiate between optimizing infrastructure and optimizing experience?',
    gradingRubric:
      "Concept: Translation of infrastructure. Must explain that users don't experience the backend/contract; they experience the friction of the journey (approvals, slippage, etc.). Passing threshold: >85%.",
    difficulty: 2,
    tags: ["ux-fundamentals", "infrastructure", "synthesis"],
  },
  {
    questionText:
      'The course suggests using AI to generate user personas. What did they say is the main danger if a founder just designs the product for themselves instead?',
    gradingRubric:
      "Concept: The Ego Trap / Blindness to friction. Must mention that experienced users don't see friction anymore (like signing txs or gas settings) and assume it's normal. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["user-personas", "ego-trap", "ux"],
  },
  {
    questionText:
      'If I open a brand new Web3 portfolio app and my wallet has no assets, the most accurate UX is to show a blank chart and a zero balance. Why did the course say this is actually a terrible idea?',
    gradingRubric:
      "Flawed premise. Must explain that showing absence creates confusion and dead ends. The empty state should guide the user on the next steps. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["empty-states", "ux", "flawed-premise"],
  },
  {
    questionText:
      'A user tries to swap a token, but the transaction fails. The UI shows \'Execution Reverted: EVM error 0x8934\'. The course says this is bad because it lacks three specific layers of a good failure response. Can you name two of them?',
    gradingRubric:
      "Concept: Designing the Conversation. Must name at least two of: Explanation (what went wrong), Reassurance (funds are safe), and Action (what to do next like retry). Passing threshold: >90%.",
    difficulty: 3,
    tags: ["error-handling", "ux-writing", "scenario"],
  },
  {
    questionText:
      'Why does the course suggest pasting your core smart contract into ChatGPT before designing the UI?',
    gradingRubric:
      "Concept: Edge case mapping. To list every edge case and failure scenario (slippage, token approvals) and rewrite the error messages in simple human language. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["error-handling", "ai-tools", "process"],
  },
  {
    questionText:
      'The course talked about the difference between how engineers view a product and how UX designers view it. Engineers think in probabilities. What do UX designers think in?',
    gradingRubric:
      "Concept: Emotions. Must mention emotions (or user anxiety/panic). Passing threshold: >80%.",
    difficulty: 1,
    tags: ["ux-fundamentals", "emotions", "direct-quote"],
  },
  {
    questionText:
      'Let\'s talk about the \'Wallet Wall\'. If I\'m building a DEX, the best practice is to require wallet connection immediately on page load so I can personalize their experience. True or false based on the course?',
    gradingRubric:
      "Flawed premise — user MUST say False. Must explain that users should experience value and explore before being forced to sign a wallet connection (gradual engagement). Passing threshold: >90%.",
    difficulty: 3,
    tags: ["wallet-wall", "gradual-engagement", "flawed-premise"],
  },
  {
    questionText:
      'When designing for both beginners and experts, the course introduced the \'Dual-Layer Rule\'. If you only build Layer 1 (simple and human), what do you limit? And if you only build Layer 2 (technical), what do you limit?',
    gradingRubric:
      "Concept: Novice vs Expert. Layer 1 only caps credibility/expert adoption. Layer 2 only caps beginner adoption/growth. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["dual-layer", "ux-design", "synthesis"],
  },
  {
    questionText:
      'Give me an example from the course of how you should translate a technical Web3 term like \'Adjust Slippage\' into human-readable language.',
    gradingRubric:
      "Concept: Jargon Translation. E.g., 'Max Price Change You'll Accept.' Any reasonable human-friendly rewrite of the term is acceptable. Passing threshold: >80%.",
    difficulty: 1,
    tags: ["jargon-translation", "ux-writing", "practical"],
  },
  {
    questionText:
      'What is the \'Bodyguard Principle\' in Web3 UX, and what three things should the UI do before asking a user to sign a transaction?',
    gradingRubric:
      "Concept: Pre-signing safety. Must mention all three: 1) Simulate the transaction, 2) Translate what will happen in plain language, 3) Visually confirm safety to the user. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["bodyguard-principle", "transaction-safety", "concept-recall"],
  },
  {
    questionText:
      'When a user is about to sign a transaction, the course said you should hide the smart contract audit link in the footer to keep the UI clean. Why is this wrong?',
    gradingRubric:
      "Flawed premise. Must state the audit link should be visible and upfront, not hidden, to build trust before signing. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["trust-indicators", "transaction-safety", "flawed-premise"],
  },
  {
    questionText:
      'In Web3, the course argues that accessibility isn\'t just about screen readers for the visually impaired. It\'s about designing for \'volatility\'. What does that mean?',
    gradingRubric:
      "Concept: Real-world conditions. Must mention designing for unstable environments: mobile usage, slow RPCs, fast-moving market prices, and high-stress situations. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["accessibility", "volatility", "synthesis"],
  },
  {
    questionText:
      'How does writing clear transaction descriptions for screen readers actually improve security and prevent hacks in Web3?',
    gradingRubric:
      "Concept: Infinite Approvals. Must explain that clarity prevents users from accidentally signing unlimited token approvals (a common exploit vector). Passing threshold: >85%.",
    difficulty: 2,
    tags: ["accessibility", "security", "transaction-safety"],
  },
  {
    questionText:
      'In trading apps, using red and green text is enough to show profit and loss. Why did the course say relying only on color is a terrible idea for execution speed?',
    gradingRubric:
      "Flawed premise — user must correct the premise. If a user can't distinguish the color quickly, they hesitate. You need additional indicators: arrows, +/- signs, or text. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["accessibility", "color-contrast", "flawed-premise"],
  },
  {
    questionText:
      'A Founder argues that because their DeFi protocol targets technical users, accessibility (like keyboard navigation) doesn\'t matter yet. What is the counter-argument given in the course?',
    gradingRubric:
      "Concept: Friction = Volume. Must state that accessibility lowers execution friction. Lower friction equals more volume and liquidity, which equals a stronger protocol. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["accessibility", "defi", "synthesis"],
  },
  {
    questionText:
      'The course says irreversible systems demand a specific kind of clarity. What happens when a Web3 interface under-communicates before a signature?',
    gradingRubric:
      "Concept: Uncertainty / Fear. Must mention that it causes panic, user error, or hesitation which has a direct financial cost. Passing threshold: >80%.",
    difficulty: 1,
    tags: ["irreversibility", "clarity", "philosophy"],
  },
  {
    questionText:
      'If an error message simply says \'Insufficient Gas\', how should you rewrite it to be more human-readable according to the jargon module?',
    gradingRubric:
      "Concept: Translation. E.g., 'Network Fee Too High Right Now.' Any reasonable human-friendly rewrite that conveys the user impact is acceptable. Passing threshold: >80%.",
    difficulty: 1,
    tags: ["jargon-translation", "error-handling", "practical"],
  },
  {
    questionText:
      'When testing the UI for a new intent-based DEX, what is the absolute first thing you should build according to the 2026 design sprint model?',
    gradingRubric:
      "Concept: AI Prototypes over Contracts. Must state a clickable prototype (via sketching and AI tools) should be built before writing any smart contracts. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["design-sprint", "prototyping", "process"],
  },
  {
    questionText:
      'A developer says, \'If the UI flow is confusing, we can just fix it on-chain later.\' Why is this a massive mistake in Web3?',
    gradingRubric:
      "Concept: Cost of deployment. Must explain that deploying or changing a smart contract is expensive and immutable, while changing a prototype is free. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["smart-contracts", "prototyping", "synthesis"],
  },
  {
    questionText:
      'When you sit down to test your prototype with a real user, the course gave a \'Golden Rule\' about what you should do right after giving them a task. What is it?',
    gradingRubric:
      "Concept: The Golden Rule of Testing. Answer: Stop talking / Stay quiet and observe. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["user-testing", "golden-rule", "process"],
  },
  {
    questionText:
      'You are watching a user test your app. They hover over the \'Stake\' button and say, \'I\'m not sure what this does.\' According to the course, you should immediately explain it so they don\'t churn. Why is this wrong?',
    gradingRubric:
      "Flawed premise. Must state that explaining it masks the design gap and destroys the testing data. You should ask what *they* think it does, not explain it for them. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["user-testing", "data-integrity", "flawed-premise"],
  },
  {
    questionText:
      'During a user test in the video, a user clicked confirm but ended their sentence with \'I guess...\'. Why did the host say that subtle tone is so dangerous?',
    gradingRubric:
      "Concept: Uncertainty at scale. Must explain that 'I guess' signals uncertainty. Uncertainty before an irreversible signature, scaled across 10,000 users, becomes massive churn. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["user-testing", "uncertainty", "scale"],
  },
  {
    questionText: 'What is the \'10-Second Rule\' in Web3 UX?',
    gradingRubric:
      "Concept: Time to comprehension. If a user can't identify the main action, understand what's next, and feel confident in 10 seconds, the UX is too heavy and they will leave. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["ux-heuristics", "10-second-rule", "rule-recall"],
  },
  {
    questionText:
      'To get the best feedback on your new DeFi UI, you should test it with your co-founders and crypto-native friends. Why does the course strongly disagree with this?',
    gradingRubric:
      "Flawed premise. Must mention confirmation bias. You should test with curious beginners or semi-technical users, not people already immersed in crypto. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["user-testing", "confirmation-bias", "flawed-premise"],
  },
  {
    questionText:
      'A founder says, \'Our smart contracts are live and the frontend is polished. If it\'s good, Crypto Twitter will naturally spread it.\' What is the flaw in this strategy?',
    gradingRubric:
      "Concept: Distribution vs Quality. Quality does not equal distribution. You have to build in public, share failures, and integrate growth loops from the very start. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["distribution", "growth", "plg"],
  },
  {
    questionText:
      'According to the module on Product-Led Growth (PLG), how should a product handle a user executing a highly profitable cross-chain trade?',
    gradingRubric:
      "Concept: Shareable Proof. Generate a clean, verifiable, one-click shareable proof of the win for social media. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["plg", "growth-loops", "social-sharing"],
  },
  {
    questionText:
      'Where do founders usually get marketing wrong according to the PLG guest expert Pete?',
    gradingRubric:
      "Concept: Separation of Product and Marketing. They separate product and marketing, building first and asking how to promote later, instead of building growth loops directly into the UX. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["plg", "marketing", "growth"],
  },
  {
    questionText:
      'The course stated that in Web3, you are either \'learning publicly\' or doing what?',
    gradingRubric:
      "Concept: Invisible building. Answer: Building privately (which equals invisible building). Passing threshold: >80%.",
    difficulty: 1,
    tags: ["build-in-public", "growth", "direct-quote"],
  },
  {
    questionText:
      'To build a compounding growth loop in Web3, the course gave a step-by-step example starting with \'User stakes\'. Can you walk me through the rest of that loop?',
    gradingRubric:
      "Concept: The Growth Loop. Expected sequence: User stakes -> earns yield -> sees progress -> shares milestone -> friend joins -> TVL increases -> protocol improves. Passing threshold: >80%.",
    difficulty: 1,
    tags: ["growth-loops", "plg", "process-recall"],
  },
  {
    questionText:
      'If I ask you to combine the \'Wallet Wall\' lesson with the \'Empty State\' lesson: What is the absolute worst possible first screen a new user could see?',
    gradingRubric:
      "Concept: Maximum Friction (Cross-Module Synthesis). Must describe: forcing a wallet connection immediately on load, and then upon connection, showing a blank screen with zero balance and zero guidance. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["wallet-wall", "empty-states", "cross-module"],
  },
  {
    questionText:
      'Why does the course say a deployed smart contract without users is just \'infrastructure\'?',
    gradingRubric:
      "Concept: Execution vs Adoption. Because architecture is only step one; without UX and distribution, humans cannot interact with or benefit from it. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["infrastructure", "adoption", "metaphor"],
  },
  {
    questionText:
      'In the Kaito case study, the guest mentioned that sometimes you don\'t respond to demand, you do what instead?',
    gradingRubric:
      "Concept: Creating Demand. Answer: You create it (by organizing chaos and clarifying noise). Passing threshold: >80%.",
    difficulty: 1,
    tags: ["case-study", "kaito", "demand-creation"],
  },
  {
    questionText:
      'A user is on your platform and wants to vote in a DAO. They are on a bumpy train ride using a mobile phone. Name two UX accessibility features that must be present so they don\'t make a financial error.',
    gradingRubric:
      "Concept: Volatile Accessibility. Must name two of: high contrast colors (not red/green only), large clickable areas (no tiny hover targets), clear text descriptions, keyboard/thumb navigation. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["accessibility", "mobile", "dao"],
  },
  {
    questionText:
      'We learned that \'engagement creates commitment, not the other way around.\' How does this specifically apply to the \'Connect Wallet\' button?',
    gradingRubric:
      "Concept: Gradual Engagement. Must explain that you let users engage with the product (explore, simulate) before asking for the commitment (signing/connecting). Passing threshold: >85%.",
    difficulty: 2,
    tags: ["gradual-engagement", "wallet-wall", "philosophy"],
  },
  {
    questionText:
      'If a user asks \'Is this safe?\' during a test, what specific UI element did you likely forget to include according to the \'Bodyguard Principle\'?',
    gradingRubric:
      "Concept: Trust Indicators. Must identify: a missing transaction simulation badge, clear outcome summary, or visual safety confirmation before signing. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["bodyguard-principle", "trust", "symptom-diagnosis"],
  },
  {
    questionText:
      'The course mentioned that most bad Web3 ideas don\'t come from stupidity. What do they come from?',
    gradingRubric:
      "Concept: Isolation. Answer: Isolation / Building in an echo chamber without real user feedback. Passing threshold: >85%.",
    difficulty: 2,
    tags: ["product-ideation", "isolation", "echo-chamber"],
  },
  {
    questionText:
      'When observing users testing your app, you are looking for four specific behaviors. Three of them are confusion, misclicks, and repeated backtracking. What is the fourth?',
    gradingRubric:
      "Concept: Testing goals. The fourth behavior: Fear before signature / Hesitation (pause or reluctance before confirming a transaction). Passing threshold: >80%.",
    difficulty: 1,
    tags: ["user-testing", "behaviors", "list-recall"],
  },
  {
    questionText:
      'The host Alex stated: \'Every Web3 product begins with a lie. Not malicious. Just...\' Just what?',
    gradingRubric:
      "Concept: Assumptions. Answer: Untested (referring to untested assumptions). Passing threshold: >90%.",
    difficulty: 3,
    tags: ["assumptions", "product-philosophy", "quote-completion"],
  },
  {
    questionText:
      'Finally, synthesize the entire philosophy of the course: Why is the statement \'Incentives equal loyalty\' a myth in Web3 product design?',
    gradingRubric:
      "Concept: Mercenary vs Habit (Grand Synthesis). Must combine: incentives only rent attention and bring mercenary users, while true loyalty and survival come from utility, removing friction, and creating habit loops. Passing threshold: >90%.",
    difficulty: 3,
    tags: ["synthesis", "incentives", "loyalty", "product-philosophy"],
  },
];

async function main() {
  console.log(`Seeding ${questions.length} FREE_TEXT questions into campaign ID ${CAMPAIGN_ID}...`);

  const campaign = await prisma.campaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { id: true, title: true },
  });

  if (!campaign) {
    console.error(`Campaign with ID ${CAMPAIGN_ID} not found. Aborting.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Found campaign: "${campaign.title}" (ID: ${campaign.id})`);

  const existing = await prisma.question.count({
    where: { campaignId: CAMPAIGN_ID, type: "FREE_TEXT" },
  });

  if (existing > 0) {
    console.warn(
      `Warning: ${existing} FREE_TEXT questions already exist for campaign ${CAMPAIGN_ID}.`
    );
    console.warn("Proceeding to add more — no duplicates check beyond this warning.");
  }

  let created = 0;
  const errors: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    try {
      await prisma.question.create({
        data: {
          campaignId: CAMPAIGN_ID,
          type: "FREE_TEXT",
          questionText: q.questionText,
          variants: [],
          options: undefined,
          correctIndex: null,
          gradingRubric: q.gradingRubric,
          points: 10,
          difficulty: q.difficulty,
          tags: q.tags,
          isSpeedTrap: false,
          isActive: true,
        },
      });
      created++;
      console.log(`  [${i + 1}/50] ✓ Created question ${i + 1}`);
    } catch (err) {
      const msg = `Item ${i + 1}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`  [${i + 1}/50] ✗ ${msg}`);
    }
  }

  console.log(`\nDone. Created: ${created} | Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.error("Errors:", errors);
  }
}

main()
  .catch((error) => {
    console.error("Script failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
