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
];

const CAMPAIGN_ESCROW_ABI = [
    'function claimRewardFor(uint256 escrowId, address claimer, uint256 amount, bytes32[] merkleProof, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
    'function hasClaimed(uint256 escrowId, address user) view returns (bool)',
    'function hasReceivedReward(uint256, address) view returns (bool)',
    'function remainingBalance(uint256 escrowId) view returns (uint256)',
    'function claimRoots(uint256) view returns (bytes32)',
    'function setClaimRoot(uint256 escrowId, bytes32 _merkleRoot) external',
];

type ContractType = 'NEXID_CAMPAIGNS' | 'PARTNER_CAMPAIGNS';

export class CampaignRelayerService {
    private provider: JsonRpcProvider;
    private relayerWallet?: Wallet;
    private nexidContract?: Contract;
    private partnerContract?: Contract;
    private escrowContract?: Contract;

    constructor() {
        this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);

        const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
        if (!relayerPrivateKey) return;

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

    private getContract(contractType: ContractType): Contract | null {
        return contractType === 'NEXID_CAMPAIGNS'
            ? this.nexidContract ?? null
            : this.partnerContract ?? null;
    }

    /**
     * Enroll a user on-chain for a campaign.
     * The enroll() function on both contracts is open (not relayer-only).
     */
    async enrollUser(
        contractType: ContractType,
        onChainCampaignId: number,
        userAddress: string
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const contract = this.getContract(contractType);
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
        userAddress: string
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        const contract = this.getContract(contractType);
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
        points: bigint[]
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        if (!this.partnerContract) {
            return { success: false, error: 'PARTNER_CAMPAIGNS contract not configured' };
        }
        if (users.length === 0) {
            return { success: true, txHash: 'no-users' };
        }
        if (users.length !== points.length) {
            return { success: false, error: 'users and points arrays must have same length' };
        }

        try {
            const tx = await this.partnerContract.batchAddPoints(
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
        userAddress: string
    ): Promise<bigint> {
        if (!this.partnerContract) return 0n;
        try {
            return await this.partnerContract.campaignPoints(onChainCampaignId, userAddress);
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
        s: string
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        if (!this.escrowContract) {
            return { success: false, error: 'CampaignEscrow contract not configured' };
        }

        try {
            // Check if already claimed
            const claimed = await this.escrowContract.hasClaimed(escrowId, claimer);
            if (claimed) {
                return { success: true, txHash: 'already-claimed' };
            }

            const tx = await this.escrowContract.claimRewardFor(
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
        userAddress: string
    ): Promise<boolean> {
        if (!this.escrowContract) return false;
        try {
            return await this.escrowContract.hasClaimed(escrowId, userAddress);
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
}

/** Singleton instance */
let _instance: CampaignRelayerService | null = null;

export function getCampaignRelayer(): CampaignRelayerService {
    if (!_instance) {
        _instance = new CampaignRelayerService();
    }
    return _instance;
}
