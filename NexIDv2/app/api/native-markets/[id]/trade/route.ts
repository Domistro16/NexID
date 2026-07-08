import { NextResponse } from "next/server";
import { createPublicClient, decodeEventLog, http, parseAbiItem } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getSessionUser } from "@/lib/services/authService";
import { requireDatabase } from "@/lib/server/db";
import { getNexMarket } from "@/lib/services/nexmarketsService";
import { assertAgentTradeWithinLimit, recordAgentNativeTradeRisk } from "@/lib/services/agentTradingRiskService";
import { activeSeason } from "@/lib/services/pointsEngine";
import {
  nativeBuybackBurnFeeRate,
  nativeCreatorFeeRate,
  nativePlatformFeeRate,
  nativeProversPoolFeeRate,
  nativeTradingFeeBps,
  nativeTradingFeeSplit,
  recordNativeTradingFeeLedger
} from "@/lib/services/rewardService";
import { jsonError, nativeMarketTradeSchema } from "@/lib/server/validation";
import { numberToUsdcUnits, usdcUnitsToNumber } from "@/lib/utils/usdc";

const tradeExecutedEvent = parseAbiItem("event TradeExecuted(address indexed trader, uint8 indexed side, uint256 notional, uint256 fee, uint256 shares)");

function sideIndex(side: "ride" | "fade") {
  return side === "ride" ? 0 : 1;
}

function usdc(value: bigint) {
  return usdcUnitsToNumber(value);
}

function feeBreakdown() {
  const creatorBps = Math.round(nativeCreatorFeeRate * 10_000);
  const platformBps = Math.round(nativePlatformFeeRate * 10_000);
  const proversPoolBps = Math.round(nativeProversPoolFeeRate * 10_000);
  const buybackBurnBps = Math.round(nativeBuybackBurnFeeRate * 10_000);
  return {
    nativeTradingFeeBps,
    creatorBps,
    platformBps,
    proversPoolBps,
    buybackBurnBps,
    protocolBps: platformBps,
    rewardsBps: proversPoolBps,
    securityBps: buybackBurnBps
  };
}

function chainConfig(chainId: number) {
  if (chainId === 84532) return { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL };
  if (chainId === 8453) return { chain: base, rpcUrl: process.env.BASE_RPC_URL };
  throw new Error("Unsupported native market chain.");
}

async function verifiedTradeEvent(input: {
  txHash: `0x${string}`;
  chainId: number;
  contractAddress: string;
  walletAddress: string;
  side: "ride" | "fade";
}) {
  const config = chainConfig(input.chainId);
  if (!config.rpcUrl) throw new Error("RPC URL is not configured for this native market chain.");
  const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash: input.txHash });
  if (receipt.status !== "success") throw new Error("Native trade transaction did not succeed.");
  const contractAddress = input.contractAddress.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress) continue;
    try {
      const decoded = decodeEventLog({
        abi: [tradeExecutedEvent],
        data: log.data,
        topics: log.topics
      });
      const args = decoded.args as unknown as {
        trader: string;
        side: number;
        notional: bigint;
        fee: bigint;
        shares: bigint;
      };
      if (
        args.trader.toLowerCase() === input.walletAddress.toLowerCase() &&
        Number(args.side) === sideIndex(input.side)
      ) {
        return { ...args, logIndex: log.logIndex };
      }
    } catch {
      // Ignore unrelated logs from the same contract.
    }
  }
  throw new Error("No matching native TradeExecuted event was found in this transaction.");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = nativeMarketTradeSchema.parse(await request.json());
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (user.walletAddress.toLowerCase() !== body.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Connected wallet does not match signed-in user" }, { status: 403 });
    }
    const market = await getNexMarket(id);
    if (!market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (market.origin !== "native") return NextResponse.json({ error: "This market is not native" }, { status: 400 });
    if (!market.contractAddress) return NextResponse.json({ error: "Native market contract is not deployed or indexed yet" }, { status: 409 });
    if (process.env.NATIVE_MARKETS_ENABLED !== "true") return NextResponse.json({ error: "Native trading is disabled" }, { status: 403 });
    if (market.chainId !== body.chainId) return NextResponse.json({ error: "Trade chain does not match market chain" }, { status: 400 });
    if (market.status !== "trading_live") return NextResponse.json({ error: "This market is not open for trading yet" }, { status: 409 });

    const fee = feeBreakdown();

    if (!body.txHash) {
      await assertAgentTradeWithinLimit({
        db: requireDatabase(),
        walletAddress: body.walletAddress,
        amountUsdc: body.amount
      });
      return NextResponse.json({
        marketId: id,
        chainId: body.chainId,
        side: body.side,
        amount: body.amount,
        contractAddress: market.contractAddress,
        fee
      });
    }

    const event = await verifiedTradeEvent({
      txHash: body.txHash as `0x${string}`,
      chainId: body.chainId,
      contractAddress: market.contractAddress,
      walletAddress: body.walletAddress,
      side: body.side
    });
    const expectedNotional = numberToUsdcUnits(body.amount);
    if (event.notional !== expectedNotional) {
      throw new Error("Trade amount does not match the onchain transaction.");
    }
    const db = requireDatabase();
    const notionalUsdc = usdc(event.notional);
    await assertAgentTradeWithinLimit({
      db,
      walletAddress: body.walletAddress,
      amountUsdc: notionalUsdc
    });
    const feeUsdc = usdc(event.fee);
    const shares = usdc(event.shares);
    const existingTrade = await db.nativeTrade.findUnique({
      where: { txHash_eventLogIndex: { txHash: body.txHash, eventLogIndex: event.logIndex } }
    });
    if (existingTrade) {
      const existingPosition = existingTrade.positionId
        ? await db.nativePosition.findUnique({ where: { id: existingTrade.positionId } })
        : null;
      const existingReceipt = await db.marketReceipt.findFirst({
        where: {
          marketId: id,
          userId: user.id,
          walletAddress: user.walletAddress,
          proof: "Native onchain trade",
          side: body.side,
          payload: { path: ["txHash"], equals: body.txHash }
        },
        orderBy: { createdAt: "desc" }
      });
      return NextResponse.json({
        marketId: id,
        chainId: body.chainId,
        side: body.side,
        amount: notionalUsdc,
        slippageBps: body.slippageBps,
        contractAddress: market.contractAddress,
        position: existingPosition ? { id: existingPosition.id, status: existingPosition.status } : null,
        trade: { id: existingTrade.id, txHash: existingTrade.txHash, notionalUsdc: existingTrade.notionalUsdc, feeUsdc: existingTrade.feeUsdc },
        receipt: existingReceipt ? { id: existingReceipt.id, title: existingReceipt.title, proof: existingReceipt.proof, createdAt: existingReceipt.createdAt.toISOString() } : null,
        fee
      });
    }

    await db.market.update({
      where: { id },
      data: { status: "trading_live" }
    });
    const position = await db.nativePosition.create({
      data: {
        marketId: id,
        userId: user.id,
        walletAddress: user.walletAddress,
        side: body.side,
        shares,
        notionalUsdc,
        status: "open",
        txHash: body.txHash
      }
    });
    const trade = await db.nativeTrade.create({
      data: {
        marketId: id,
        positionId: position.id,
        walletAddress: user.walletAddress,
        side: body.side,
        notionalUsdc,
        feeUsdc,
        txHash: body.txHash,
        eventLogIndex: event.logIndex
      }
    });
    await recordAgentNativeTradeRisk({
      db,
      market: {
        id,
        creatorWallet: market.creatorWallet,
        creatorAgentProfileId: market.creatorAgentProfileId,
        creatorAgentPublicId: market.creatorAgentPublicId
      },
      trade: {
        id: trade.id,
        walletAddress: trade.walletAddress,
        side: body.side,
        notionalUsdc: trade.notionalUsdc,
        txHash: trade.txHash,
        createdAt: trade.createdAt
      },
      source: "native_trade_api"
    });
    const receipt = await db.marketReceipt.create({
      data: {
        marketId: id,
        userId: user.id,
        walletAddress: user.walletAddress,
        side: body.side,
        title: `${body.side === "ride" ? "Rode" : "Faded"} ${market.title}`,
        proof: "Native onchain trade",
        payload: {
          origin: "native",
          executionMode: "user_wallet",
          chainId: body.chainId,
          contractAddress: market.contractAddress,
          txHash: body.txHash,
          notionalUsdc,
          feeUsdc,
          shares,
          rulesHash: market.rulesHash,
          metadataHash: market.metadataHash
        } as never
      }
    });
    const feeSplit = nativeTradingFeeSplit({ notionalUsdc, feeUsdc });
    await db.creatorFeeLedger.create({
      data: {
        marketId: id,
        creatorWallet: market.creatorWallet ?? market.contractAddress,
        sourceTxHash: body.txHash,
        volumeUsdc: notionalUsdc,
        creatorFeeUsdc: feeSplit.creatorFeeUsd,
        protocolFeeUsdc: feeSplit.platformFeeUsd,
        rewardsFeeUsdc: feeSplit.proversPoolFeeUsd,
        securityFeeUsdc: feeSplit.buybackBurnFeeUsd
      }
    });
    await recordNativeTradingFeeLedger({
      userId: user.id,
      tradeId: trade.id,
      marketId: id,
      side: body.side,
      notionalUsdc,
      feeUsdc,
      txHash: body.txHash
    });
    const volumePoints = Math.floor(notionalUsdc / 100);
    if (volumePoints > 0) {
      await db.pointsEvent.create({
        data: {
          userId: user.id,
          season: activeSeason(),
          reason: "native_trade_volume",
          points: volumePoints,
          metadata: {
            marketId: id,
            tradeId: trade.id,
            receiptId: receipt.id,
            txHash: body.txHash,
            pointsRule: "native_volume_points_per_100_usdc"
          } as never
        }
      });
      await db.user.update({
        where: { id: user.id },
        data: { pointsTotal: { increment: volumePoints } }
      });
    }

    return NextResponse.json({
      marketId: id,
      chainId: body.chainId,
      side: body.side,
      amount: notionalUsdc,
      slippageBps: body.slippageBps,
      contractAddress: market.contractAddress,
      position: { id: position.id, status: position.status },
      trade: { id: trade.id, txHash: trade.txHash, notionalUsdc: trade.notionalUsdc, feeUsdc: trade.feeUsdc },
      receipt: { id: receipt.id, title: receipt.title, proof: receipt.proof, createdAt: receipt.createdAt.toISOString() },
      fee
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
