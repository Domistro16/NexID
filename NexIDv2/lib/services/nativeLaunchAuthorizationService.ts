import { randomBytes } from "crypto";
import { getAddress, isAddress, keccak256, stringToBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const AUTHORIZATION_DOMAIN_NAME = "NexMarketsMarketFactory";
const AUTHORIZATION_DOMAIN_VERSION = "1";
const DEFAULT_AUTHORIZATION_TTL_SECONDS = 15 * 60;

const launchAuthorizationTypes = {
  LaunchAuthorization: [
    { name: "creator", type: "address" },
    { name: "rulesHash", type: "bytes32" },
    { name: "metadataHash", type: "bytes32" },
    { name: "templateId", type: "bytes32" },
    { name: "closeTime", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

function configuredPrivateKey() {
  const explicit = process.env.NATIVE_LAUNCH_AUTHORIZER_PRIVATE_KEY;
  if (explicit) return explicit;
  if (process.env.NODE_ENV !== "production") return process.env.DEPLOYER_PRIVATE_KEY;
  return undefined;
}

function normalizePrivateKey(value: string | undefined): Hex {
  if (!value) throw new Error("NATIVE_LAUNCH_AUTHORIZER_PRIVATE_KEY is required to authorize native launches.");
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error("NATIVE_LAUNCH_AUTHORIZER_PRIVATE_KEY must be a 32-byte private key.");
  }
  return normalized as Hex;
}

function normalizeHex32(name: string, value: string): Hex {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) throw new Error(`${name} must be a bytes32 hex value.`);
  return value as Hex;
}

function randomUint256String() {
  return BigInt(`0x${randomBytes(32).toString("hex")}`).toString();
}

export function nativeTemplateId(template: string): Hex {
  return keccak256(stringToBytes(template));
}

export async function signNativeLaunchAuthorization(input: {
  chainId: number;
  factoryAddress: string;
  creator: string;
  rulesHash: string;
  metadataHash: string;
  template: string;
  closeTime: number;
}) {
  if (!isAddress(input.factoryAddress)) throw new Error("Native market factory address is not configured.");
  if (!isAddress(input.creator)) throw new Error("Creator wallet address is invalid.");

  const account = privateKeyToAccount(normalizePrivateKey(configuredPrivateKey()));
  const expectedAuthorizer = process.env.NATIVE_LAUNCH_AUTHORIZER_ADDRESS;
  if (expectedAuthorizer && getAddress(expectedAuthorizer) !== account.address) {
    throw new Error("NATIVE_LAUNCH_AUTHORIZER_ADDRESS does not match NATIVE_LAUNCH_AUTHORIZER_PRIVATE_KEY.");
  }

  const nonce = randomUint256String();
  const deadline = Math.floor(Date.now() / 1000) + DEFAULT_AUTHORIZATION_TTL_SECONDS;
  const templateId = nativeTemplateId(input.template);
  const creator = getAddress(input.creator) as Address;
  const verifyingContract = getAddress(input.factoryAddress) as Address;
  const rulesHash = normalizeHex32("rulesHash", input.rulesHash);
  const metadataHash = normalizeHex32("metadataHash", input.metadataHash);

  const signature = await account.signTypedData({
    domain: {
      name: AUTHORIZATION_DOMAIN_NAME,
      version: AUTHORIZATION_DOMAIN_VERSION,
      chainId: input.chainId,
      verifyingContract
    },
    types: launchAuthorizationTypes,
    primaryType: "LaunchAuthorization",
    message: {
      creator,
      rulesHash,
      metadataHash,
      templateId,
      closeTime: BigInt(input.closeTime),
      nonce: BigInt(nonce),
      deadline: BigInt(deadline)
    }
  });

  return {
    authorizer: account.address,
    creator,
    templateId,
    nonce,
    deadline,
    signature
  };
}
