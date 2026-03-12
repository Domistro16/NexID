import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

const NAME_WRAPPER_ABI = ['function ownerOf(uint256 id) view returns (address)'];
const BASE_REGISTRAR_ABI = [
    'function nameExpires(uint256 id) view returns (uint256)',
    'function ownerOf(uint256 id) view returns (address)'
];

// Contract addresses - hardcoded for BSC mainnet
const NAME_WRAPPER_ADDRESS = '0xbf4B53F867dfE5A78Cf268AfBfC1f334044e61ae';
const BASE_REGISTRAR_ADDRESS = '0x4c797EbaA64Cc7f1bD2a82A36bEE5Cf335D1830c';
const RPC_URL = 'https://bsc-dataseed.binance.org';

// Compute namehash for full domain (e.g., domistro.id)
function namehash(name: string): string {
    let node = '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (name) {
        const labels = name.split('.');
        for (let i = labels.length - 1; i >= 0; i--) {
            const labelHash = ethers.keccak256(ethers.toUtf8Bytes(labels[i]));
            node = ethers.keccak256(ethers.concat([node, labelHash]));
        }
    }
    return node;
}

// Lazy initialization to avoid build-time errors
function getContracts() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const nameWrapper = new ethers.Contract(
        NAME_WRAPPER_ADDRESS,
        NAME_WRAPPER_ABI,
        provider
    );
    const baseRegistrar = new ethers.Contract(
        BASE_REGISTRAR_ADDRESS,
        BASE_REGISTRAR_ABI,
        provider
    );
    return { nameWrapper, baseRegistrar };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
    try {
        const { code } = await params;

        console.log(`Validating referral code: ${code}`);

        // For NameWrapper: use full namehash (domistro.id)
        const fullName = `${code}.id`;
        const wrappedTokenId = BigInt(namehash(fullName));

        // For BaseRegistrar: use labelhash (just domistro)
        const labelhash = ethers.keccak256(ethers.toUtf8Bytes(code));
        const baseTokenId = BigInt(labelhash);

        const { nameWrapper, baseRegistrar } = getContracts();

        console.log(`Full name: ${fullName}`);
        console.log(`NameWrapper tokenId (namehash): ${wrappedTokenId}`);
        console.log(`BaseRegistrar tokenId (labelhash): ${baseTokenId}`);

        let owner = ethers.ZeroAddress;
        let expiry = 0;

        // First check NameWrapper (for wrapped domains) - uses full namehash
        try {
            owner = await nameWrapper.ownerOf(wrappedTokenId);
            console.log(`NameWrapper owner: ${owner}`);
        } catch (e: any) {
            console.log(`NameWrapper.ownerOf failed:`, e?.message || e);
        }

        // If not found in NameWrapper, check BaseRegistrar (for unwrapped domains) - uses labelhash
        if (owner === ethers.ZeroAddress) {
            try {
                owner = await baseRegistrar.ownerOf(baseTokenId);
                console.log(`BaseRegistrar owner: ${owner}`);
            } catch (e: any) {
                console.log(`BaseRegistrar.ownerOf failed:`, e?.message || e);
            }
        }

        // Get expiry from BaseRegistrar - always uses labelhash
        try {
            expiry = Number(await baseRegistrar.nameExpires(baseTokenId));
            console.log(`BaseRegistrar expiry: ${expiry}`);
        } catch (e: any) {
            console.log(`BaseRegistrar.nameExpires failed:`, e?.message || e);
        }

        const now = Math.floor(Date.now() / 1000);

        // A domain is valid if:
        // 1. It has an owner (not zero address)
        // 2. It's not expired (expiry > now) OR it's a lifetime domain (very high expiry)
        const isLifetime = expiry > 2000000000; // Year 2033+, likely lifetime
        const isValid = owner !== ethers.ZeroAddress && (isLifetime || expiry > now);

        console.log(`Now: ${now}, Expiry: ${expiry}, IsLifetime: ${isLifetime}, IsValid: ${isValid}`);

        return NextResponse.json({
            code,
            valid: isValid,
            owner: isValid ? owner : null,
            expiry: isValid ? expiry : null
        });
    } catch (error: any) {
        console.error('Validation error:', error?.message || error);
        const { code } = await params;
        return NextResponse.json(
            { code: code, valid: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
