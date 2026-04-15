/**
 * Migrate a single PartnerCampaigns v1 campaign onto v2.
 *
 * Reads the v1 leaderboard, creates a mirror campaign on v2, enrolls every
 * v1 participant, then awards each their v1 points capped at POINT_CAP.
 * Finally flips the DB Campaign row to point at v2.
 *
 * Usage (from webapp/):
 *     DRY_RUN=1 tsx scripts/migrate-v1-campaign-to-v2.ts     # preview only
 *     DRY_RUN=0 tsx scripts/migrate-v1-campaign-to-v2.ts     # actually migrate
 *
 * Required env:
 *     V1_ONCHAIN_CAMPAIGN_ID     On-chain id of the campaign on v1 to migrate
 *     DB_CAMPAIGN_ID             Prisma Campaign.id that currently references v1
 *     OWNER_PRIVATE_KEY          Owner of the v2 PartnerCampaigns contract
 *     RELAYER_PRIVATE_KEY        Relayer wallet of the v2 contract
 *     RPC_URL                    Base RPC
 *     PARTNER_CAMPAIGNS_V1_ADDRESS
 *     PARTNER_CAMPAIGNS_ADDRESS  (v2)
 *
 * Optional env:
 *     POINT_CAP                   default 100
 *     V2_PLAN                     0 LAUNCH_SPRINT | 1 DEEP_DIVE | 2 CUSTOM (default 2)
 *     V2_CUSTOM_WINNER_CAP        default 100 (only used when plan = CUSTOM)
 *     V2_ONCHAIN_CAMPAIGN_ID      If set, skip createCampaign and resume against
 *                                 this existing v2 id (for recovering from a
 *                                 partial run).
 */

import "dotenv/config";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// ABIs (minimal)
// ─────────────────────────────────────────────────────────────────────────────

const V1_ABI = [
    "function getLeaderboard(uint256) view returns (address[] users, uint256[] points)",
    "function getCampaign(uint256) view returns (tuple(uint256 id, string title, string description, string category, string level, string thumbnailUrl, string duration, uint256 totalTasks, address sponsor, string sponsorName, string sponsorLogo, uint256 prizePool, uint256 startTime, uint256 endTime, bool isActive))",
];

const V2_OWNER_ABI = [
    "function createCampaign(string _title, string _description, string _category, string _level, string _thumbnailUrl, uint256 _totalTasks, address _sponsor, string _sponsorName, string _sponsorLogo, uint256 _prizePool, uint256 _startTime, uint8 _plan, uint256 _customWinnerCap) external returns (uint256)",
    "function campaignCounter() view returns (uint256)",
    "event CampaignCreated(uint256 indexed campaignId, uint8 indexed plan, string title, address indexed sponsor, uint256 winnerCap, uint256 endTime)",
];

const V2_RELAYER_ABI = [
    "function enroll(uint256 _campaignId, address _user) external",
    "function addPoints(uint256 _campaignId, address _user, uint256 _points) external",
    "function isEnrolled(address, uint256) view returns (bool)",
    "function campaignPoints(uint256, address) view returns (uint256)",
    "function isCampaignLive(uint256) view returns (bool)",
];

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
    const v = process.env[key];
    if (!v || v.length === 0) throw new Error(`Missing env: ${key}`);
    return v;
}

const DRY_RUN = process.env.DRY_RUN !== "0";
const POINT_CAP = BigInt(process.env.POINT_CAP ?? "100");
const V2_PLAN = Number(process.env.V2_PLAN ?? "2");
const V2_CUSTOM_WINNER_CAP = BigInt(process.env.V2_CUSTOM_WINNER_CAP ?? "100");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function capPoints(raw: bigint): bigint {
    return raw > POINT_CAP ? POINT_CAP : raw;
}

async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function isRateLimit(err: unknown): boolean {
    const msg = JSON.stringify(err ?? "").toLowerCase();
    return (
        msg.includes("rate limit") ||
        msg.includes("too many requests") ||
        msg.includes("-32016") ||
        msg.includes("-32005") ||
        msg.includes("429")
    );
}

async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 10): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const backoff = isRateLimit(err) ? 5000 + attempt * 2000 : 2000 + attempt * 1000;
            if (attempt === maxAttempts - 1) break;
            console.log(
                `${label} failed (attempt ${attempt + 1}/${maxAttempts})${isRateLimit(err) ? " — rate limited" : ""}, retrying in ${backoff}ms…`,
            );
            await sleep(backoff);
        }
    }
    throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    const rpcUrl = requireEnv("RPC_URL");
    const v1Addr = requireEnv("PARTNER_CAMPAIGNS_V1_ADDRESS");
    const v2Addr = requireEnv("PARTNER_CAMPAIGNS_ADDRESS");
    const v1OnchainId = BigInt(requireEnv("V1_ONCHAIN_CAMPAIGN_ID"));
    const dbCampaignId = Number(requireEnv("DB_CAMPAIGN_ID"));

    const provider = new JsonRpcProvider(rpcUrl);
    const ownerKey = requireEnv("OWNER_PRIVATE_KEY");
    const relayerKey = requireEnv("RELAYER_PRIVATE_KEY");
    const ownerSigner = new Wallet(ownerKey, provider);
    const relayerSigner = new Wallet(relayerKey, provider);

    console.log("─".repeat(70));
    console.log(`Migration mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
    console.log(`V1 contract:    ${v1Addr}`);
    console.log(`V1 campaign id: ${v1OnchainId}`);
    console.log(`V2 contract:    ${v2Addr}`);
    console.log(`DB Campaign.id: ${dbCampaignId}`);
    console.log(`Owner:          ${await ownerSigner.getAddress()}`);
    console.log(`Relayer:        ${await relayerSigner.getAddress()}`);
    console.log(`Point cap:      ${POINT_CAP}`);
    console.log("─".repeat(70));

    // 1. Read v1 state
    const v1ReadOnly = new Contract(v1Addr, V1_ABI, provider);
    const [v1Meta, [v1Users, v1Points]] = await Promise.all([
        v1ReadOnly.getCampaign(v1OnchainId) as Promise<{
            title: string;
            description: string;
            category: string;
            level: string;
            thumbnailUrl: string;
            totalTasks: bigint;
            sponsor: string;
            sponsorName: string;
            sponsorLogo: string;
            prizePool: bigint;
        }>,
        v1ReadOnly.getLeaderboard(v1OnchainId) as Promise<[string[], bigint[]]>,
    ]);

    console.log(`V1 campaign: "${v1Meta.title}" — ${v1Users.length} participants`);
    const previewRows = v1Users.map((u, i) => ({
        user: u,
        v1Points: v1Points[i].toString(),
        v2Points: capPoints(v1Points[i]).toString(),
    }));
    console.table(previewRows);

    // 2. Confirm DB campaign exists and is the v1 one
    const dbCampaign = await prisma.campaign.findUnique({
        where: { id: dbCampaignId },
        select: {
            id: true,
            title: true,
            partnerContractAddress: true,
            onChainCampaignId: true,
            contractType: true,
        },
    });
    if (!dbCampaign) throw new Error(`DB Campaign ${dbCampaignId} not found`);
    if (dbCampaign.contractType !== "PARTNER_CAMPAIGNS") {
        throw new Error(`DB Campaign ${dbCampaignId} is not a PARTNER_CAMPAIGNS campaign`);
    }
    if (dbCampaign.partnerContractAddress?.toLowerCase() !== v1Addr.toLowerCase()) {
        throw new Error(
            `DB Campaign ${dbCampaignId} partnerContractAddress is ${dbCampaign.partnerContractAddress}, expected ${v1Addr}`,
        );
    }
    if (BigInt(dbCampaign.onChainCampaignId ?? -1) !== v1OnchainId) {
        throw new Error(
            `DB Campaign ${dbCampaignId} onChainCampaignId is ${dbCampaign.onChainCampaignId}, expected ${v1OnchainId}`,
        );
    }
    console.log(`DB Campaign verified: "${dbCampaign.title}" points at v1/${v1OnchainId}`);

    if (DRY_RUN) {
        console.log("DRY_RUN set — stopping before any writes.");
        return;
    }

    // 3. Create v2 campaign (or resume against an existing one)
    const v2Owner = new Contract(v2Addr, V2_OWNER_ABI, ownerSigner);
    let v2OnchainId: bigint | null = null;

    const v2IdOverride = process.env.V2_ONCHAIN_CAMPAIGN_ID;
    if (v2IdOverride !== undefined && v2IdOverride !== "") {
        v2OnchainId = BigInt(v2IdOverride);
        console.log(`Resuming against existing v2 campaign id ${v2OnchainId} (V2_ONCHAIN_CAMPAIGN_ID set)`);
    } else {
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        const createTx = await v2Owner.createCampaign(
            v1Meta.title,
            v1Meta.description,
            v1Meta.category,
            v1Meta.level,
            v1Meta.thumbnailUrl,
            v1Meta.totalTasks,
            v1Meta.sponsor,
            v1Meta.sponsorName,
            v1Meta.sponsorLogo,
            v1Meta.prizePool,
            nowSec,
            V2_PLAN,
            V2_CUSTOM_WINNER_CAP,
        );
        console.log(`createCampaign tx: ${createTx.hash}`);
        const createReceipt = await createTx.wait();
        if (!createReceipt) throw new Error("createCampaign tx had no receipt");

        // Pull the new id from the CampaignCreated log
        const iface = v2Owner.interface;
        for (const log of createReceipt.logs) {
            try {
                const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
                if (parsed?.name === "CampaignCreated") {
                    v2OnchainId = parsed.args.campaignId as bigint;
                    break;
                }
            } catch {
                // not our event
            }
        }
        if (v2OnchainId === null) {
            const counter = (await v2Owner.campaignCounter()) as bigint;
            v2OnchainId = counter - 1n;
        }
        console.log(`V2 campaign created with onchain id ${v2OnchainId}`);
    }

    // 4. Enroll + addPoints per user, idempotent
    const v2Relayer = new Contract(v2Addr, V2_RELAYER_ABI, relayerSigner);

    const live = await withRetry(
        "isCampaignLive",
        async () => (await v2Relayer.isCampaignLive(v2OnchainId)) as boolean,
    );
    if (!live) throw new Error("V2 campaign is not live — check startTime/plan");

    for (let i = 0; i < v1Users.length; i++) {
        const user = v1Users[i];
        const target = capPoints(v1Points[i]);
        if (target === 0n) {
            console.log(`[${i + 1}/${v1Users.length}] ${user} — skipping (0 points on v1)`);
            continue;
        }

        const alreadyEnrolled = await withRetry(
            `isEnrolled(${user})`,
            async () => (await v2Relayer.isEnrolled(user, v2OnchainId)) as boolean,
        );
        if (!alreadyEnrolled) {
            const enrollTx = await withRetry(`enroll(${user})`, () =>
                v2Relayer.enroll(v2OnchainId, user),
            );
            await enrollTx.wait();
            console.log(`[${i + 1}/${v1Users.length}] enrolled ${user} (tx ${enrollTx.hash})`);
            // Poll until the RPC reflects the enroll — some providers lag
            // several seconds behind tx confirmation.
            for (let attempt = 0; attempt < 15; attempt++) {
                await sleep(1500);
                const ok = await withRetry(
                    `isEnrolled-poll(${user})`,
                    async () => (await v2Relayer.isEnrolled(user, v2OnchainId)) as boolean,
                );
                if (ok) break;
                if (attempt === 14) {
                    throw new Error(`Enrollment for ${user} not visible after polling`);
                }
            }
        } else {
            console.log(`[${i + 1}/${v1Users.length}] ${user} already enrolled on v2`);
        }

        const currentV2 = await withRetry(
            `campaignPoints(${user})`,
            async () => (await v2Relayer.campaignPoints(v2OnchainId, user)) as bigint,
        );
        if (currentV2 >= target) {
            console.log(
                `[${i + 1}/${v1Users.length}] ${user} already has ${currentV2} on v2 (>= ${target}), skipping addPoints`,
            );
            continue;
        }
        const delta = target - currentV2;
        const addTx = await withRetry(`addPoints(${user})`, () =>
            v2Relayer.addPoints(v2OnchainId, user, delta),
        );
        await addTx.wait();
        console.log(
            `[${i + 1}/${v1Users.length}] addPoints(${user}, +${delta}) -> ${target} (tx ${addTx.hash})`,
        );
        await sleep(1500);
    }

    // 5. Flip the DB row
    await prisma.campaign.update({
        where: { id: dbCampaignId },
        data: {
            partnerContractAddress: v2Addr,
            onChainCampaignId: Number(v2OnchainId),
        },
    });
    console.log(`DB Campaign ${dbCampaignId} flipped to v2/${v2OnchainId}`);

    console.log("─".repeat(70));
    console.log("Migration complete.");
    console.log(`Next steps:`);
    console.log(`  1. Delete entry ${dbCampaignId} from DISPLAY_POINT_CAPS_BY_CAMPAIGN_ID`);
    console.log(`  2. Verify the subgraph picks up v2 PointsAwarded events`);
    console.log(`  3. Spot-check the leaderboard for this campaign in the webapp`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
