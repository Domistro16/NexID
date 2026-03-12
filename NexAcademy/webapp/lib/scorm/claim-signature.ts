import crypto from 'crypto';
import { ethers } from 'ethers';

export function createClaimNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}

export function buildClaimSignatureMessage(input: {
    walletAddress: string;
    courseId: number;
    nonce: string;
    timestamp: number;
}): string {
    return [
        'Nex Academy Incentivized Claim',
        '',
        `Wallet: ${input.walletAddress.toLowerCase()}`,
        `Course ID: ${input.courseId}`,
        `Nonce: ${input.nonce}`,
        `Timestamp: ${input.timestamp}`,
    ].join('\n');
}

export function verifyClaimSignature(input: {
    walletAddress: string;
    courseId: number;
    expectedNonce: string;
    message: string;
    signature: string;
    maxAgeSeconds?: number;
}): { valid: boolean; error?: string } {
    const wallet = input.walletAddress.toLowerCase();
    const maxAgeSeconds = input.maxAgeSeconds ?? 10 * 60;

    if (!input.message.includes(`Wallet: ${wallet}`)) {
        return { valid: false, error: 'Wallet mismatch in message' };
    }

    if (!input.message.includes(`Course ID: ${input.courseId}`)) {
        return { valid: false, error: 'Course mismatch in message' };
    }

    if (!input.message.includes(`Nonce: ${input.expectedNonce}`)) {
        return { valid: false, error: 'Nonce mismatch in message' };
    }

    const timestampMatch = input.message.match(/Timestamp:\s*(\d+)/);
    if (!timestampMatch) {
        return { valid: false, error: 'Missing timestamp' };
    }

    const timestamp = Number(timestampMatch[1]);
    if (Number.isNaN(timestamp)) {
        return { valid: false, error: 'Invalid timestamp' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > maxAgeSeconds) {
        return { valid: false, error: 'Signature message expired' };
    }

    try {
        const recovered = ethers.verifyMessage(input.message, input.signature).toLowerCase();
        if (recovered !== wallet) {
            return { valid: false, error: 'Invalid signature' };
        }
    } catch {
        return { valid: false, error: 'Signature recovery failed' };
    }

    return { valid: true };
}

export class NonceReplayGuard {
    private usedNonces = new Set<string>();

    consume(nonce: string): boolean {
        if (this.usedNonces.has(nonce)) {
            return false;
        }

        this.usedNonces.add(nonce);
        return true;
    }
}

