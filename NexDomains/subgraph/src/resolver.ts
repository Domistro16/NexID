import { Address, Bytes, ethereum } from "@graphprotocol/graph-ts";

import {
  ABIChanged as ABIChangedEvent,
  AddrChanged as AddrChangedEvent,
  AddressChanged as AddressChangedEvent,
  ContenthashChanged as ContenthashChangedEvent,
  InterfaceChanged as InterfaceChangedEvent,
  NameChanged as NameChangedEvent,
  PubkeyChanged as PubkeyChangedEvent,
  TextChanged as TextChangedWithValueEvent,
  VersionChanged as VersionChangedEvent,
  PaymentAddressChanged as PaymentAddressChangedEvent,
  PaymentEnabledChanged as PaymentEnabledChangedEvent,
  X402EndpointChanged as X402EndpointChangedEvent,
  AgentMetadataChanged as AgentMetadataChangedEvent,
} from "./types/Resolver/Resolver";

import {
  AbiChanged,
  Account,
  AddrChanged,
  AgentMetadataChanged,
  ContenthashChanged,
  Domain,
  InterfaceChanged,
  MulticoinAddrChanged,
  NameChanged,
  PaymentAddressChanged,
  PaymentEnabledChanged,
  PubkeyChanged,
  Resolver,
  TextChanged,
  VersionChanged,
  X402EndpointChanged,
} from "./types/schema";

export function handleAddrChanged(event: AddrChangedEvent): void {
  let account = new Account(event.params.a.toHexString());
  account.save();

  let resolver = new Resolver(
    createResolverID(event.params.node, event.address)
  );
  resolver.domain = event.params.node.toHexString();
  resolver.address = event.address;
  resolver.addr = event.params.a.toHexString();
  resolver.save();

  let domain = Domain.load(event.params.node.toHexString());
  if (domain && domain.resolver == resolver.id) {
    domain.resolvedAddress = event.params.a.toHexString();
    domain.save();
  }

  let resolverEvent = new AddrChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.addr = event.params.a.toHexString();
  resolverEvent.save();
}

export function handleMulticoinAddrChanged(event: AddressChangedEvent): void {
  let resolver = getOrCreateResolver(event.params.node, event.address, false);

  let coinType = event.params.coinType;
  if (resolver.coinTypes == null) {
    resolver.coinTypes = [coinType];
    resolver.save();
  } else {
    let coinTypes = resolver.coinTypes!;
    if (!coinTypes.includes(coinType)) {
      coinTypes.push(coinType);
      resolver.coinTypes = coinTypes;
      resolver.save();
    }
  }

  let resolverEvent = new MulticoinAddrChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.coinType = coinType;
  resolverEvent.addr = event.params.newAddress;
  resolverEvent.save();
}

export function handleNameChanged(event: NameChangedEvent): void {
  if (event.params.name.indexOf("\u0000") != -1) return;

  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new NameChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.name = event.params.name;
  resolverEvent.save();
}

export function handleABIChanged(event: ABIChangedEvent): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new AbiChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.contentType = event.params.contentType;
  resolverEvent.save();
}

export function handlePubkeyChanged(event: PubkeyChangedEvent): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new PubkeyChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.x = event.params.x;
  resolverEvent.y = event.params.y;
  resolverEvent.save();
}

export function handleTextChangedWithValue(
  event: TextChangedWithValueEvent
): void {
  let resolver = getOrCreateResolver(event.params.node, event.address, false);

  let key = event.params.key;
  if (resolver.texts == null) {
    resolver.texts = [key];
    resolver.save();
  } else {
    let texts = resolver.texts!;
    if (!texts.includes(key)) {
      texts.push(key);
      resolver.texts = texts;
      resolver.save();
    }
  }

  let resolverEvent = new TextChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.key = event.params.key;
  resolverEvent.value = event.params.value;
  resolverEvent.save();
}

export function handleContentHashChanged(event: ContenthashChangedEvent): void {
  let resolver = getOrCreateResolver(event.params.node, event.address, false);
  resolver.contentHash = event.params.hash;
  resolver.save();

  let resolverEvent = new ContenthashChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.hash = event.params.hash;
  resolverEvent.save();
}

export function handleInterfaceChanged(event: InterfaceChangedEvent): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new InterfaceChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.interfaceID = event.params.interfaceID;
  resolverEvent.implementer = event.params.implementer;
  resolverEvent.save();
}

export function handleVersionChanged(event: VersionChangedEvent): void {
  let resolverEvent = new VersionChanged(createEventID(event));
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.resolver = createResolverID(event.params.node, event.address);
  resolverEvent.version = event.params.newVersion;
  resolverEvent.save();

  let domain = Domain.load(event.params.node.toHexString());
  if (domain && domain.resolver == resolverEvent.resolver) {
    domain.resolvedAddress = null;
    domain.save();
  }

  let resolver = getOrCreateResolver(event.params.node, event.address, false);
  resolver.addr = null;
  resolver.contentHash = null;
  resolver.texts = null;
  resolver.coinTypes = null;
  resolver.save();
}

// ──────────────────────────────────────────────────────────
// NexId Agent Resolver Event Handlers
// ──────────────────────────────────────────────────────────

export function handlePaymentAddressChanged(
  event: PaymentAddressChangedEvent
): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new PaymentAddressChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.chainId = event.params.chainId;
  resolverEvent.addr = event.params.addr;
  resolverEvent.save();
}

export function handlePaymentEnabledChanged(
  event: PaymentEnabledChangedEvent
): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new PaymentEnabledChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.enabled = event.params.enabled;
  resolverEvent.save();
}

export function handleX402EndpointChanged(
  event: X402EndpointChangedEvent
): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new X402EndpointChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.endpoint = event.params.endpoint;
  resolverEvent.save();
}

export function handleAgentMetadataChanged(
  event: AgentMetadataChangedEvent
): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new AgentMetadataChanged(createEventID(event));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.metadata = event.params.uri;
  resolverEvent.save();
}

// ──────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────

function getOrCreateResolver(
  node: Bytes,
  address: Address,
  saveOnNew: boolean
): Resolver {
  let id = createResolverID(node, address);
  let resolver = Resolver.load(id);
  if (resolver == null) {
    resolver = new Resolver(id);
    resolver.domain = node.toHexString();
    resolver.address = address;
    if (saveOnNew) {
      resolver.save();
    }
  }
  return resolver as Resolver;
}

function createEventID(event: ethereum.Event): string {
  return event.block.number
    .toString()
    .concat("-")
    .concat(event.logIndex.toString());
}

export function createResolverID(node: Bytes, resolver: Address): string {
  return resolver
    .toHexString()
    .concat("-")
    .concat(node.toHexString());
}
