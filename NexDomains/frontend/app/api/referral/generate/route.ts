import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

const NAME_WRAPPER_ABI = ['function ownerOf(uint256 id) view returns (address)'];
const BASE_REGISTRAR_ABI = ['function nameExpires(uint256 id) view returns (uint256)'];

// Lazy initialization to avoid build-time errors
function getProvider() {
    return new ethers.JsonRpcProvider(process.env.RPC_URL);
}

function getWallet() {
    const provider = getProvider();
    return new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY!, provider);
}

function getContracts() {
    const provider = getProvider();
    const nameWrapper = new ethers.Contract(
        process.env.NAME_WRAPPER_ADDRESS!,
        NAME_WRAPPER_ABI,
        provider
    );
    const baseRegistrar = new ethers.Contract(
        process.env.BASE_REGISTRAR_ADDRESS!,
        BASE_REGISTRAR_ABI,
        provider
    );
    return { nameWrapper, baseRegistrar };
}

function emptyReferral(registrant: string, name: string) {
    return {
        success: true,
        referralData: {
            referrer: ethers.ZeroAddress,
            registrant,
            nameHash: ethers.keccak256(ethers.toUtf8Bytes(name)),
            referrerCodeHash: ethers.ZeroHash,  // Added
            deadline: 0,
            nonce: ethers.ZeroHash
        },
        signature: '0x'
    };
}

async function getDomainInfo(name: string) {
    const labelhash = ethers.keccak256(ethers.toUtf8Bytes(name));
    const tokenId = BigInt(labelhash);
    const { nameWrapper, baseRegistrar } = getContracts();

    try {
        const owner = await nameWrapper.ownerOf(tokenId);
        const expiry = await baseRegistrar.nameExpires(tokenId);
        return {
            exists: owner !== ethers.ZeroAddress,
            owner,
            expiry: Number(expiry),
            labelhash  // Return this for use as referrerCodeHash
        };
    } catch {
        return {
            exists: false,
            owner: ethers.ZeroAddress,
            expiry: 0,
            labelhash
        };
    }
}

export async function POST(request: NextRequest) {
    try {
        const { referralCode, registrantAddress, name } = await request.json();

        // Validate inputs
        if (!registrantAddress || !name) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // No referral code - return empty
        if (!referralCode || referralCode.trim() === '') {
            return NextResponse.json(emptyReferral(registrantAddress, name));
        }

        // Check domain exists
        const domainInfo = await getDomainInfo(referralCode);

        if (!domainInfo.exists) {
            return NextResponse.json(emptyReferral(registrantAddress, name));
        }

        // Check not expired
        const now = Math.floor(Date.now() / 1000);
        if (domainInfo.expiry < now) {
            return NextResponse.json(emptyReferral(registrantAddress, name));
        }

        // Check not self-referral
        if (domainInfo.owner.toLowerCase() === registrantAddress.toLowerCase()) {
            const empty = emptyReferral(registrantAddress, name);
            return NextResponse.json({
                ...empty,
                success: false,
                error: 'Cannot use your own domain as referral'
            });
        }

        // Generate signature
        const deadline = now + 3600;
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const nameHash = ethers.keccak256(ethers.toUtf8Bytes(name));
        const referrerCodeHash = ethers.keccak256(ethers.toUtf8Bytes(referralCode));  // Hash of referral code domain

        // Updated message hash - now includes referrerCodeHash
        const messageHash = ethers.solidityPackedKeccak256(
            ['address', 'address', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'uint256', 'address'],
            [
                domainInfo.owner,      // referrer
                registrantAddress,     // registrant
                nameHash,              // hash of domain being registered
                referrerCodeHash,      // hash of referral code domain (NEW)
                deadline,
                nonce,
                parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!),
                process.env.REFERRAL_VERIFIER_ADDRESS
            ]
        );

        const wallet = getWallet();
        const signature = await wallet.signMessage(ethers.getBytes(messageHash));

        return NextResponse.json({
            success: true,
            referralData: {
                referrer: domainInfo.owner,
                registrant: registrantAddress,
                nameHash,
                referrerCodeHash,  // Added to response
                deadline,
                nonce
            },
            signature
        });
    } catch (error) {
        console.error('Referral generation error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}