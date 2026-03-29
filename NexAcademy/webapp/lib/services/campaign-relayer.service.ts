import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { config } from '../config';

/**
 * Minimal ABIs for the NexIDCampaigns and PartnerCampaigns contracts.
 * Only includes functions called by the backend relayer wallet.
 * Owner-only functions (createCampaign, updateCampaign, etc.) are handled
 * on the frontend via the useAdminContract hook.
 */
const NEXID_CAMPAIGNS_ABI = [
    'function enroll(uint256 _campaignId, address _user) external',
    'function completeCampaign(uint256 _campaignId, address _user) external',
    'function isEnrolled(address, uint256) view returns (bool)',
    'function hasCompleted(address, uint256) view returns (bool)',
    'function getParticipantCount(uint256 _campaignId) view returns (uint256)',
];

const PARTNER_CAMPAIGNS_ABI = [
    'function enroll(uint256 _campaignId, address _user) external',
    'function completeCampaign(uint256 _campaignId, address _user) external',
    'function addPoints(uint256 _campaignId, address _user, uint256 _points) external',
    'function batchAddPoints(uint256 _campaignId, address[] _users, uint256[] _points) external',
    'function isEnrolled(address, uint256) view returns (bool)',
    'function hasCompleted(address, uint256) view returns (bool)',
    'function campaignPoints(uint256, address) view returns (uint256)',
    'function getParticipantCount(uint256 _campaignId) view returns (uint256)',
    'function getLeaderboard(uint256 _campaignId) view returns (address[] users, uint256[] points)',
    'function getParticipants(uint256 _campaignId) view returns (address[])',
    'function isCampaignLive(uint256 _campaignId) view returns (bool)',
    'function hasCampaignEnded(uint256 _campaignId) view returns (bool)',
    'function getCampaign(uint256 _campaignId) view returns (tuple(uint256 id, string title, string description, string category, string level, string thumbnailUrl, uint256 totalTasks, address sponsor, string sponsorName, string sponsorLogo, uint256 prizePool, uint256 startTime, uint256 endTime, uint256 durationDays, uint256 winnerCap, uint256 payoutRounds, uint256 payoutIntervalDays, uint8 plan, uint8 leaderboardMode, bool isActive))',
    'function totalCampaignPoints(uint256) view returns (uint256)',
];

const CAMPAIGN_ESCROW_ABI = [
    'function claimRewardFor(uint256 escrowId, address claimer, uint256 amount, bytes32[] merkleProof, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
    'function hasClaimed(uint256 escrowId, address user) view returns (bool)',
    'function hasReceivedReward(uint256, address) view returns (bool)',
    'function remainingBalance(uint256 escrowId) view returns (uint256)',
    'function claimRoots(uint256) view returns (bytes32)',
    'function setClaimRoot(uint256 escrowId, bytes32 _merkleRoot) external',
    'function createCampaign(uint256 _partnerCampaignId, address _sponsor, uint256 _endTimestamp) external returns (uint256)',
    'function fundCampaign(uint256 escrowId, uint256 amount) external',
    'function withdrawRemaining(uint256 escrowId) external',
    'function getCampaign(uint256 escrowId) view returns (tuple(uint256 partnerCampaignId, address sponsor, uint256 totalFunded, uint256 totalDistributed, uint256 endTimestamp))',
    'function hasEnded(uint256 escrowId) view returns (bool)',
];

/** Owner-only ABI for on-chain campaign creation (requires OWNER_PRIVATE_KEY) */
const NEXID_CAMPAIGNS_OWNER_ABI = [
    'function createCampaign(string _title, string _description, string _longDescription, string _instructor, string[] _objectives, string[] _prerequisites, string _category, string _level, string _thumbnailUrl, string _duration, uint256 _totalLessons) external returns (uint256)',
    'function deactivateCampaign(uint256 _campaignId) external',
    'event CampaignCreated(uint256 indexed campaignId, string title)',
];

const PARTNER_CAMPAIGNS_OWNER_ABI = [
    'function createCampaign(string _title, string _description, string _category, string _level, string _thumbnailUrl, uint256 _totalTasks, address _sponsor, string _sponsorName, string _sponsorLogo, uint256 _prizePool, uint256 _startTime, uint8 _plan, uint256 _customWinnerCap) external returns (uint256)',
    'function updateCampaign(uint256 _campaignId, string _title, string _description, string _category, string _level, string _thumbnailUrl, uint256 _totalTasks, address _sponsor, string _sponsorName, string _sponsorLogo, uint256 _prizePool, uint256 _startTime, uint8 _plan, uint256 _customWinnerCap) external',
    'function deactivateCampaign(uint256 _campaignId) external',
    'event CampaignCreated(uint256 indexed campaignId, uint8 indexed plan, string title, address indexed sponsor, uint256 winnerCap, uint256 endTime)',
    'event CampaignUpdated(uint256 indexed campaignId, uint8 indexed plan, string title, uint256 winnerCap, uint256 endTime)',
];

type ContractType = 'NEXID_CAMPAIGNS' | 'PARTNER_CAMPAIGNS';

export class CampaignRelayerService {
    private provider: JsonRpcProvider;
    private relayerWallet?: Wallet;
    private ownerWallet?: Wallet;
    // Default contract instances (v2 — from config env vars)
    private nexidContract?: Contract;
    private partnerContract?: Contract;
    private escrowContract?: Contract;
    private nexidOwnerContract?: Contract;
    private partnerOwnerContract?: Contract;
    private escrowOwnerContract?: Contract;
    // Cache for address-specific contract instances (v1 / v2 coexistence)
    private contractCache = new Map<string, Contract>();

    constructor() {
        this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);

        const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
        const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;

        if (relayerPrivateKey) {
            this.relayerWallet = new Wallet(relayerPrivateKey, this.provider);

            if (config.nexidCampaignsAddress?.startsWith('0x')) {
                this.nexidContract = new Contract(
                    config.nexidCampaignsAddress,
                    NEXID_CAMPAIGNS_ABI,
                    this.relayerWallet
                );
            }

            if (config.partnerCampaignsAddress?.startsWith('0x')) {
                this.partnerContract = new Contract(
                    config.partnerCampaignsAddress,
                    PARTNER_CAMPAIGNS_ABI,
                    this.relayerWallet
                );
            }

            if (config.campaignEscrowAddress?.startsWith('0x')) {
                this.escrowContract = new Contract(
                    config.campaignEscrowAddress,
                    CAMPAIGN_ESCROW_ABI,
                    this.relayerWallet
                );
            }
        }

        if (ownerPrivateKey) {
            this.ownerWallet = new Wallet(ownerPrivateKey, this.provider);

            if (config.nexidCampaignsAddress?.startsWith('0x')) {
                this.nexidOwnerContract = new Contract(
                    config.nexidCampaignsAddress,
                    NEXID_CAMPAIGNS_OWNER_ABI,
                    this.ownerWallet
                );
            }

            if (config.partnerCampaignsAddress?.startsWith('0x')) {
                this.partnerOwnerContract = new Contract(
                    config.partnerCampaignsAddress,
                    PARTNER_CAMPAIGNS_OWNER_ABI,
                    this.ownerWallet
                );
            }

            if (config.campaignEscrowAddress?.startsWith('0x')) {
                this.escrowOwnerContract = new Contract(
                    config.campaignEscrowAddress,
                    CAMPAIGN_ESCROW_ABI,
                    this.ownerWallet
                );
            }
        }
    }

    // ============ ADDRESS-AWARE CONTRACT RESOLUTION ============

    /**
     * Get a cached contract instance at a specific address.
     * Used for v1/v2 coexistence: campaigns store their contract address,
     * and we route calls to the correct deployment.
     */
    private getContractAt(
        address: string,
        abi: string[],
        signer: Wallet,
    ): Contract {
        const cacheKey = `${address}:${signer.address}`;
        let contract = this.contractCache.get(cacheKey);
        if (!contract) {
            contract = new Contract(address, abi, signer);
            this.contractCache.set(cacheKey, contract);
        }
        return contract;
    }

    /**
     * Resolve the partner campaigns contract for a given campaign.
     * If the campaign stores a specific contract address (v1), use that.
     * Otherwise fall back to the current default (v2 from config).
     */
    getPartnerOwnerContract(contractAddress?: string | null): Contract | null {
        if (contractAddress?.startsWith('0x') && this.ownerWallet) {
            return this.getContractAt(contractAddress, PARTNER_CAMPAIGNS_OWNER_ABI, this.ownerWallet);
        }
        return this.partnerOwnerContract ?? null;
    }

    getPartnerContract(contractAddress?: string | null): Contract | null {
        if (contractAddress?.startsWith('0x') && this.relayerWallet) {
            return this.getContractAt(contractAddress, PARTNER_CAMPAIGNS_ABI, this.relayerWallet);
        }
        return this.partnerContract ?? null;
    }

    /**
     * Resolve the escrow contract for a given campaign.
     * Campaigns store their escrowAddress — use it if provided.
     */
    getEscrowContract(escrowAddress?: string | null): Contract | null {
        if (escrowAddress?.startsWith('0x') && this.relayerWallet) {
            return this.getContractAt(escrowAddress, CAMPAIGN_ESCROW_ABI, this.relayerWallet);
        }
        return this.escrowContract ?? null;
    }

    /**
     * Resolve the escrow owner contract for a given campaign.
     */
    getEscrowOwnerContract(escrowAddress?: string | null): Contract | null {
        if (escrowAddress?.startsWith('0x') && this.ownerWallet) {
            return this.getContractAt(escrowAddress, CAMPAIGN_ESCROW_ABI, this.ownerWallet);
        }
        return this.escrowOwnerContract ?? null;
    }

    private getContract(contractType: ContractType, contractAddress?: string | null): Contract | null {
        if (contractType === 'NEXID_CAMPAIGNS') {
            return this.nexidContract ?? null;
        }
        return this.getPartnerContract(contractAddress);
    }

    /**
     * Enroll a user on-chain for a campaign.
     * The enroll() function on both contracts is open (not relayer-only).
     */
    async enrollUser(
        contractType: ContractType,
        onChainCampaignId: number,
        userAddress: string,
        contractAddress?: string | null,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const contract = this.getContract(contractType, contractAddress);
        if (!contract) {
            return { success: false, error: `${contractType} contract not configured` };
        }

        try {
            // Check if already enrolled on-chain
            const enrolled = await contract.isEnrolled(userAddress, onChainCampaignId);
            if (enrolled) {
                return { success: true, txHash: 'already-enrolled-onchain' };
            }

            // Check if already completed on-chain
            const completed = await contract.hasCompleted(userAddress, onChainCampaignId);
            if (completed) {
                return { success: true, txHash: 'already-completed-onchain' };
            }

            const tx = await contract.enroll(onChainCampaignId, userAddress);
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error(`CampaignRelayer enrollUser error (${contractType}):`, error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Mark a campaign as completed on-chain (relayer-only function).
     */
    async completeCampaign(
        contractType: ContractType,
        onChainCampaignId: number,
        userAddress: string,
        contractAddress?: string | null,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const contract = this.getContract(contractType, contractAddress);
        if (!contract) {
            return { success: false, error: `${contractType} contract not configured` };
        }

        try {
            const completed = await contract.hasCompleted(userAddress, onChainCampaignId);
            if (completed) {
                return { success: true, txHash: 'already-completed-onchain' };
            }

            const tx = await contract.completeCampaign(onChainCampaignId, userAddress);
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error(`CampaignRelayer completeCampaign error (${contractType}):`, error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Batch-award points to multiple users for a PartnerCampaigns campaign.
     * Only applies to PARTNER_CAMPAIGNS (NexID has no points).
     *
     * @param onChainCampaignId  The campaign ID on the PartnerCampaigns contract
     * @param users              Array of wallet addresses
     * @param points             Array of point deltas to add (same length as users)
     */
    async batchAddPoints(
        onChainCampaignId: number,
        users: string[],
        points: bigint[],
        contractAddress?: string | null,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const contract = this.getPartnerContract(contractAddress);
        if (!contract) {
            return { success: false, error: 'PARTNER_CAMPAIGNS contract not configured' };
        }
        if (users.length === 0) {
            return { success: true, txHash: 'no-users' };
        }
        if (users.length !== points.length) {
            return { success: false, error: 'users and points arrays must have same length' };
        }

        try {
            const tx = await contract.batchAddPoints(
                onChainCampaignId,
                users,
                points
            );
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('CampaignRelayer batchAddPoints error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Read a user's current on-chain points for a partner campaign.
     */
    async getOnChainPoints(
        onChainCampaignId: number,
        userAddress: string,
        contractAddress?: string | null,
    ): Promise<bigint> {
        const contract = this.getPartnerContract(contractAddress);
        if (!contract) return 0n;
        try {
            return await contract.campaignPoints(onChainCampaignId, userAddress);
        } catch {
            return 0n;
        }
    }

    // ============ ESCROW CLAIM FUNCTIONS ============

    /**
     * Submit a gasless reward claim on behalf of a user.
     * The user signs an EIP-712 message; the relayer submits the tx and pays gas.
     *
     * @param escrowId    Escrow campaign ID on the CampaignEscrow contract
     * @param claimer     User's wallet address (USDC recipient)
     * @param amount      USDC reward amount (in smallest unit, e.g. 6 decimals)
     * @param merkleProof Proof that (claimer, amount) is in the campaign's claim tree
     * @param deadline    Signature expiry timestamp
     * @param v           ECDSA v
     * @param r           ECDSA r
     * @param s           ECDSA s
     */
    async claimRewardFor(
        escrowId: number,
        claimer: string,
        amount: bigint,
        merkleProof: string[],
        deadline: number,
        v: number,
        r: string,
        s: string,
        escrowAddress?: string | null,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const contract = this.getEscrowContract(escrowAddress);
        if (!contract) {
            return { success: false, error: 'CampaignEscrow contract not configured' };
        }

        try {
            // Check if already claimed
            const claimed = await contract.hasClaimed(escrowId, claimer);
            if (claimed) {
                return { success: true, txHash: 'already-claimed' };
            }

            const tx = await contract.claimRewardFor(
                escrowId,
                claimer,
                amount,
                merkleProof,
                deadline,
                v,
                r,
                s
            );
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('CampaignRelayer claimRewardFor error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Check if a user has already claimed their reward for a campaign.
     */
    async hasClaimedReward(
        escrowId: number,
        userAddress: string,
        escrowAddress?: string | null,
    ): Promise<boolean> {
        const contract = this.getEscrowContract(escrowAddress);
        if (!contract) return false;
        try {
            return await contract.hasClaimed(escrowId, userAddress);
        } catch {
            return false;
        }
    }

    /**
     * Check if the relayer contracts are configured.
     */
    isConfigured(contractType: ContractType): boolean {
        return this.getContract(contractType) !== null;
    }

    isEscrowConfigured(): boolean {
        return this.escrowContract !== null;
    }

    isOwnerConfigured(): boolean {
        return this.ownerWallet !== null;
    }

    // ============ ON-CHAIN READS (SOURCE OF TRUTH) ============

    /**
     * Read the full leaderboard from the PartnerCampaigns contract.
     * Returns participants sorted by points descending (on-chain source of truth).
     */
    async getOnChainLeaderboard(
        onChainCampaignId: number,
        contractAddress?: string | null,
    ): Promise<{ users: string[]; points: bigint[] } | null> {
        const contract = this.getPartnerContract(contractAddress);
        if (!contract) return null;

        try {
            const [users, points] = await contract.getLeaderboard(onChainCampaignId);
            return { users, points };
        } catch (error) {
            console.error('getOnChainLeaderboard error:', error);
            return null;
        }
    }

    /**
     * Read campaign metadata from the PartnerCampaigns contract.
     */
    async getOnChainCampaign(
        onChainCampaignId: number,
        contractAddress?: string | null,
    ): Promise<{
        id: number;
        title: string;
        sponsorName: string;
        sponsorLogo: string;
        prizePool: bigint;
        startTime: number;
        endTime: number;
        winnerCap: number;
        plan: number;
        isActive: boolean;
    } | null> {
        const contract = this.getPartnerContract(contractAddress);
        if (!contract) return null;

        try {
            const c = await contract.getCampaign(onChainCampaignId);
            return {
                id: Number(c.id),
                title: c.title,
                sponsorName: c.sponsorName,
                sponsorLogo: c.sponsorLogo,
                prizePool: c.prizePool,
                startTime: Number(c.startTime),
                endTime: Number(c.endTime),
                winnerCap: Number(c.winnerCap),
                plan: Number(c.plan),
                isActive: c.isActive,
            };
        } catch (error) {
            console.error('getOnChainCampaign error:', error);
            return null;
        }
    }

    /**
     * Extend a partner campaign's end time on-chain by updating startTime.
     * Reads current on-chain data, back-calculates a new startTime so that
     * endTime = startTime + durationSeconds lands on newEndTimestamp.
     */
    async extendPartnerCampaignOnChain(
        onChainCampaignId: number,
        newEndTimestamp: number,
        contractAddress?: string | null,
    ): Promise<{ success: boolean; txHash?: string; newEndTime?: number; error?: string }> {
        const ownerContract = this.getPartnerOwnerContract(contractAddress);
        if (!ownerContract) {
            return { success: false, error: 'PartnerCampaigns owner contract not configured' };
        }

        const current = await this.getOnChainCampaign(onChainCampaignId, contractAddress);
        if (!current) {
            return { success: false, error: 'Campaign not found on-chain' };
        }

        // Read the full struct to get fields not in getOnChainCampaign
        const readContract = this.getPartnerContract(contractAddress);
        if (!readContract) {
            return { success: false, error: 'PartnerCampaigns read contract not configured' };
        }

        let full: {
            description: string; category: string; level: string;
            thumbnailUrl: string; totalTasks: bigint; sponsor: string;
            durationDays: bigint;
        };
        try {
            const c = await readContract.getCampaign(onChainCampaignId);
            full = {
                description: c.description ?? '',
                category: c.category ?? 'education',
                level: c.level ?? 'beginner',
                thumbnailUrl: c.thumbnailUrl ?? '',
                totalTasks: c.totalTasks ?? 0n,
                sponsor: c.sponsor,
                durationDays: c.durationDays ?? 0n,
            };
        } catch (error) {
            return { success: false, error: `Failed to read on-chain campaign: ${(error as Error).message}` };
        }

        const durationSeconds = Number(full.durationDays) * 86400;
        const newStartTime = newEndTimestamp - durationSeconds;

        try {
            const tx = await ownerContract.updateCampaign(
                onChainCampaignId,
                current.title,
                full.description,
                full.category,
                full.level,
                full.thumbnailUrl,
                full.totalTasks,
                full.sponsor,
                current.sponsorName,
                current.sponsorLogo,
                current.prizePool,
                newStartTime,
                current.plan,
                0,
            );
            const receipt = await tx.wait();
            return { success: true, txHash: receipt.hash, newEndTime: newEndTimestamp };
        } catch (error) {
            console.error('extendPartnerCampaignOnChain error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    // ============ OWNER-ONLY: ON-CHAIN CAMPAIGN CREATION ============

    /**
     * Create a NexID campaign on-chain (owner-only).
     */
    async createNexIDCampaignOnChain(data: {
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
        totalLessons: number;
    }): Promise<{ success: boolean; onChainCampaignId?: number; txHash?: string; error?: string }> {
        if (!this.nexidOwnerContract) {
            return { success: false, error: 'NexIDCampaigns owner contract not configured' };
        }

        try {
            const tx = await this.nexidOwnerContract.createCampaign(
                data.title,
                data.description,
                data.longDescription,
                data.instructor,
                data.objectives,
                data.prerequisites,
                data.category,
                data.level,
                data.thumbnailUrl,
                data.duration,
                data.totalLessons,
            );
            const receipt = await tx.wait();

            let onChainCampaignId: number | undefined;
            for (const log of receipt.logs) {
                try {
                    const parsed = this.nexidOwnerContract.interface.parseLog(log);
                    if (parsed?.name === 'CampaignCreated') {
                        onChainCampaignId = Number(parsed.args.campaignId);
                        break;
                    }
                } catch { /* skip */ }
            }

            return { success: true, onChainCampaignId, txHash: receipt.hash };
        } catch (error) {
            console.error('createNexIDCampaignOnChain error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Create a Partner campaign on-chain (owner-only).
     */
    async createPartnerCampaignOnChain(data: {
        title: string;
        description: string;
        category: string;
        level: string;
        thumbnailUrl: string;
        totalTasks: number;
        sponsor: string;
        sponsorName: string;
        sponsorLogo: string;
        prizePool: bigint;
        startTime: number;
        plan: number; // 0=LAUNCH_SPRINT, 1=DEEP_DIVE, 2=CUSTOM
        customWinnerCap: number;
    }): Promise<{ success: boolean; onChainCampaignId?: number; txHash?: string; error?: string }> {
        if (!this.partnerOwnerContract) {
            return { success: false, error: 'PartnerCampaigns owner contract not configured' };
        }

        try {
            const tx = await this.partnerOwnerContract.createCampaign(
                data.title,
                data.description,
                data.category,
                data.level,
                data.thumbnailUrl,
                data.totalTasks,
                data.sponsor,
                data.sponsorName,
                data.sponsorLogo,
                data.prizePool,
                data.startTime,
                data.plan,
                data.customWinnerCap,
            );
            const receipt = await tx.wait();

            let onChainCampaignId: number | undefined;
            for (const log of receipt.logs) {
                try {
                    const parsed = this.partnerOwnerContract.interface.parseLog(log);
                    if (parsed?.name === 'CampaignCreated') {
                        onChainCampaignId = Number(parsed.args.campaignId);
                        break;
                    }
                } catch { /* skip */ }
            }

            return { success: true, onChainCampaignId, txHash: receipt.hash };
        } catch (error) {
            console.error('createPartnerCampaignOnChain error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    // ============ OWNER-ONLY: ESCROW MANAGEMENT ============

    /**
     * Create an escrow campaign on-chain (owner-only).
     */
    async createEscrowCampaign(
        partnerCampaignId: number,
        sponsor: string,
        endTimestamp: number,
        escrowAddress?: string | null,
    ): Promise<{ success: boolean; escrowId?: number; txHash?: string; error?: string }> {
        const ownerContract = this.getEscrowOwnerContract(escrowAddress);
        if (!ownerContract) {
            return { success: false, error: 'CampaignEscrow owner contract not configured' };
        }

        try {
            const tx = await ownerContract.createCampaign(
                partnerCampaignId,
                sponsor,
                endTimestamp,
            );
            const receipt = await tx.wait();

            let escrowId: number | undefined;
            for (const log of receipt.logs) {
                try {
                    const parsed = ownerContract.interface.parseLog(log);
                    if (parsed?.name === 'CampaignCreated') {
                        escrowId = Number(parsed.args.escrowId);
                        break;
                    }
                } catch { /* skip */ }
            }

            return { success: true, escrowId, txHash: receipt.hash };
        } catch (error) {
            console.error('createEscrowCampaign error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Fund an escrow campaign with USDC (owner-only).
     * Caller must have approved the escrow contract to spend USDC first.
     */
    async fundEscrowCampaign(
        escrowId: number,
        amount: bigint,
        escrowAddress?: string | null,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const ownerContract = this.getEscrowOwnerContract(escrowAddress);
        if (!ownerContract) {
            return { success: false, error: 'CampaignEscrow owner contract not configured' };
        }

        try {
            const tx = await ownerContract.fundCampaign(escrowId, amount);
            const receipt = await tx.wait();
            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('fundEscrowCampaign error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Set Merkle root on the escrow contract (owner-only).
     */
    async setClaimRoot(
        escrowId: number,
        merkleRoot: string,
        escrowAddress?: string | null,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const ownerContract = this.getEscrowOwnerContract(escrowAddress);
        if (!ownerContract) {
            return { success: false, error: 'CampaignEscrow owner contract not configured' };
        }

        try {
            const tx = await ownerContract.setClaimRoot(escrowId, merkleRoot);
            const receipt = await tx.wait();
            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('setClaimRoot error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Withdraw remaining escrow funds after grace period (owner-only).
     */
    async withdrawRemainingEscrow(
        escrowId: number,
        escrowAddress?: string | null,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const ownerContract = this.getEscrowOwnerContract(escrowAddress);
        if (!ownerContract) {
            return { success: false, error: 'CampaignEscrow owner contract not configured' };
        }

        try {
            const tx = await ownerContract.withdrawRemaining(escrowId);
            const receipt = await tx.wait();
            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('withdrawRemainingEscrow error:', error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Read escrow campaign info from chain.
     */
    async getEscrowCampaign(escrowId: number, escrowAddress?: string | null): Promise<{
        partnerCampaignId: number;
        sponsor: string;
        totalFunded: bigint;
        totalDistributed: bigint;
        endTimestamp: number;
    } | null> {
        const contract = this.getEscrowContract(escrowAddress) ?? this.getEscrowOwnerContract(escrowAddress);
        if (!contract) return null;

        try {
            const c = await contract.getCampaign(escrowId);
            return {
                partnerCampaignId: Number(c.partnerCampaignId),
                sponsor: c.sponsor,
                totalFunded: c.totalFunded,
                totalDistributed: c.totalDistributed,
                endTimestamp: Number(c.endTimestamp),
            };
        } catch {
            return null;
        }
    }
}

/** Singleton instance */
let _instance: CampaignRelayerService | null = null;

export function getCampaignRelayer(): CampaignRelayerService {
    if (!_instance) {
        _instance = new CampaignRelayerService();
    }
    return _instance;
}
