export type DocBlock =
  | { type: "table"; title: string; rows: [string, string][] }
  | { type: "note"; text: string }
  | { type: "text"; title: string; paragraphs: string[] }
  | { type: "example"; title: string; goodTitle?: string; good: string; weakTitle?: string; weak: string; why?: string }
  | { type: "check"; title: string; items: string[] }
  | { type: "defs"; title: string; items: [string, string][] };

export type DocSection = {
  title: string;
  intro: string;
  blocks: DocBlock[];
};

export type InfoSection = [string, string];

export type LegalPageData = {
  title: string;
  kicker: string;
  lead: string;
  sections: InfoSection[] | DocSection[];
};

export const legalPages: Record<string, LegalPageData> = {
  faq: {
    title: "FAQ",
    kicker: "Common questions",
    lead: "Clear answers for first-time users.",
    sections: [
      ["What can I trade?", "You can trade listed markets by choosing Ride or Fade. If the route does not exist, you can launch a native market with a clear question, close time, source and fallback rule."],
      ["What does Ride mean?", "Ride is the side that wins when the stated outcome happens under the market rules. Fade is the side that wins when it does not happen."],
      ["Can anyone launch a market?", "A user can draft a native market through the launch flow. The market must have rules that can be checked later. Vague questions should be rewritten before launch."],
      ["Where do results come from?", "Native markets settle from their locked Resolution Card, stated source, fallback rule and ProofFlow path. Existing markets follow the routed venue rules."]
    ]
  },
  risk: {
    title: "Risk Notice",
    kicker: "Trading risk",
    lead: "You can lose money trading. Read the rules before trading or launching.",
    sections: [
      ["Trading risk", "You can lose the amount you trade. Prices move as other users buy and sell. A high price does not guarantee an outcome."],
      ["Liquidity risk", "A market may have low liquidity. Market orders can fill at a worse price than expected. Limit orders may stay open or never fill."],
      ["Settlement risk", "Native markets depend on the locked source, timestamp, fallback rule and evidence path. If the rules cannot fairly prove Ride or Fade, the market can resolve Invalid."],
      ["Creator responsibility", "Creators should launch questions that are measurable, sourced and time-bound. A weak market can confuse traders and hurt the creator record."]
    ]
  },
  terms: {
    title: "Terms",
    kicker: "Product terms",
    lead: "Use NexMarkets only when you understand the market, the source, the close time and the payout rule.",
    sections: [
      ["What NexMarkets is", "NexMarkets is a market interface for trading narratives. A user can trade an existing routed market or launch a native NexMarkets market when the route is missing. The product does not tell you what to believe, which side to take, or whether a market is worth your money."],
      ["Your responsibility", "Before you trade, read the market question, source type, source link, close time, Ride rule, Fade rule, Invalid rule and fallback rule. If those details are unclear to you, do not place the trade. Price shows what traders are paying at that moment. Price does not prove the final outcome."],
      ["Native market creation", "A creator who launches a native market is responsible for the market description, source choice, timing, fallback rule and creator bond. The question must be measurable from the stated source. A creator should not launch duplicate markets, misleading markets, impossible outcomes, private-information markets, or markets that cannot be settled from a public source."],
      ["Existing markets", "A routed market follows the rules and settlement path of the venue it routes to. NexMarkets can show the route, card, price and activity, but the routed venue controls the original market terms and resolution. Review the routed market before trading."],
      ["Trading, orders and balances", "Users fund their NexID trading balance before trading. Market orders execute at the available price path. Limit orders may fill, partly fill, or never fill. Liquidity can change. A trade can lose value, settle against you, or return less than you expected."],
      ["Creator fees", "For native markets, the creator fee is 1% of market volume when the market is valid and the fee path applies. A market that is invalid, abusive, duplicated, manipulated, or not supported by its Resolution Card can lose fee eligibility."],
      ["Settlement", "Native markets settle through Proof flow. The final state can be Ride, Fade, or Invalid. Settlement follows the locked Resolution Card, public evidence and the review path. A routed market follows the routed venue."],
      [".id, receipts, points and referrals", ".id names connect user activity to receipts, creator records, referrals, claims and EdgeBoard rank. Points, rewards and referrals are product records, not a promise that every user will receive money. Rewards can depend on eligibility, anti-abuse checks and the rules shown at the time."],
      ["User conduct", "Do not manipulate markets, spam launches, coordinate fake activity, tamper with evidence, harass reviewers, abuse referrals, attack the product, or use multiple accounts to bypass limits. NexMarkets can restrict product access, hide abusive content, void invalid activity, or hold a review when product safety requires it."],
      ["Changes", "NexMarkets can update product rules, fees, points, rewards, categories, API access and page copy as the product changes. Existing locked market rules should remain tied to the Resolution Card shown for that market."]
    ]
  },
  privacy: {
    title: "Privacy",
    kicker: "Data use",
    lead: "This explains the data NexMarkets uses for accounts, markets, receipts, settlement and safety.",
    sections: [
      ["Account and wallet data", "NexMarkets may use wallet addresses, .id names, balances shown inside the app, referral links, login state, connected accounts and public onchain activity connected to a wallet. This is used to display the product and keep records tied to the right user."],
      ["Market activity", "Market searches, trades, orders, launches, comments, receipts, claims, creator records and EdgeBoard activity can be stored. Some of this is public by design, especially market cards, creator pages, receipts, ranks and settled outcomes."],
      ["Device and product logs", "The product can collect basic device, browser, error, click, performance and security logs. These logs help find broken flows, reproduce bugs, stop abuse and keep mobile and desktop pages working."],
      ["Proof ops and reports", "If you submit a product or security issue, NexMarkets may store the report, screenshots, steps, affected page, wallet or .id shown in the report, and the result of the review. This keeps the issue traceable without turning reports into public debate."],
      ["Settlement records", "Native market settlement can use the market question, source URL, timestamps, Evidence Notes, reviewer eligibility checks, NexMind Audit output, challenge state and final receipt. Public settlement pages should show enough to explain the outcome without exposing private reviewer work that should remain private."],
      ["What is public", "Your public .id, creator markets, public receipts, leaderboard rank, comments, market launches and settled market outcomes can be visible to other users. Do not put private information into a market title, comment, report or source field."],
      ["Controls", "You can disconnect a wallet in your wallet or browser, stop using an account, avoid public posting, or request support review for account and data questions. Some records may need to remain because they are part of market settlement, security, accounting, or public product history."]
    ]
  },
  how: {
    title: "How it works",
    kicker: "User flow",
    lead: "From idea to trade, launch, settlement and receipt.",
    sections: [
      ["1. Search the narrative", "Start with a question or thesis. Search can surface an existing route, a native market, or a missing market that can be launched."],
      ["2. Trade the route if it exists", "If a clean market already exists, open it, read the rules, check liquidity and choose Ride or Fade. Do not trade from the title alone."],
      ["3. Launch the missing market", "If no clean route exists, use Launch. NexMind prepares a native draft with question, category, source, close time, fallback and preview. The creator reviews before payment."],
      ["4. Fund and place the trade", "Users fund their NexID trading balance, choose Ride or Fade, set amount or limit price, then confirm. The order result appears as a receipt or open order."],
      ["5. Close and settle", "When the market closes, trading stops. Native markets follow Proof flow. Existing markets follow the routed venue. A native market can settle as Ride, Fade, or Invalid."],
      ["6. Share the receipt", "A user can share trade, launch, rank or settlement receipts. Receipts should show the claim, market, side, status and result clearly."],
      ["7. Build a public record", "Clean trades, launches, referrals, receipts and settled markets build visible product history. EdgeBoard turns that activity into rank, movement and season records."]
    ]
  },
  docs: {
    title: "Docs",
    kicker: "Docs",
    lead: "Use this page to search, trade, launch, read rules, check settlement or explain NexMarkets.",
    sections: [
      {
        title: "NexMarkets at a glance",
        intro: "A market is a question with two tradeable sides. Ride means the outcome happens. Fade means it does not happen. Some markets are routed from another venue. Native markets are launched and settled inside NexMarkets.",
        blocks: [
          {
            type: "table",
            title: "Core terms",
            rows: [
              ["Market", "A question with a Ride side and a Fade side."],
              ["Ride", "The YES side. Choose it when you think the stated outcome will happen."],
              ["Fade", "The NO side. Choose it when you think the stated outcome will not happen."],
              ["Existing market", "A market surfaced from another venue. The routed venue controls its own rules and final result."],
              ["Native market", "A market launched on NexMarkets with its own Resolution Card, source, close time and fallback rule."],
              ["Invalid", "Used when the locked rules cannot fairly prove Ride or Fade."]
            ]
          },
          {
            type: "note",
            text: "Do not trade from the title alone. Open the market and read the source, close time, price, liquidity and settlement path before acting."
          }
        ]
      },
      {
        title: "Search and existing markets",
        intro: "Search is for finding a market before creating a new one. A good search uses the event, asset, team, creator, .id, wallet, source, or public claim you want to trade.",
        blocks: [
          {
            type: "text",
            title: "When search finds a route",
            paragraphs: [
              "Open the result and compare the exact question with what you meant to trade. A routed result may look close but use a different date, threshold, source, or final rule. If those details do not match, do not treat it as the same market.",
              "If the route is from another venue, the routed venue rules control the result. NexMarkets can show the route and context, but the market should still be judged by its own rule page."
            ]
          },
          {
            type: "example",
            title: "Search examples",
            goodTitle: "Useful search",
            good: "Will HYPE trade above $50 before July 31, 2026?",
            weakTitle: "Weak search",
            weak: "HYPE soon",
            why: "The weak search has no threshold, date, or outcome. It may return noisy results or push the user toward a bad launch."
          },
          {
            type: "check",
            title: "Before you launch instead",
            items: [
              "Search the main wording and the likely ticker or name.",
              "Check whether an existing market already uses the same source and deadline.",
              "Do not launch a copy of a route that already answers the same question.",
              "Launch only when the missing market can be settled from public evidence."
            ]
          }
        ]
      },
      {
        title: "Trading",
        intro: "Trading is choosing Ride or Fade and entering an order. The product should show side, amount, estimated shares, order type, and confirmation before the trade is placed.",
        blocks: [
          {
            type: "table",
            title: "Order types",
            rows: [
              ["Market order", "Fills against available liquidity. The final fill can be worse than the first visible price when liquidity is thin."],
              ["Limit order", "Only fills at your chosen price or better. It can stay open, partly fill, or never fill."],
              ["Open order", "A pending limit order. It should show side, price, size, filled amount and cancel action."],
              ["Holding", "A filled position. It should show side, size, entry, current value and receipt access."]
            ]
          },
          {
            type: "text",
            title: "Price reading",
            paragraphs: [
              "A 72 cent Ride price means traders are paying 72 cents for the Ride side at that moment. It is not a guarantee that Ride will win. Price can move when traders add liquidity, remove liquidity, place orders, or react to new public information."
            ]
          },
          {
            type: "check",
            title: "Before placing a trade",
            items: [
              "Can you state the Ride condition in one sentence?",
              "Can you state the Fade condition without guessing?",
              "Do you know when trading closes?",
              "Do you know the primary source?",
              "Are you comfortable losing the amount you place?"
            ]
          }
        ]
      },
      {
        title: "Launching a native market",
        intro: "A native launch turns a public question into a market. The creator confirms the final wording, even when NexMind helps prepare the draft.",
        blocks: [
          {
            type: "table",
            title: "Required launch fields",
            rows: [
              ["Question", "The exact outcome traders take a side on."],
              ["Category", "Crypto, Sports, Culture, or AI."],
              ["Outcome type", "Usually Ride/Fade, with Invalid available when the rules cannot settle fairly."],
              ["Source rule", "The public source and the exact evidence that matters."],
              ["Calculation method", "How numbers, ranks, time windows, and thresholds are compared."],
              ["Close time", "The time trading stops. State the time zone when needed."],
              ["Fallback rule", "What happens if the main source fails, changes, disappears, or stops supporting the answer."],
              ["Creator stake", "The fixed launch stake shown in the product. The product currently uses $20."]
            ]
          },
          {
            type: "example",
            title: "Launch wording",
            goodTitle: "Launchable",
            good: "Will a major AI lab release a public video generation model before September 30, 2026?",
            weakTitle: "Not launchable",
            weak: "Will AI videos become huge?",
            why: "Huge is not measurable. It gives reviewers no source, deadline, or threshold to apply."
          },
          {
            type: "check",
            title: "Creator check",
            items: [
              "The question has one outcome, not three hidden questions.",
              "The source can prove both Ride and Fade.",
              "The close time is clear.",
              "The fallback rule does not change the meaning of the market.",
              "Invalid is defined before trading starts."
            ]
          }
        ]
      },
      {
        title: "Market rules standard",
        intro: "A native market should be clear to someone who did not write it. The Resolution Card is the source of truth for the question, source, timing and fallback rule.",
        blocks: [
          {
            type: "table",
            title: "Resolution Card standard",
            rows: [
              ["Ride condition", "The exact evidence that makes Ride win."],
              ["Fade condition", "The exact evidence that makes Fade win."],
              ["Primary source", "The first source used for settlement."],
              ["Fallback source", "The backup source or backup rule."],
              ["Snapshot rule", "The time or method used to read a price, rank, announcement, score, or count."],
              ["Tie treatment", "What happens if the final value lands exactly on the threshold."],
              ["Invalid condition", "The event that prevents fair Ride or Fade settlement."]
            ]
          },
          {
            type: "example",
            title: "Threshold treatment",
            goodTitle: "Precise rule",
            good: "Ride wins if the official closing price is greater than $50.00. Fade wins if it is $50.00 or lower.",
            weakTitle: "Loose rule",
            weak: "Ride wins if it reaches around $50.",
            why: "“Around” cannot settle a market. It creates argument at the exact point where the rule should remove argument."
          },
          {
            type: "note",
            text: "A market title can be short. The Resolution Card cannot be vague. Traders should be able to read it and know how the result will be checked."
          }
        ]
      },
      {
        title: "Settlement",
        intro: "Native settlement applies the locked Resolution Card to public evidence. The outcome can be Ride, Fade, or Invalid. Proof flow has its own page, so this section covers what a user needs during trading and launch.",
        blocks: [
          {
            type: "text",
            title: "Normal settlement path",
            paragraphs: [
              "When trading closes, the market is checked against its question, source, close time, calculation method and fallback rule. If the evidence is enough, the outcome can be proposed and finalized.",
              "If the proposal is challenged or the evidence is not straightforward, Evidence Review can open. Qualified conflict-free reviewers submit private Evidence Notes through commit and reveal. NexMind Audit checks source alignment, timestamps, contradictions, wrong-source use, copy patterns, conflicts, failed reveals and material evidence changes."
            ]
          },
          {
            type: "table",
            title: "Final outcomes",
            rows: [
              ["Ride", "The locked rules prove that the stated outcome happened."],
              ["Fade", "The locked rules prove that the stated outcome did not happen."],
              ["Invalid", "The locked rules cannot fairly prove either side because the source, timing, evidence, or market wording failed."]
            ]
          },
          {
            type: "check",
            title: "What is not a dispute",
            items: [
              "Being wrong on a trade.",
              "Disliking the market price.",
              "Wanting the source changed after close.",
              "Preferring a different interpretation that was not written into the Resolution Card."
            ]
          }
        ]
      },
      {
        title: "Receipts, .id and EdgeBoard",
        intro: "Receipts turn trades and launches into shareable records. A .id makes those records readable. EdgeBoard ranks activity across timeframes and segments.",
        blocks: [
          {
            type: "table",
            title: "Records users see",
            rows: [
              ["Trade receipt", "Shows market, side, price, status and trade context."],
              ["Launch receipt", "Shows creator, market, stake, source and launch status."],
              ["Settlement receipt", "Shows final outcome and the settlement path."],
              ["Rank receipt", "Shows EdgeBoard movement, rank and comparison context."],
              [".id", "A readable identity tied to receipts, creator launches, referrals, claims and rank context."]
            ]
          },
          {
            type: "text",
            title: "EdgeBoard search",
            paragraphs: [
              "EdgeBoard displays the top 100 by default, but search lets a user check where a .id, username, or wallet ranks beyond the visible list when the data is available. The search should show the rank, segment, timeframe and nearby context without forcing the user to scroll the board."
            ]
          },
          {
            type: "note",
            text: "A receipt should describe what happened in the product. It should not present a pending market as settled or hide the market context needed to understand the claim."
          }
        ]
      },
      {
        title: "Creators and fees",
        intro: "Creators earn when they launch native markets that traders use and that remain valid under their own rules.",
        blocks: [
          {
            type: "text",
            title: "Creator fee",
            paragraphs: [
              "The current native creator fee shown in the product is 1% of market volume when the fee path applies. If a native market reaches $50,000 in trading volume, the creator fee is $500."
            ]
          },
          {
            type: "table",
            title: "What protects the market",
            rows: [
              ["Launch stake", "A fixed $20 stake shown before launch."],
              ["Bond portion", "The part of the stake that can be locked to discourage careless launches."],
              ["Fee portion", "The part used as the launch fee where the product applies it."],
              ["Fee eligibility", "Can be lost when the market is duplicate, abusive, unclear, manipulated, invalid, or not supported by its Resolution Card."]
            ]
          },
          {
            type: "check",
            title: "Good creator habits",
            items: [
              "Launch from public disagreement, not private claims.",
              "Use one measurable source.",
              "Write the fallback before the market opens.",
              "Avoid biased titles.",
              "Check whether the same market already exists."
            ]
          }
        ]
      },
      {
        title: "NexMind",
        intro: "NexMind helps prepare markets. It does not replace the creator, the market rules, or settlement review.",
        blocks: [
          {
            type: "table",
            title: "What NexMind handles",
            rows: [
              ["Drafting", "Turns a market idea into question, source, timing, calculation and fallback fields."],
              ["Warnings", "Flags vague terms, weak source support, missing timing, one-sided wording and source mismatch."],
              ["Preview", "Shows what changed before the creator confirms."],
              ["Audit", "During Proof flow, checks evidence notes against source, timestamp, conflict and consistency rules."]
            ]
          },
          {
            type: "note",
            text: "NexMind can help find weak spots. The creator still confirms the launch. Reviewers still submit independent notes when Evidence Review is needed."
          }
        ]
      },
      {
        title: "Glossary",
        intro: "Use these terms when reading market pages, receipts, rules and settlement records.",
        blocks: [
          {
            type: "defs",
            title: "Glossary",
            items: [
              ["Close time", "The time trading stops for the market."],
              ["Source", "The public place used to check the result."],
              ["Fallback rule", "The backup rule used if the primary source fails or no longer supports the answer."],
              ["Resolution Card", "The locked rule set used to settle a native market."],
              ["Evidence Review", "A review stage where qualified conflict-free reviewers submit independent Evidence Notes."],
              ["Evidence Note", "A private reviewer note that explains evidence, source, timing and outcome reasoning."],
              ["NexMind Audit", "A check for source alignment, timestamps, contradictions, wrong-source use, conflicts, failed reveals and suspicious note patterns."],
              ["ProofOps", "The product quality and security review lane. It handles bugs, broken flows and fix records, not market opinions."],
              ["Creator bond", "The bond portion connected to a native launch stake."],
              ["Creator fee", "The creator share of native market volume when the fee path applies."]
            ]
          }
        ]
      }
    ]
  }
};

export type LegalKey = keyof typeof legalPages;

export const legalLabels: Record<LegalKey, string> = {
  faq: "FAQ",
  terms: "Terms",
  privacy: "Privacy",
  risk: "Risk Notice",
  how: "How it works",
  docs: "Docs"
};
