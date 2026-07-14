import { getPrisma } from "./db";
import { env } from "./env";
import { serialize } from "./http";

type VerifiedEvent = {
  receipt: { blockNumber: bigint; blockHash: string };
  event: { logIndex?: number | null };
};

export async function persistWorkEscrowEvent(input: {
  txHash: `0x${string}`;
  eventName: string;
  opaqueId: string;
  payload: Record<string, unknown>;
  verified: VerifiedEvent;
}) {
  if (!env.workEscrowAddress) throw new Error("NEX_WORK_ESCROW_ADDRESS is not configured.");
  const logIndex = Number(input.verified.event.logIndex ?? 0);
  return getPrisma()!.chainEvent.upsert({
    where: { chainId_transactionHash_logIndex: { chainId: env.robinhoodChainId, transactionHash: input.txHash.toLowerCase(), logIndex } },
    update: { confirmedAt: new Date(), orphanedAt: null, payload: serialize(input.payload) as never },
    create: {
      chainId: env.robinhoodChainId,
      contractAddress: env.workEscrowAddress,
      blockNumber: input.verified.receipt.blockNumber,
      blockHash: input.verified.receipt.blockHash,
      transactionHash: input.txHash.toLowerCase(),
      logIndex,
      eventName: input.eventName,
      opaqueId: input.opaqueId,
      payload: serialize(input.payload) as never,
      confirmedAt: new Date()
    }
  });
}

export async function persistProductionPaymentEvent(input: {
  txHash: `0x${string}`;
  opaqueId: string;
  payload: Record<string, unknown>;
  verified: VerifiedEvent;
  eventName?: string;
}) {
  if (!env.productionPaymentsAddress) throw new Error("NEX_PRODUCTION_PAYMENTS_ADDRESS is not configured.");
  const logIndex = Number(input.verified.event.logIndex ?? 0);
  return getPrisma()!.chainEvent.upsert({
    where: { chainId_transactionHash_logIndex: { chainId: env.robinhoodChainId, transactionHash: input.txHash.toLowerCase(), logIndex } },
    update: { confirmedAt: new Date(), orphanedAt: null, payload: serialize(input.payload) as never },
    create: {
      chainId: env.robinhoodChainId,
      contractAddress: env.productionPaymentsAddress,
      blockNumber: input.verified.receipt.blockNumber,
      blockHash: input.verified.receipt.blockHash,
      transactionHash: input.txHash.toLowerCase(),
      logIndex,
      eventName: input.eventName || "ProductionPaid",
      opaqueId: input.opaqueId,
      payload: serialize(input.payload) as never,
      confirmedAt: new Date()
    }
  });
}
