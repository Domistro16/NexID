import { keccak256, solidityPacked, AbiCoder } from 'ethers';

/**
 * Minimal Merkle tree for campaign reward claims.
 *
 * Each leaf is: keccak256(abi.encode(claimer, amount))
 * Double-hashed to prevent second-preimage attacks (matches OpenZeppelin MerkleProof).
 *
 * Usage:
 *   const entries = [{ address: '0x...', amount: 1000000n }];
 *   const tree = new RewardMerkleTree(entries);
 *   const root = tree.getRoot();
 *   const proof = tree.getProof('0x...');
 */

export type RewardEntry = {
    address: string;
    amount: bigint;
};

const coder = new AbiCoder();

function hashLeaf(address: string, amount: bigint): string {
    const inner = keccak256(coder.encode(['address', 'uint256'], [address, amount]));
    return keccak256(solidityPacked(['bytes32'], [inner]));
}

function hashPair(a: string, b: string): string {
    // Sort to ensure deterministic ordering
    const [left, right] = a < b ? [a, b] : [b, a];
    return keccak256(solidityPacked(['bytes32', 'bytes32'], [left, right]));
}

export class RewardMerkleTree {
    private leaves: string[];
    private leafMap: Map<string, number>; // address (lowercase) => leaf index
    private layers: string[][];
    private entries: RewardEntry[];

    constructor(entries: RewardEntry[]) {
        if (entries.length === 0) {
            throw new Error('Cannot create Merkle tree with zero entries');
        }

        this.entries = entries;
        this.leafMap = new Map();
        this.leaves = entries.map((e, i) => {
            const leaf = hashLeaf(e.address, e.amount);
            this.leafMap.set(e.address.toLowerCase(), i);
            return leaf;
        });

        this.layers = this.buildLayers(this.leaves);
    }

    private buildLayers(leaves: string[]): string[][] {
        const layers: string[][] = [leaves];
        let current = leaves;

        while (current.length > 1) {
            const next: string[] = [];
            for (let i = 0; i < current.length; i += 2) {
                if (i + 1 < current.length) {
                    next.push(hashPair(current[i], current[i + 1]));
                } else {
                    // Odd element — promote to next layer
                    next.push(current[i]);
                }
            }
            layers.push(next);
            current = next;
        }

        return layers;
    }

    getRoot(): string {
        return this.layers[this.layers.length - 1][0];
    }

    getProof(address: string): string[] {
        const index = this.leafMap.get(address.toLowerCase());
        if (index === undefined) {
            throw new Error(`Address ${address} not found in Merkle tree`);
        }

        const proof: string[] = [];
        let idx = index;

        for (let layer = 0; layer < this.layers.length - 1; layer++) {
            const currentLayer = this.layers[layer];
            const isRight = idx % 2 === 1;
            const siblingIdx = isRight ? idx - 1 : idx + 1;

            if (siblingIdx < currentLayer.length) {
                proof.push(currentLayer[siblingIdx]);
            }

            idx = Math.floor(idx / 2);
        }

        return proof;
    }

    getEntry(address: string): RewardEntry | undefined {
        const index = this.leafMap.get(address.toLowerCase());
        if (index === undefined) return undefined;
        return this.entries[index];
    }

    /**
     * Verify a proof locally (mirrors OpenZeppelin MerkleProof.verify).
     */
    verify(address: string, amount: bigint, proof: string[]): boolean {
        const leaf = hashLeaf(address, amount);
        let hash = leaf;

        for (const proofElement of proof) {
            hash = hashPair(hash, proofElement);
        }

        return hash === this.getRoot();
    }

    /**
     * Serialize the tree for storage (DB or file).
     * Stores entries + root so the tree can be rebuilt later.
     */
    serialize(): { root: string; entries: Array<{ address: string; amount: string }> } {
        return {
            root: this.getRoot(),
            entries: this.entries.map(e => ({
                address: e.address,
                amount: e.amount.toString(),
            })),
        };
    }

    /**
     * Reconstruct a tree from serialized data.
     */
    static deserialize(data: { entries: Array<{ address: string; amount: string }> }): RewardMerkleTree {
        return new RewardMerkleTree(
            data.entries.map(e => ({
                address: e.address,
                amount: BigInt(e.amount),
            })),
        );
    }
}
