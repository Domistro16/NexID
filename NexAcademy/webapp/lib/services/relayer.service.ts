import { Contract, JsonRpcProvider, Wallet, ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const TxStatus = {
    PENDING: 'PENDING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
} as const;

const TxType = {
    ENROLL: 'ENROLL',
    COMPLETE: 'COMPLETE',
    PROGRESS_UPDATE: 'PROGRESS_UPDATE',
} as const;

const LEVEL3_COURSE_ABI = [
    'function enroll(uint256 _courseId, address _user) external',
    'function completeCourse(uint256 _courseId, address _user, uint256 _score, uint256 _flags) external',
    'function updateUserPoints(address _user, uint256 _newPoints) external',
    'function setCourseCompletionStatus(uint256 _courseId, address _user, bool _completed) external',
    'function createCourse(string _title, string _description, string _longDescription, string _instructor, string[] _objectives, string[] _prerequisites, string _category, string _level, string _thumbnailUrl, string _duration, uint256 _totalLessons, bool _isIncentivized) external returns (uint256)',
    'function updateCourse(uint256 _courseId, string _title, string _description, string _longDescription, string _instructor, string[] _objectives, string[] _prerequisites, string _category, string _level, string _thumbnailUrl, string _duration, uint256 _totalLessons, bool _isIncentivized) external',
    'function deleteCourse(uint256 _courseId) external',
    'function isUserEnrolled(address _user, uint256 _courseId) external view returns (bool)',
    'function hasCompletedCourse(address _user, uint256 _courseId) external view returns (bool)',
    'function getUserPoints(address _user) external view returns (uint256)',
    'function getRelayer() external view returns (address)',
    'event CourseCreated(uint256 indexed courseId, string title, string level, bool isIncentivized)',
];

export class RelayerService {
    private provider: JsonRpcProvider;
    private wallet?: Wallet;
    private ownerWallet?: Wallet;
    private contract?: Contract;
    private ownerContract?: Contract;
    private prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);

        try {
            const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
            const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;

            const hasAddress = !!(
                config.level3CourseAddress &&
                config.level3CourseAddress.startsWith('0x')
            );

            if (relayerPrivateKey && hasAddress) {
                this.wallet = new Wallet(relayerPrivateKey, this.provider);
                this.contract = new Contract(
                    config.level3CourseAddress,
                    LEVEL3_COURSE_ABI,
                    this.wallet
                );
            }

            if (ownerPrivateKey && hasAddress) {
                this.ownerWallet = new Wallet(ownerPrivateKey, this.provider);
                this.ownerContract = new Contract(
                    config.level3CourseAddress,
                    LEVEL3_COURSE_ABI,
                    this.ownerWallet
                );
            }
        } catch (error) {
            console.error('Error initializing RelayerService:', error);
        }
    }

    private assertRelayerContract(): Contract {
        if (!this.contract || !this.wallet) {
            throw new Error('Relayer contract is not configured');
        }
        return this.contract;
    }

    private assertOwnerContract(): Contract {
        if (!this.ownerContract || !this.ownerWallet) {
            throw new Error('Owner contract is not configured');
        }
        return this.ownerContract;
    }

    async getRelayerAddress(): Promise<string> {
        if (!this.wallet) {
            return '';
        }
        return this.wallet.address;
    }

    async getContractRelayer(): Promise<string | null> {
        if (!this.contract) return null;
        return this.contract.getRelayer();
    }

    async verifyRelayerSetup(): Promise<{ valid: boolean; error?: string }> {
        try {
            if (!this.wallet || !this.contract) {
                return { valid: false, error: 'Relayer wallet or contract is not configured' };
            }

            const walletAddress = this.wallet.address;
            const contractRelayer = await this.getContractRelayer();
            if (!contractRelayer) {
                return { valid: false, error: 'Contract relayer not available' };
            }

            if (walletAddress.toLowerCase() !== contractRelayer.toLowerCase()) {
                return {
                    valid: false,
                    error: `Wallet ${walletAddress} does not match contract relayer ${contractRelayer}`,
                };
            }

            const balance = await this.provider.getBalance(walletAddress);
            if (balance < ethers.parseEther('0.001')) {
                return { valid: false, error: 'Relayer balance is too low' };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: (error as Error).message };
        }
    }

    async isUserEnrolled(userAddress: string, courseId: number): Promise<boolean> {
        try {
            if (!this.contract) return false;
            return await this.contract.isUserEnrolled(userAddress, courseId);
        } catch {
            return false;
        }
    }

    async hasCompletedCourse(userAddress: string, courseId: number): Promise<boolean> {
        try {
            if (!this.contract) return false;
            return await this.contract.hasCompletedCourse(userAddress, courseId);
        } catch {
            return false;
        }
    }

    async getUserPoints(userAddress: string): Promise<number> {
        try {
            if (!this.contract) return 0;
            const value = await this.contract.getUserPoints(userAddress);
            return Number(value);
        } catch {
            return 0;
        }
    }

    async enrollUser(
        userId: string,
        userAddress: string,
        courseId: number
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        try {
            const contract = this.assertRelayerContract();
            const isEnrolled = await this.isUserEnrolled(userAddress, courseId);
            if (isEnrolled) {
                return { success: true, txHash: 'already-enrolled' };
            }

            const tx = await contract.enroll(courseId, userAddress);
            await this.prisma.blockchainTx.create({
                data: {
                    txHash: tx.hash,
                    type: TxType.ENROLL,
                    userId,
                    courseId,
                    status: TxStatus.PENDING,
                },
            });

            const receipt = await tx.wait();
            await this.prisma.blockchainTx.update({
                where: { txHash: tx.hash },
                data: {
                    status: TxStatus.SUCCESS,
                    gasUsed: receipt?.gasUsed?.toString(),
                },
            });

            return { success: true, txHash: tx.hash };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    async completeCourse(
        userId: string,
        userAddress: string,
        courseId: number,
        score: number,
        flags: number
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        try {
            const contract = this.assertRelayerContract();
            const hasCompleted = await this.hasCompletedCourse(userAddress, courseId);
            if (hasCompleted) {
                return { success: true, txHash: 'already-completed' };
            }

            const tx = await contract.completeCourse(courseId, userAddress, score, flags);

            await this.prisma.blockchainTx.create({
                data: {
                    txHash: tx.hash,
                    type: TxType.COMPLETE,
                    userId,
                    courseId,
                    status: TxStatus.PENDING,
                },
            });

            const receipt = await tx.wait();
            await this.prisma.blockchainTx.update({
                where: { txHash: tx.hash },
                data: {
                    status: TxStatus.SUCCESS,
                    gasUsed: receipt?.gasUsed?.toString(),
                },
            });

            return { success: true, txHash: tx.hash };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    async createCourseOnChain(data: {
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
        isIncentivized: boolean;
    }): Promise<{ success: boolean; courseId?: number; txHash?: string; error?: string }> {
        try {
            const ownerContract = this.assertOwnerContract();
            const tx = await ownerContract.createCourse(
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
                data.isIncentivized
            );

            const receipt = await tx.wait();
            let courseId: number | undefined;

            for (const log of receipt.logs) {
                try {
                    const parsed = ownerContract.interface.parseLog(log);
                    if (parsed?.name === 'CourseCreated') {
                        courseId = Number(parsed.args.courseId);
                        break;
                    }
                } catch {
                    // Ignore logs from other contracts
                }
            }

            if (courseId === undefined) {
                throw new Error('CourseCreated event not found');
            }

            return { success: true, courseId, txHash: tx.hash };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    async updateCourseOnChain(
        courseId: number,
        data: {
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
            isIncentivized: boolean;
        }
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        try {
            const ownerContract = this.assertOwnerContract();
            const tx = await ownerContract.updateCourse(
                courseId,
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
                data.isIncentivized
            );

            await tx.wait();
            return { success: true, txHash: tx.hash };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    async deleteCourseOnChain(
        courseId: number
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        try {
            const ownerContract = this.assertOwnerContract();
            const tx = await ownerContract.deleteCourse(courseId);
            await tx.wait();
            return { success: true, txHash: tx.hash };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
}
