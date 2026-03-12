"use client";

import { useState, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog, parseAbi, type Hash } from "viem";
import { NEXID_CAMPAIGNS_ABI } from "@/lib/contracts/nexid-campaigns-abi";
import { PARTNER_CAMPAIGNS_ABI } from "@/lib/contracts/partner-campaigns-abi";

type ContractType = "NEXID_CAMPAIGNS" | "PARTNER_CAMPAIGNS";

const CONTRACT_ADDRESSES: Record<ContractType, `0x${string}` | undefined> = {
    NEXID_CAMPAIGNS: (process.env.NEXT_PUBLIC_NEXID_CAMPAIGNS_ADDRESS || undefined) as
        | `0x${string}`
        | undefined,
    PARTNER_CAMPAIGNS: (process.env.NEXT_PUBLIC_PARTNER_CAMPAIGNS_ADDRESS || undefined) as
        | `0x${string}`
        | undefined,
};

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_CAMPAIGN_ESCROW_ADDRESS || undefined) as
    | `0x${string}`
    | undefined;

const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || undefined) as
    | `0x${string}`
    | undefined;

const ABI_MAP = {
    NEXID_CAMPAIGNS: NEXID_CAMPAIGNS_ABI,
    PARTNER_CAMPAIGNS: PARTNER_CAMPAIGNS_ABI,
} as const;

// Minimal ABIs for escrow + USDC interactions
const ESCROW_ABI = parseAbi([
    'function createCampaign(uint256 _partnerCampaignId, address _sponsor, uint256 _endTimestamp) external returns (uint256)',
    'function fundCampaign(uint256 escrowId, uint256 amount) external',
    'event CampaignCreated(uint256 indexed escrowId, uint256 indexed partnerCampaignId, address indexed sponsor, uint256 endTimestamp)',
]);

const ERC20_ABI = parseAbi([
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
]);

// ─── Params for NexID createCampaign ────────────────
export interface NexIDCreateParams {
    title: string;
    description: string;
    longDescription: string;
    instructor: string;
    objectives: string[];
    prerequisites: string[];
    category: string;
    level: string;
    thumbnailUrl: string;
    duration: string;
    totalLessons: bigint;
}

// ─── Params for Partner createCampaign ──────────────
export interface PartnerCreateParams {
    title: string;
    description: string;
    category: string;
    level: string;
    thumbnailUrl: string;
    duration: string;
    totalTasks: bigint;
    sponsor: `0x${string}`;
    sponsorName: string;
    sponsorLogo: string;
    prizePool: bigint;
    startTime: bigint;
    endTime: bigint;
}

export type TxState = {
    loading: boolean;
    txHash: Hash | null;
    error: string | null;
    onChainCampaignId: number | null;
};

/**
 * Hook that exposes admin contract write functions.
 * All transactions are signed by the connected wallet (admin/owner).
 */
export function useAdminContract() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();

    const [state, setState] = useState<TxState>({
        loading: false,
        txHash: null,
        error: null,
        onChainCampaignId: null,
    });

    const resetState = useCallback(() => {
        setState({ loading: false, txHash: null, error: null, onChainCampaignId: null });
    }, []);

    // ─── CREATE CAMPAIGN ──────────────────────────────
    const createCampaignOnChain = useCallback(
        async (
            contractType: ContractType,
            params: NexIDCreateParams | PartnerCreateParams,
        ): Promise<{ onChainCampaignId: number; txHash: Hash } | null> => {
            const contractAddress = CONTRACT_ADDRESSES[contractType];
            if (!contractAddress) {
                setState((s) => ({ ...s, error: `${contractType} contract address not configured` }));
                return null;
            }
            if (!walletClient || !publicClient) {
                setState((s) => ({ ...s, error: "Wallet not connected" }));
                return null;
            }

            setState({ loading: true, txHash: null, error: null, onChainCampaignId: null });

            try {
                let hash: Hash;

                if (contractType === "NEXID_CAMPAIGNS") {
                    const p = params as NexIDCreateParams;
                    hash = await walletClient.writeContract({
                        address: contractAddress,
                        abi: NEXID_CAMPAIGNS_ABI,
                        functionName: "createCampaign",
                        args: [
                            p.title,
                            p.description,
                            p.longDescription,
                            p.instructor,
                            p.objectives,
                            p.prerequisites,
                            p.category,
                            p.level,
                            p.thumbnailUrl,
                            p.duration,
                            p.totalLessons,
                        ],
                    });
                } else {
                    const p = params as PartnerCreateParams;
                    hash = await walletClient.writeContract({
                        address: contractAddress,
                        abi: PARTNER_CAMPAIGNS_ABI,
                        functionName: "createCampaign",
                        args: [
                            p.title,
                            p.description,
                            p.category,
                            p.level,
                            p.thumbnailUrl,
                            p.duration,
                            p.totalTasks,
                            p.sponsor,
                            p.sponsorName,
                            p.sponsorLogo,
                            p.prizePool,
                            p.startTime,
                            p.endTime,
                        ],
                    });
                }

                setState((s) => ({ ...s, txHash: hash }));

                const receipt = await publicClient.waitForTransactionReceipt({ hash });

                // Parse the CampaignCreated event to get the on-chain campaign ID
                const abi = ABI_MAP[contractType];
                let onChainCampaignId: number | null = null;

                for (const log of receipt.logs) {
                    try {
                        const decoded = decodeEventLog({
                            abi,
                            data: log.data,
                            topics: log.topics,
                        });
                        if (decoded.eventName === "CampaignCreated") {
                            onChainCampaignId = Number((decoded.args as { campaignId: bigint }).campaignId);
                            break;
                        }
                    } catch {
                        // Not our event, skip
                    }
                }

                setState({ loading: false, txHash: hash, error: null, onChainCampaignId });

                if (onChainCampaignId !== null) {
                    return { onChainCampaignId, txHash: hash };
                }

                // Fallback: if we couldn't parse the event, estimate from campaignCounter
                setState((s) => ({
                    ...s,
                    error: "Transaction succeeded but could not parse campaign ID from receipt",
                }));
                return null;
            } catch (err) {
                const message = err instanceof Error ? err.message : "Transaction failed";
                setState({ loading: false, txHash: null, error: message, onChainCampaignId: null });
                return null;
            }
        },
        [walletClient, publicClient],
    );

    // ─── DEACTIVATE CAMPAIGN ──────────────────────────
    const deactivateCampaignOnChain = useCallback(
        async (
            contractType: ContractType,
            campaignId: bigint,
        ): Promise<{ txHash: Hash } | null> => {
            const contractAddress = CONTRACT_ADDRESSES[contractType];
            if (!contractAddress) {
                setState((s) => ({ ...s, error: `${contractType} contract address not configured` }));
                return null;
            }
            if (!walletClient || !publicClient) {
                setState((s) => ({ ...s, error: "Wallet not connected" }));
                return null;
            }

            setState({ loading: true, txHash: null, error: null, onChainCampaignId: null });

            try {
                const abi = ABI_MAP[contractType];
                const hash = await walletClient.writeContract({
                    address: contractAddress,
                    abi,
                    functionName: "deactivateCampaign",
                    args: [campaignId],
                });

                setState((s) => ({ ...s, txHash: hash }));
                await publicClient.waitForTransactionReceipt({ hash });

                setState({ loading: false, txHash: hash, error: null, onChainCampaignId: null });
                return { txHash: hash };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Transaction failed";
                setState({ loading: false, txHash: null, error: message, onChainCampaignId: null });
                return null;
            }
        },
        [walletClient, publicClient],
    );

    // ─── UPDATE CAMPAIGN ──────────────────────────────
    const updateCampaignOnChain = useCallback(
        async (
            contractType: ContractType,
            campaignId: bigint,
            params: NexIDCreateParams | PartnerCreateParams,
        ): Promise<{ txHash: Hash } | null> => {
            const contractAddress = CONTRACT_ADDRESSES[contractType];
            if (!contractAddress) {
                setState((s) => ({ ...s, error: `${contractType} contract address not configured` }));
                return null;
            }
            if (!walletClient || !publicClient) {
                setState((s) => ({ ...s, error: "Wallet not connected" }));
                return null;
            }

            setState({ loading: true, txHash: null, error: null, onChainCampaignId: null });

            try {
                let hash: Hash;

                if (contractType === "NEXID_CAMPAIGNS") {
                    const p = params as NexIDCreateParams;
                    hash = await walletClient.writeContract({
                        address: contractAddress,
                        abi: NEXID_CAMPAIGNS_ABI,
                        functionName: "updateCampaign",
                        args: [
                            campaignId,
                            p.title,
                            p.description,
                            p.longDescription,
                            p.instructor,
                            p.objectives,
                            p.prerequisites,
                            p.category,
                            p.level,
                            p.thumbnailUrl,
                            p.duration,
                            p.totalLessons,
                        ],
                    });
                } else {
                    const p = params as PartnerCreateParams;
                    hash = await walletClient.writeContract({
                        address: contractAddress,
                        abi: PARTNER_CAMPAIGNS_ABI,
                        functionName: "updateCampaign",
                        args: [
                            campaignId,
                            p.title,
                            p.description,
                            p.category,
                            p.level,
                            p.thumbnailUrl,
                            p.duration,
                            p.totalTasks,
                            p.sponsor,
                            p.sponsorName,
                            p.sponsorLogo,
                            p.prizePool,
                            p.startTime,
                            p.endTime,
                        ],
                    });
                }

                setState((s) => ({ ...s, txHash: hash }));
                await publicClient.waitForTransactionReceipt({ hash });

                setState({ loading: false, txHash: hash, error: null, onChainCampaignId: null });
                return { txHash: hash };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Transaction failed";
                setState({ loading: false, txHash: null, error: message, onChainCampaignId: null });
                return null;
            }
        },
        [walletClient, publicClient],
    );

    // ─── CREATE ESCROW CAMPAIGN ─────────────────────────
    const createEscrowCampaign = useCallback(
        async (
            partnerCampaignId: number,
            sponsor: `0x${string}`,
            endTimestamp: bigint,
        ): Promise<{ escrowId: number; txHash: Hash } | null> => {
            if (!ESCROW_ADDRESS) {
                setState((s) => ({ ...s, error: "Escrow contract address not configured" }));
                return null;
            }
            if (!walletClient || !publicClient) {
                setState((s) => ({ ...s, error: "Wallet not connected" }));
                return null;
            }

            setState({ loading: true, txHash: null, error: null, onChainCampaignId: null });

            try {
                const hash = await walletClient.writeContract({
                    address: ESCROW_ADDRESS,
                    abi: ESCROW_ABI,
                    functionName: "createCampaign",
                    args: [BigInt(partnerCampaignId), sponsor, endTimestamp],
                });

                setState((s) => ({ ...s, txHash: hash }));
                const receipt = await publicClient.waitForTransactionReceipt({ hash });

                let escrowId: number | null = null;
                for (const log of receipt.logs) {
                    try {
                        const decoded = decodeEventLog({
                            abi: ESCROW_ABI,
                            data: log.data,
                            topics: log.topics,
                        });
                        if (decoded.eventName === "CampaignCreated") {
                            escrowId = Number((decoded.args as { escrowId: bigint }).escrowId);
                            break;
                        }
                    } catch {
                        // Not our event
                    }
                }

                setState({ loading: false, txHash: hash, error: null, onChainCampaignId: null });

                if (escrowId !== null) {
                    return { escrowId, txHash: hash };
                }

                setState((s) => ({
                    ...s,
                    error: "Escrow campaign created but could not parse ID from receipt",
                }));
                return null;
            } catch (err) {
                const message = err instanceof Error ? err.message : "Escrow transaction failed";
                setState({ loading: false, txHash: null, error: message, onChainCampaignId: null });
                return null;
            }
        },
        [walletClient, publicClient],
    );

    // ─── APPROVE USDC FOR ESCROW ──────────────────────
    const approveUSDC = useCallback(
        async (amount: bigint): Promise<{ txHash: Hash } | null> => {
            if (!USDC_ADDRESS || !ESCROW_ADDRESS) {
                setState((s) => ({ ...s, error: "USDC or Escrow address not configured" }));
                return null;
            }
            if (!walletClient || !publicClient) {
                setState((s) => ({ ...s, error: "Wallet not connected" }));
                return null;
            }

            setState({ loading: true, txHash: null, error: null, onChainCampaignId: null });

            try {
                const hash = await walletClient.writeContract({
                    address: USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: "approve",
                    args: [ESCROW_ADDRESS, amount],
                });

                setState((s) => ({ ...s, txHash: hash }));
                await publicClient.waitForTransactionReceipt({ hash });

                setState({ loading: false, txHash: hash, error: null, onChainCampaignId: null });
                return { txHash: hash };
            } catch (err) {
                const message = err instanceof Error ? err.message : "USDC approval failed";
                setState({ loading: false, txHash: null, error: message, onChainCampaignId: null });
                return null;
            }
        },
        [walletClient, publicClient],
    );

    // ─── FUND ESCROW CAMPAIGN ─────────────────────────
    const fundEscrowCampaign = useCallback(
        async (escrowId: number, amount: bigint): Promise<{ txHash: Hash } | null> => {
            if (!ESCROW_ADDRESS) {
                setState((s) => ({ ...s, error: "Escrow contract address not configured" }));
                return null;
            }
            if (!walletClient || !publicClient) {
                setState((s) => ({ ...s, error: "Wallet not connected" }));
                return null;
            }

            setState({ loading: true, txHash: null, error: null, onChainCampaignId: null });

            try {
                const hash = await walletClient.writeContract({
                    address: ESCROW_ADDRESS,
                    abi: ESCROW_ABI,
                    functionName: "fundCampaign",
                    args: [BigInt(escrowId), amount],
                });

                setState((s) => ({ ...s, txHash: hash }));
                await publicClient.waitForTransactionReceipt({ hash });

                setState({ loading: false, txHash: hash, error: null, onChainCampaignId: null });
                return { txHash: hash };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Funding transaction failed";
                setState({ loading: false, txHash: null, error: message, onChainCampaignId: null });
                return null;
            }
        },
        [walletClient, publicClient],
    );

    return {
        ...state,
        address,
        createCampaignOnChain,
        updateCampaignOnChain,
        deactivateCampaignOnChain,
        createEscrowCampaign,
        approveUSDC,
        fundEscrowCampaign,
        resetState,
        isConfigured: (ct: ContractType) => !!CONTRACT_ADDRESSES[ct],
        isEscrowConfigured: !!ESCROW_ADDRESS,
    };
}
