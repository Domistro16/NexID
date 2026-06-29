import { NextResponse } from "next/server";
import { createPublicClient, http, keccak256, parseAbi, stringToBytes } from "viem";
import { base, baseSepolia } from "viem/chains";
import { nexMarketsContracts } from "@/config/nexmarkets-contracts";
import { getSessionUser } from "@/lib/services/authService";
import { resolveNexDomainsPrimaryName } from "@/lib/services/nexdomainsPrimaryService";
import { signNativeLaunchAuthorization } from "@/lib/services/nativeLaunchAuthorizationService";
import { createNativeMarketRecord, getMarketDraft, metadataHashForDraft, rulesHashForDraft, updateMarketDraftShape } from "@/lib/services/nexmarketsService";
import { qualifyMarketDraftForLaunch, sourceQualificationBlocksLaunch } from "@/lib/services/sourceQualificationService";
import { jsonError, nativeMarketCreateSchema } from "@/lib/server/validation";
import type { ShapedMarketDraft } from "@/lib/types/nexmarkets";

const marketFactoryAbi = parseAbi([
  "function resolutionManager() view returns (address)",
  "function GENESIS_LAUNCHER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)"
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
  const fallback = configuredAddress(nexMarketsContracts(chainId)?.resolutionManager);
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

async function readGenesisLauncherAccess(chainId: number, factoryAddress: string | null | undefined, walletAddress: string) {
  const checkedFactory = configuredAddress(factoryAddress);
  const checkedWallet = configuredAddress(walletAddress);
  if (!checkedFactory || !checkedWallet) return false;
  const configuredGenesisLauncher = configuredAddress(nexMarketsContracts(chainId)?.genesisLauncher ?? process.env.GENESIS_LAUNCHER_ADDRESS);
  if (configuredGenesisLauncher && configuredGenesisLauncher === checkedWallet) return true;
  const config = nativeChainConfig(chainId);
  if (!config?.rpcUrl) {
    throw new Error(`RPC URL is required to read the native factory Genesis launcher role for chain ${chainId}.`);
  }

  try {
    const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
    const role = await client.readContract({
      address: checkedFactory,
      abi: marketFactoryAbi,
      functionName: "GENESIS_LAUNCHER_ROLE"
    });
    return await client.readContract({
      address: checkedFactory,
      abi: marketFactoryAbi,
      functionName: "hasRole",
      args: [role, checkedWallet]
    });
  } catch (error) {
    throw new Error(`Could not verify Genesis launcher access. ${errorMessage(error)}`);
  }
}

function canonicalCloseTimeSeconds(draft: ShapedMarketDraft | null) {
  const fallback = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const closeAt = draft?.timeframe?.closeAt ? new Date(draft.timeframe.closeAt) : null;
  if (!closeAt || Number.isNaN(closeAt.getTime())) return fallback;
  const timestamp = Math.floor(closeAt.getTime() / 1000);
  return timestamp > Math.floor(Date.now() / 1000) + 300 ? timestamp : fallback;
}

function templateIdFor(template: string) {
  return keccak256(stringToBytes(template));
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

    const savedDraft = body.draftId ? await getMarketDraft(body.draftId) : null;
    const baseDraft = savedDraft ?? body.draft ?? null;
    if (!baseDraft) {
      return NextResponse.json({
        error: "Market draft not found. Prepare the market again before launching.",
        detail: body.draftId?.startsWith("draft_")
          ? "The previous draft was temporary and was not persisted in the database."
          : "The draft row could not be found in the database."
      }, { status: 404 });
    }
    const draft = await qualifyMarketDraftForLaunch({ draft: baseDraft });
    if (body.draftId && savedDraft) await updateMarketDraftShape(body.draftId, draft);
    if (sourceQualificationBlocksLaunch(draft)) {
      return NextResponse.json({
        error: draft.sourceQualification?.launchBlockReason ?? "Source qualification blocked this market launch.",
        sourceQualification: draft.sourceQualification ?? null
      }, { status: 400 });
    }
    if (draft.riskStatus !== "allowed") {
      return NextResponse.json({ error: "Market draft must be fully allowed before native launch" }, { status: 400 });
    }
    if (!draft.resolution.sourceUrl || !/^https?:\/\//i.test(draft.resolution.sourceUrl)) {
      return NextResponse.json({ error: "Native market launch requires a locked source URL." }, { status: 400 });
    }
    const rulesHash = rulesHashForDraft(draft);
    const metadataHash = metadataHashForDraft(draft);
    const closeTime = canonicalCloseTimeSeconds(draft);
    if (closeTime <= Math.floor(Date.now() / 1000) + 300) {
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

    const contracts = nexMarketsContracts(body.chainId);
    const factoryAddress = contracts?.marketFactory ?? null;
    if (body.launchMode === "genesis") {
      if (!factoryAddress) {
        return NextResponse.json({ error: "Genesis Market factory is not configured." }, { status: 400 });
      }
      const canLaunchGenesis = await readGenesisLauncherAccess(body.chainId, factoryAddress, body.walletAddress);
      if (!canLaunchGenesis) {
        return NextResponse.json({ error: "Genesis Markets can only be launched by the platform launcher wallet." }, { status: 403 });
      }
    }
    const resolutionManagerAddress = await readFactoryResolutionManager(body.chainId, factoryAddress);

    const market = await createNativeMarketRecord({
      draft,
      user: launchUser,
      chainId: body.chainId,
      launchMode: body.launchMode,
      rulesHash,
      metadataHash,
      closeTime: new Date(closeTime * 1000),
      resolutionManagerAddress
    });
    const collateralAddress = contracts?.collateral ?? null;
    const launchStakeVaultAddress = contracts?.launchStakeVault ?? null;
    const authorization = market.contractAddress || !factoryAddress
      ? null
      : await signNativeLaunchAuthorization({
        chainId: body.chainId,
        factoryAddress,
        creator: launchUser.walletAddress,
        rulesHash,
        metadataHash,
        template: draft.template,
        closeTime
      });

    return NextResponse.json({
      market,
      transaction: {
        chainId: body.chainId,
        factoryAddress,
        launchStakeVaultAddress,
        collateralAddress: collateralAddress ?? null,
        feeRouterAddress: contracts?.feeRouter ?? null,
        resolutionManagerAddress,
        rulesHash,
        metadataHash,
        template: draft.template,
        templateId: templateIdFor(draft.template),
        closeTime,
        launchMode: body.launchMode,
        launchStakeRequiredUsdc: body.launchMode === "genesis" ? 0 : 20,
        authorization,
        primaryDomainName
      }
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
