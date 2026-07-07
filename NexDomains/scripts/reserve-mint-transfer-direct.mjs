import dotenv from "dotenv";
import {
  concat,
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  isAddress,
  keccak256,
  stringToBytes,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { namehash } from "viem/ens";

dotenv.config();

const CONTROLLER = "0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494";
const NAME_WRAPPER = "0x90d848F20589437EF2e05a91130aEEA253512736";
const REVERSE_REGISTRAR = "0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA";
const PUBLIC_RESOLVER = "0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f";

const NAME = "genesismarkets";
const RECIPIENT = "0x7ec76611Da0AeE7C1B11273E9767FDA1Faa31790";
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const STATE_POLL_INTERVAL_MS = 5_000;
const STATE_POLL_ATTEMPTS = 24;

const controllerAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "reservedOwners",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "reserveNamesBatch",
    stateMutability: "nonpayable",
    inputs: [{ type: "string[]" }, { type: "address[]" }],
    outputs: [],
  },
  {
    type: "function",
    name: "mintReserved",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "owner", type: "address" },
          { name: "secret", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "bool" },
          { name: "ownerControlledFuses", type: "uint16" },
          { name: "deployWallet", type: "bool" },
          { name: "walletSalt", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
];

const nameWrapperAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes" },
    ],
    outputs: [],
  },
];

const reverseRegistrarAbi = [
  {
    type: "function",
    name: "controllers",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setNameForAddr",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "string" },
    ],
    outputs: [{ type: "bytes32" }],
  },
];

const publicResolverAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "string" }],
  },
];

const normalizeName = (value) =>
  value.trim().toLowerCase().replace(/\.id$/, "");

const sameAddress = (a, b) => a.toLowerCase() === b.toLowerCase();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitSuccess(publicClient, hash, label) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} transaction reverted: ${hash}`);
  }
  return receipt;
}

const getErrorText = (error) =>
  [error?.shortMessage, error?.details, error?.message]
    .filter(Boolean)
    .join("\n");

const getNextNonceFromError = (error) => {
  const match = getErrorText(error).match(/next nonce (\d+)/i);
  return match ? Number(match[1]) : undefined;
};

async function writeContractWithFreshNonce(
  walletClient,
  publicClient,
  owner,
  params,
  label,
) {
  let forcedNonce;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const nonce =
      forcedNonce ??
      (await publicClient.getTransactionCount({
        address: owner,
        blockTag: "pending",
      }));

    try {
      return await walletClient.writeContract({ ...params, nonce });
    } catch (error) {
      const text = getErrorText(error);
      const nextNonce = getNextNonceFromError(error);
      const nonceTooLow = /nonce too low|lower than the current nonce/i.test(
        text,
      );

      if (!nonceTooLow || attempt === 5) {
        throw error;
      }

      forcedNonce = nextNonce ?? nonce + 1;
      console.log(
        `${label} nonce lag; retrying with nonce ${forcedNonce} (${attempt}/5)`,
      );
      await sleep(STATE_POLL_INTERVAL_MS);
    }
  }
}

async function readContractWithRetry(publicClient, params, label) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      return await publicClient.readContract(params);
    } catch (error) {
      const text = getErrorText(error);
      const transient = /over rate limit|rate limit|429|timeout|temporarily/i.test(
        text,
      );

      if (!transient || attempt === 8) {
        throw error;
      }

      console.log(
        `${label} read rate-limited; retrying (${attempt}/8)`,
      );
      await sleep(STATE_POLL_INTERVAL_MS * attempt);
    }
  }
}

async function readReservation(publicClient, label) {
  return await readContractWithRetry(publicClient, {
    address: CONTROLLER,
    abi: controllerAbi,
    functionName: "reservedOwners",
    args: [label],
  }, "Reservation");
}

async function waitForReservation(publicClient, label, expectedOwner, fullName) {
  for (let i = 1; i <= STATE_POLL_ATTEMPTS; i++) {
    const reservedOwner = await readReservation(publicClient, label);
    if (sameAddress(reservedOwner, expectedOwner)) {
      console.log(`Reservation visible for ${fullName}: ${reservedOwner}`);
      return reservedOwner;
    }

    console.log(
      `Waiting for reservation state (${i}/${STATE_POLL_ATTEMPTS}); current: ${reservedOwner}`,
    );
    await sleep(STATE_POLL_INTERVAL_MS);
  }

  throw new Error(`Reservation for ${fullName} was not visible after waiting`);
}

async function readWrapperOwner(publicClient, tokenId) {
  return await readContractWithRetry(publicClient, {
    address: NAME_WRAPPER,
    abi: nameWrapperAbi,
    functionName: "ownerOf",
    args: [tokenId],
  }, "Wrapper owner");
}

async function waitForWrapperOwner(publicClient, tokenId, expectedOwner, label) {
  for (let i = 1; i <= STATE_POLL_ATTEMPTS; i++) {
    const owner = await readWrapperOwner(publicClient, tokenId);
    if (sameAddress(owner, expectedOwner)) {
      console.log(`${label} owner visible: ${owner}`);
      return owner;
    }

    console.log(
      `Waiting for ${label} owner (${i}/${STATE_POLL_ATTEMPTS}); current: ${owner}`,
    );
    await sleep(STATE_POLL_INTERVAL_MS);
  }

  throw new Error(`${label} owner did not become ${expectedOwner}`);
}

const reverseNodeForAddress = (address) =>
  keccak256(
    concat([
      namehash("addr.reverse"),
      keccak256(stringToBytes(address.toLowerCase().slice(2))),
    ]),
  );

async function readReverseName(publicClient, reverseNode) {
  return await readContractWithRetry(publicClient, {
    address: PUBLIC_RESOLVER,
    abi: publicResolverAbi,
    functionName: "name",
    args: [reverseNode],
  }, "Reverse name");
}

async function waitForReverseName(publicClient, reverseNode, expectedName) {
  for (let i = 1; i <= STATE_POLL_ATTEMPTS; i++) {
    const reverseName = await readReverseName(publicClient, reverseNode);
    if (reverseName === expectedName) {
      console.log(`Reverse record visible: ${reverseName}`);
      return reverseName;
    }

    console.log(
      `Waiting for reverse record (${i}/${STATE_POLL_ATTEMPTS}); current: ${reverseName || "(empty)"}`,
    );
    await sleep(STATE_POLL_INTERVAL_MS);
  }

  throw new Error(`Reverse record did not become ${expectedName}`);
}

async function setReverseRecord(
  walletClient,
  publicClient,
  owner,
  recipient,
  fullName,
) {
  const reverseNode = reverseNodeForAddress(recipient);
  const currentReverseName = await readReverseName(publicClient, reverseNode);

  if (currentReverseName === fullName) {
    console.log(`Reverse record already set: ${recipient} -> ${fullName}`);
    return;
  }

  const isReverseController = await readContractWithRetry(
    publicClient,
    {
      address: REVERSE_REGISTRAR,
      abi: reverseRegistrarAbi,
      functionName: "controllers",
      args: [owner],
    },
    "Reverse controller",
  );

  if (!isReverseController && !sameAddress(owner, recipient)) {
    throw new Error(
      `Signer ${owner} is not authorised to set reverse record for ${recipient}`,
    );
  }

  const reverseHash = await writeContractWithFreshNonce(
    walletClient,
    publicClient,
    owner,
    {
      address: REVERSE_REGISTRAR,
      abi: reverseRegistrarAbi,
      functionName: "setNameForAddr",
      args: [recipient, recipient, PUBLIC_RESOLVER, fullName],
    },
    "Reverse",
  );
  console.log("Reverse tx:", reverseHash);
  await waitSuccess(publicClient, reverseHash, "Reverse");
  await waitForReverseName(publicClient, reverseNode, fullName);
}

async function main() {
  if (!isAddress(RECIPIENT)) {
    throw new Error(`Invalid recipient address: ${RECIPIENT}`);
  }

  const rawKey = process.env.OWNER_KEY || process.env.DEPLOYER_KEY;
  if (!rawKey) {
    throw new Error(
      "OWNER_KEY or DEPLOYER_KEY is required to sign the mint transaction",
    );
  }

  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  const account = privateKeyToAccount(privateKey);
  const owner = account.address;
  const name = normalizeName(NAME);
  const fullName = `${name}.id`;
  const label = keccak256(stringToBytes(name));
  const tokenId = BigInt(namehash(fullName));

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(RPC_URL),
  });

  console.log("Network: Base mainnet");
  console.log("Signer:", owner);
  console.log("Name:", fullName);
  console.log("Recipient:", RECIPIENT);
  console.log(
    "Signer balance:",
    formatEther(await publicClient.getBalance({ address: owner })),
  );

  const controllerOwner = await readContractWithRetry(
    publicClient,
    {
      address: CONTROLLER,
      abi: controllerAbi,
      functionName: "owner",
    },
    "Controller owner",
  );
  if (!sameAddress(controllerOwner, owner)) {
    throw new Error(`Signer ${owner} is not controller owner ${controllerOwner}`);
  }

  const available = await readContractWithRetry(
    publicClient,
    {
      address: CONTROLLER,
      abi: controllerAbi,
      functionName: "available",
      args: [name],
    },
    "Availability",
  );

  if (!available) {
    const currentOwner = await readWrapperOwner(publicClient, tokenId);

    if (sameAddress(currentOwner, RECIPIENT)) {
      console.log(`Already transferred: ${fullName} is owned by ${RECIPIENT}`);
    } else {
      if (!sameAddress(currentOwner, owner)) {
        throw new Error(
          `${fullName} is unavailable and currently owned by ${currentOwner}`,
        );
      }

      const transferHash = await writeContractWithFreshNonce(
        walletClient,
        publicClient,
        owner,
        {
          address: NAME_WRAPPER,
          abi: nameWrapperAbi,
          functionName: "safeTransferFrom",
          args: [owner, RECIPIENT, tokenId, 1n, "0x"],
        },
        "Transfer",
      );
      console.log("Transfer tx:", transferHash);
      await waitSuccess(publicClient, transferHash, "Transfer");
      await waitForWrapperOwner(
        publicClient,
        tokenId,
        RECIPIENT,
        `${fullName} transfer`,
      );
    }
  } else {
    const existingReservation = await readReservation(publicClient, label);

    if (existingReservation === zeroAddress) {
      const reserveHash = await writeContractWithFreshNonce(
        walletClient,
        publicClient,
        owner,
        {
          address: CONTROLLER,
          abi: controllerAbi,
          functionName: "reserveNamesBatch",
          args: [[name], [owner]],
        },
        "Reserve",
      );
      console.log("Reserve tx:", reserveHash);
      await waitSuccess(publicClient, reserveHash, "Reserve");
      await waitForReservation(publicClient, label, owner, fullName);
    } else if (!sameAddress(existingReservation, owner)) {
      throw new Error(
        `${fullName} is already reserved for ${existingReservation}`,
      );
    } else {
      console.log(`Reservation already exists for ${owner}`);
      await waitForReservation(publicClient, label, owner, fullName);
    }

    const mintHash = await writeContractWithFreshNonce(
      walletClient,
      publicClient,
      owner,
      {
        address: CONTROLLER,
        abi: controllerAbi,
        functionName: "mintReserved",
        args: [
          {
            name,
            owner,
            secret: zeroHash,
            resolver: PUBLIC_RESOLVER,
            data: [],
            reverseRecord: false,
            ownerControlledFuses: 0,
            deployWallet: false,
            walletSalt: 0n,
          },
        ],
      },
      "Mint",
    );
    console.log("Mint tx:", mintHash);
    await waitSuccess(publicClient, mintHash, "Mint");
    await waitForWrapperOwner(publicClient, tokenId, owner, `${fullName} mint`);

    const transferHash = await writeContractWithFreshNonce(
      walletClient,
      publicClient,
      owner,
      {
        address: NAME_WRAPPER,
        abi: nameWrapperAbi,
        functionName: "safeTransferFrom",
        args: [owner, RECIPIENT, tokenId, 1n, "0x"],
      },
      "Transfer",
    );
    console.log("Transfer tx:", transferHash);
    await waitSuccess(publicClient, transferHash, "Transfer");
    await waitForWrapperOwner(
      publicClient,
      tokenId,
      RECIPIENT,
      `${fullName} transfer`,
    );
  }

  const finalOwner = await readWrapperOwner(publicClient, tokenId);
  console.log(`Final owner for ${fullName}: ${finalOwner}`);

  if (!sameAddress(finalOwner, RECIPIENT)) {
    throw new Error(`Expected final owner ${RECIPIENT}, got ${finalOwner}`);
  }

  await setReverseRecord(
    walletClient,
    publicClient,
    owner,
    RECIPIENT,
    fullName,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
