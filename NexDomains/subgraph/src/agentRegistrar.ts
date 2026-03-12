import { BigInt, ByteArray, Bytes, crypto } from "@graphprotocol/graph-ts";

import {
  checkValidLabel,
  concat,
  createEventID,
  createOrLoadAccount,
  ETH_NODE,
} from "./utils";

import { setNamePreimage } from "./ethRegistrar";

// Import event types from the AgentRegistrarController ABI
import {
  NameRegistered as AgentNameRegisteredEvent,
  AgentWalletDeployed as AgentWalletDeployedEvent,
  BatchRegistered as BatchRegisteredEvent,
  PointsAwarded as PointsAwardedEvent,
  NameReserved as NameReservedEvent,
  ReservedNameMinted as ReservedNameMintedEvent,
  NameReservationCleared as NameReservationClearedEvent,
} from "./types/AgentRegistrarController/AgentRegistrarController";

// Import entity types generated from the GraphQL schema
import {
  AgentWallet,
  BatchRegistration,
  Domain,
  NameReservation,
  PointsAward,
  Registration,
} from "./types/schema";

var rootNode: ByteArray = ByteArray.fromHexString(ETH_NODE);

export function handleNameRegisteredByAgentController(
  event: AgentNameRegisteredEvent
): void {
  setNamePreimage(
    event.params.name,
    event.params.label,
    event.params.cost
  );
}

export function handleAgentWalletDeployed(
  event: AgentWalletDeployedEvent
): void {
  let account = createOrLoadAccount(event.params.owner.toHex());

  let wallet = new AgentWallet(event.params.wallet.toHex());
  wallet.owner = account.id;
  wallet.wallet = event.params.wallet;
  wallet.domainName = event.params.domainName;
  wallet.blockNumber = event.block.number.toI32();
  wallet.transactionID = event.transaction.hash;
  wallet.createdAt = event.block.timestamp;
  wallet.save();
}

export function handleBatchRegistered(event: BatchRegisteredEvent): void {
  let account = createOrLoadAccount(event.params.owner.toHex());

  let batch = new BatchRegistration(createEventID(event));
  batch.owner = account.id;
  batch.count = event.params.count;
  batch.totalCost = event.params.totalCost;
  batch.blockNumber = event.block.number.toI32();
  batch.transactionID = event.transaction.hash;
  batch.createdAt = event.block.timestamp;
  batch.save();
}

export function handlePointsAwarded(event: PointsAwardedEvent): void {
  let account = createOrLoadAccount(event.params.user.toHex());

  let award = new PointsAward(createEventID(event));
  award.account = account.id;
  award.domainName = event.params.name;
  award.points = event.params.points;
  award.totalUserPoints = event.params.totalUserPoints;
  award.totalDistributed = event.params.totalDistributed;
  award.blockNumber = event.block.number.toI32();
  award.transactionID = event.transaction.hash;
  award.save();
}

export function handleNameReserved(event: NameReservedEvent): void {
  let account = createOrLoadAccount(event.params.owner.toHex());

  let reservation = new NameReservation(event.params.label.toHex());
  reservation.labelHash = event.params.label;
  reservation.name = event.params.name;
  reservation.reservedFor = account.id;
  reservation.isActive = true;
  reservation.blockNumber = event.block.number.toI32();
  reservation.transactionID = event.transaction.hash;
  reservation.createdAt = event.block.timestamp;
  reservation.save();
}

export function handleReservedNameMinted(
  event: ReservedNameMintedEvent
): void {
  let reservation = NameReservation.load(event.params.label.toHex());
  if (reservation != null) {
    reservation.isActive = false;
    reservation.save();
  }

  // Also set the name preimage on the domain/registration
  // ReservedNameMinted uses the same internal registration flow,
  // so the BaseRegistrar NameRegistered event handles domain creation.
  // We just need to set the label name via the preimage.
  let domainId = crypto
    .keccak256(concat(rootNode, event.params.label))
    .toHex();
  let domain = Domain.load(domainId);
  if (domain != null && checkValidLabel(event.params.name)) {
    domain.labelName = event.params.name;
    domain.name = event.params.name + ".safu";
    domain.save();

    let registration = Registration.load(event.params.label.toHex());
    if (registration != null) {
      registration.labelName = event.params.name;
      registration.cost = BigInt.fromI32(0);
      registration.save();
    }
  }
}

export function handleNameReservationCleared(
  event: NameReservationClearedEvent
): void {
  let reservation = NameReservation.load(event.params.label.toHex());
  if (reservation != null) {
    reservation.isActive = false;
    reservation.save();
  }
}
