import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { resolveNexDomainsPrimaryName } from "@/lib/services/nexdomainsPrimaryService";
import { signNativeLaunchAuthorization } from "@/lib/services/nativeLaunchAuthorizationService";
import { createNativeMarketRecord, getMarketDraft } from "@/lib/services/nexmarketsService";
import { jsonError, nativeMarketCreateSchema } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const body = nativeMarketCreateSchema.parse(await request.json());
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (user.walletAddress.toLowerCase() !== body.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Connected wallet does not match signed-in user" }, { status: 403 });
    }

    const draft = await getMarketDraft(body.draftId);
    if (!draft) return NextResponse.json({ error: "Market draft not found" }, { status: 404 });
    if (draft.riskStatus !== "allowed") {
      return NextResponse.json({ error: "Market draft must be fully allowed before native launch" }, { status: 400 });
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

    const market = await createNativeMarketRecord({
      draft,
      user: launchUser,
      chainId: body.chainId,
      rulesHash: body.rulesHash,
      metadataHash: body.metadataHash,
      closeTime: body.closeTime ? new Date(body.closeTime * 1000) : undefined
    });
    const collateralAddress = body.chainId === 84532 ? process.env.USDC_BASE_SEPOLIA : process.env.USDC_BASE_MAINNET;
    const launchStakeVaultAddress = process.env.NATIVE_LAUNCH_STAKE_VAULT_ADDRESS ?? null;
    const closeTime = body.closeTime ?? Math.floor((market.closeTime ? new Date(market.closeTime).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);
    const factoryAddress = process.env.NATIVE_MARKET_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_NATIVE_MARKET_FACTORY_ADDRESS ?? null;
    const authorization = market.contractAddress || !factoryAddress
      ? null
      : await signNativeLaunchAuthorization({
        chainId: body.chainId,
        factoryAddress,
        creator: launchUser.walletAddress,
        rulesHash: body.rulesHash,
        metadataHash: body.metadataHash,
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
        resolutionManagerAddress: process.env.NATIVE_RESOLUTION_MANAGER_ADDRESS ?? null,
        closeTime,
        authorization,
        primaryDomainName
      }
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
