import prisma from '@/lib/prisma';
import { normalizePartnerCampaignDisplayPoints } from '@/lib/services/onchain-points.service';

const MAX_SAFE_POINTS = BigInt(Number.MAX_SAFE_INTEGER);

type UserCampaignRow = {
    user: string;
    contract: string;
    campaignId: string;
    points: string;
};

type UserTotalRow = {
    id: string;
    totalPoints: string;
};

function normalize(addr: string) {
    return addr.trim().toLowerCase();
}

function toSafeNumber(value: bigint): number {
    if (value <= 0n) return 0;
    return Number(value > MAX_SAFE_POINTS ? MAX_SAFE_POINTS : value);
}

function getSubgraphUrl(): string {
    const url =
        process.env.LEADERBOARD_SUBGRAPH_URL ??
        process.env.NEXT_PUBLIC_LEADERBOARD_SUBGRAPH_URL;
    if (!url) {
        throw new Error(
            'LEADERBOARD_SUBGRAPH_URL (or NEXT_PUBLIC_LEADERBOARD_SUBGRAPH_URL) is required',
        );
    }
    return url;
}

async function queryGraph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const url = getSubgraphUrl();
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        cache: 'no-store',
    });
    if (!res.ok) {
        throw new Error(`Subgraph request failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (body.errors && body.errors.length > 0) {
        throw new Error(`Subgraph errors: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    if (!body.data) {
        throw new Error('Subgraph returned no data');
    }
    return body.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Global leaderboard (cumulative across all PartnerCampaigns deployments)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cumulative partner-campaign points per wallet, sourced from the subgraph.
 *
 * Pulls raw UserCampaign rows so per-campaign display caps (e.g. campaign 3
 * capped at 100) can be applied before summing — matching the legacy on-chain
 * behaviour. Wallet keys and returned values are lowercase.
 */
export async function getSubgraphDisplayPointsByWallet(
    walletAddresses: string[],
): Promise<Map<string, number>> {
    const wallets = Array.from(
        new Set(
            walletAddresses
                .filter((w): w is string => typeof w === 'string')
                .map(normalize)
                .filter((w) => w.startsWith('0x') && w.length === 42),
        ),
    );

    if (wallets.length === 0) return new Map();

    // Map (contract + onchainCampaignId) → DB campaign so we can apply caps.
    const dbCampaigns = await prisma.campaign.findMany({
        where: {
            contractType: 'PARTNER_CAMPAIGNS',
            onChainCampaignId: { not: null },
        },
        select: {
            id: true,
            onChainCampaignId: true,
            partnerContractAddress: true,
        },
    });
    const campaignKey = (contract: string, onchainId: number) =>
        `${normalize(contract)}-${onchainId}`;
    const campaignIdByKey = new Map<string, number>();
    for (const c of dbCampaigns) {
        if (c.onChainCampaignId === null || !c.partnerContractAddress) continue;
        campaignIdByKey.set(campaignKey(c.partnerContractAddress, c.onChainCampaignId), c.id);
    }

    // Paginated fetch — one wallet may have many campaigns, many wallets possible.
    const pageSize = 1000;
    const rows: UserCampaignRow[] = [];
    let skip = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const data = await queryGraph<{ userCampaigns: UserCampaignRow[] }>(
            `query ($wallets: [Bytes!]!, $first: Int!, $skip: Int!) {
                userCampaigns(
                    first: $first
                    skip: $skip
                    where: { user_in: $wallets }
                    orderBy: id
                    orderDirection: asc
                ) {
                    user
                    contract
                    campaignId
                    points
                }
            }`,
            { wallets, first: pageSize, skip },
        );
        rows.push(...data.userCampaigns);
        if (data.userCampaigns.length < pageSize) break;
        skip += pageSize;
    }

    const totals = new Map<string, bigint>();
    for (const w of wallets) totals.set(w, 0n);

    for (const row of rows) {
        const wallet = normalize(row.user);
        if (!totals.has(wallet)) continue;
        const key = campaignKey(row.contract, Number(row.campaignId));
        const dbCampaignId = campaignIdByKey.get(key);
        const raw = BigInt(row.points);
        const displayed =
            dbCampaignId !== undefined
                ? normalizePartnerCampaignDisplayPoints(dbCampaignId, raw)
                : raw;
        totals.set(wallet, (totals.get(wallet) ?? 0n) + displayed);
    }

    return new Map(
        Array.from(totals.entries()).map(([w, total]) => [w, toSafeNumber(total)]),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-campaign leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export type CampaignLeaderboardEntry = {
    walletAddress: string;
    points: bigint;
};

/**
 * Full ranked leaderboard for one campaign, sourced from the subgraph.
 * Rows are sorted by `points` desc and come from the contract-namespaced
 * `UserCampaign` entity, so v1/v2 ids never collide.
 */
export async function getSubgraphCampaignLeaderboard(
    contractAddress: string,
    onchainCampaignId: number,
    limit = 1000,
): Promise<CampaignLeaderboardEntry[]> {
    const contract = normalize(contractAddress);
    const entries: CampaignLeaderboardEntry[] = [];
    const pageSize = Math.min(limit, 1000);
    let skip = 0;

    while (entries.length < limit) {
        const remaining = limit - entries.length;
        const take = Math.min(pageSize, remaining);

        const data = await queryGraph<{ userCampaigns: UserCampaignRow[] }>(
            `query ($contract: Bytes!, $cid: BigInt!, $first: Int!, $skip: Int!) {
                userCampaigns(
                    first: $first
                    skip: $skip
                    where: { contract: $contract, campaignId: $cid }
                    orderBy: points
                    orderDirection: desc
                ) {
                    user
                    points
                }
            }`,
            { contract, cid: onchainCampaignId.toString(), first: take, skip },
        );

        for (const row of data.userCampaigns) {
            entries.push({
                walletAddress: normalize(row.user),
                points: BigInt(row.points),
            });
        }

        if (data.userCampaigns.length < take) break;
        skip += take;
    }

    return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health / fallback helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convenience: total display points for a single wallet via the subgraph.
 */
export async function getSubgraphDisplayPoints(walletAddress: string): Promise<number> {
    const map = await getSubgraphDisplayPointsByWallet([walletAddress]);
    return map.get(normalize(walletAddress)) ?? 0;
}

export function isSubgraphConfigured(): boolean {
    return Boolean(
        process.env.LEADERBOARD_SUBGRAPH_URL ?? process.env.NEXT_PUBLIC_LEADERBOARD_SUBGRAPH_URL,
    );
}

/**
 * Ping-only query — useful for startup checks. Returns true if the endpoint
 * responds with a non-error GraphQL body. We also expose a tiny UserTotal
 * query so callers can verify the schema, not just the HTTP route.
 */
export async function subgraphHealthCheck(): Promise<boolean> {
    try {
        await queryGraph<{ userTotals: UserTotalRow[] }>(
            `query { userTotals(first: 1) { id totalPoints } }`,
            {},
        );
        return true;
    } catch {
        return false;
    }
}
