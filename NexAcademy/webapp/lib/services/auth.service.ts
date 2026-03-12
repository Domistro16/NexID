import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

export class AuthService {
    private prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    generateNonce(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    async getNonceForWallet(walletAddress: string): Promise<string> {
        const address = walletAddress.toLowerCase();

        let user = await this.prisma.user.findUnique({
            where: { walletAddress: address },
        });

        if (!user) {
            const nonce = this.generateNonce();
            user = await this.prisma.user.create({
                data: {
                    walletAddress: address,
                    nonce,
                },
            });
        } else {
            // Generate new nonce for each auth attempt
            const nonce = this.generateNonce();
            user = await this.prisma.user.update({
                where: { walletAddress: address },
                data: { nonce },
            });
        }

        return user.nonce;
    }

    createSignMessage(walletAddress: string, nonce: string, timestamp: number): string {
        return `Welcome to Nex Academy!\n\nSign this message to verify your wallet.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
    }

    async verifySignature(
        walletAddress: string,
        signature: string,
        message: string
    ): Promise<{ valid: boolean; token?: string; userId?: string; error?: string }> {
        try {
            const address = walletAddress.toLowerCase();

            const user = await this.prisma.user.findUnique({
                where: { walletAddress: address },
            });

            if (!user) {
                return { valid: false, error: 'User not found. Request nonce first.' };
            }

            // Validate that the message contains the correct nonce
            if (!message.includes(`Nonce: ${user.nonce}`)) {
                return { valid: false, error: 'Invalid nonce in message' };
            }

            // Validate that the message contains the correct wallet
            if (!message.includes(`Wallet: ${address}`)) {
                return { valid: false, error: 'Invalid wallet in message' };
            }

            // Validate timestamp is present and not expired (5 minutes max)
            const timestampMatch = message.match(/Timestamp: (\d+)/);
            if (!timestampMatch) {
                return { valid: false, error: 'Missing timestamp in message' };
            }

            const messageTimestamp = parseInt(timestampMatch[1], 10);
            const now = Math.floor(Date.now() / 1000);
            const fiveMinutes = 5 * 60;

            if (now - messageTimestamp > fiveMinutes) {
                return { valid: false, error: 'Message expired. Please request a new nonce.' };
            }

            // Recover the address from the signature
            const recoveredAddress = ethers.verifyMessage(message, signature);

            if (recoveredAddress.toLowerCase() !== address) {
                return { valid: false, error: 'Invalid signature' };
            }

            // Rotate nonce after successful verification
            await this.prisma.user.update({
                where: { walletAddress: address },
                data: { nonce: this.generateNonce() },
            });

            // Generate JWT
            const token = this.generateToken(user.id, address);

            return { valid: true, token, userId: user.id };
        } catch (error) {
            console.error('Signature verification error:', error);
            return { valid: false, error: 'Signature verification failed' };
        }
    }

    generateToken(userId: string, walletAddress: string): string {
        if (!config.jwtSecret) {
            throw new Error('JWT_SECRET is required to generate auth tokens');
        }
        return jwt.sign(
            { userId, walletAddress },
            config.jwtSecret,
            { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
        );
    }

    verifyToken(token: string): { userId: string; walletAddress: string } | null {
        try {
            if (!config.jwtSecret) {
                return null;
            }
            const decoded = jwt.verify(token, config.jwtSecret) as {
                userId: string;
                walletAddress: string;
            };
            return decoded;
        } catch {
            return null;
        }
    }

    async getUserById(userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                walletAddress: true,
                totalPoints: true,
                createdAt: true,
            },
        });
    }

    async getUserByWallet(walletAddress: string) {
        return this.prisma.user.findUnique({
            where: { walletAddress: walletAddress.toLowerCase() },
            select: {
                id: true,
                walletAddress: true,
                totalPoints: true,
                createdAt: true,
            },
        });
    }
}
