import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getSessionUser } from "@/lib/services/authService";
import { resolveNexDomainsPrimaryName } from "@/lib/services/nexdomainsPrimaryService";
import { signNativeLaunchAuthorization } from "@/lib/services/nativeLaunchAuthorizationService";
import { createNativeMarketRecord, getMarketDraft, metadataHashForDraft, rulesHashForDraft } from "@/lib/services/nexmarketsService";
import { jsonError, nativeMarketCreateSchema } from "@/lib/server/validation";

const marketFactoryAbi = parseAbi([
  "function resolutionManager() view returns (address)"
]);

function configuredAddress(value?: string | null) {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() as `0x${string}` : null;
}

function nativeChainConfig(chainId: number) {
  if (chainId === 84532) return { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL };
  if (chainId === 8453) return { chain: base, rpcUrl: process.env.BASE_RPC_URL };
  return null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function readFactoryResolutionManager(chainId: number, factoryAddress?: string | null) {
  const checkedFactory = configuredAddress(factoryAddress);
  const fallback = configuredAddress(process.env.NATIVE_RESOLUTION_MANAGER_ADDRESS);
  if (!checkedFactory) return fallback;
  const config = nativeChainConfig(chainId);
  if (!config?.rpcUrl) {
    throw new Error(`RPC URL is required to read the native factory resolution manager for chain ${chainId}.`);
  }

  try {
    const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
    const manager = await client.readContract({
      address: checkedFactory,
      abi: marketFactoryAbi,
      functionName: "resolutionManager"
    });
    return manager.toLowerCase() as `0x${string}`;
  } catch (error) {
    throw new Error(`Could not read the native factory resolution manager. ${errorMessage(error)}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = nativeMarketCreateSchema.parse(await request.json());
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (user.walletAddress.toLowerCase() !== body.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Connected wallet does not match signed-in user" }, { status: 403 });
    }
    if (body.chainId !== 84532 && body.chainId !== 8453) {
      return NextResponse.json({ error: "Unsupported native market network." }, { status: 400 });
    }

    const draft = await getMarketDraft(body.draftId);
    if (!draft) return NextResponse.json({ error: "Market draft not found" }, { status: 404 });
    if (draft.riskStatus !== "allowed") {
      return NextResponse.json({ error: "Market draft must be fully allowed before native launch" }, { status: 400 });
    }
    if (!draft.resolution.sourceUrl || !/^https?:\/\//i.test(draft.resolution.sourceUrl)) {
      return NextResponse.json({ error: "Native market launch requires a locked source URL." }, { status: 400 });
    }
    const rulesHash = rulesHashForDraft(draft);
    const metadataHash = metadataHashForDraft(draft);
    if (rulesHash.toLowerCase() !== body.rulesHash.toLowerCase()) {
      return NextResponse.json({ error: "Market rules changed. Shape the market again before launching." }, { status: 400 });
    }
    if (metadataHash.toLowerCase() !== body.metadataHash.toLowerCase()) {
      return NextResponse.json({ error: "Market metadata changed. Shape the market again before launching." }, { status: 400 });
    }
    if (body.closeTime && body.closeTime <= Math.floor(Date.now() / 1000) + 300) {
      return NextResponse.json({ error: "Native market close time must be more than five minutes in the future" }, { status: 400 });
    }

    const primaryDomainName = await resolveNexDomainsPrimaryName(user.walletAddress);
    if (!primaryDomainName) {
      return NextResponse.json({ error: "Native market launch requires a primary .id from NexDomains." }, { status: 403 });
    }

    const launchUser = {
      ...user,
      displayName: primaryDomainName,
      primaryDomainName
    };

    const factoryAddress = process.env.NATIVE_MARKET_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_NATIVE_MARKET_FACTORY_ADDRESS ?? null;
    const resolutionManagerAddress = await readFactoryResolutionManager(body.chainId, factoryAddress);

    const market = await createNativeMarketRecord({
      draft,
      user: launchUser,
      chainId: body.chainId,
      rulesHash,
      metadataHash,
      closeTime: body.closeTime ? new Date(body.closeTime * 1000) : undefined,
      resolutionManagerAddress
    });
    const collateralAddress = body.chainId === 84532 ? process.env.USDC_BASE_SEPOLIA : process.env.USDC_BASE_MAINNET;
    const launchStakeVaultAddress = process.env.NATIVE_LAUNCH_STAKE_VAULT_ADDRESS ?? null;
    const closeTime = body.closeTime ?? Math.floor((market.closeTime ? new Date(market.closeTime).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);
    const authorization = market.contractAddress || !factoryAddress
      ? null
      : await signNativeLaunchAuthorization({
        chainId: body.chainId,
        factoryAddress,
        creator: launchUser.walletAddress,
        rulesHash,
        metadataHash,
        template: body.template,
        closeTime
      });

    return NextResponse.json({
      market,
      transaction: {
        chainId: body.chainId,
        factoryAddress,
        launchStakeVaultAddress,
        collateralAddress: collateralAddress ?? null,
        feeRouterAddress: process.env.NATIVE_FEE_ROUTER_ADDRESS ?? null,
        resolutionManagerAddress,
        closeTime,
        authorization,
        primaryDomainName
      }
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
