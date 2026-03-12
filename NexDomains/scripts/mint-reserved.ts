import hre from "hardhat";
import { Address, zeroHash } from "viem";
import { namehash } from "viem/ens";

const CONTROLLER: Address = "0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494";
const OWNER: Address = "0xd83defba240568040b39bb2c8b4db7db02d40593";
const NAME_WRAPPER: Address = "0x90d848F20589437EF2e05a91130aEEA253512736";
const REVERSE_REGISTRAR: Address = "0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA";
const PUBLIC_RESOLVER: Address = "0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f";

const MINTS: { name: string; to: Address }[] = [
  
  {
    name: "alice",
    to: "0x639DB8EA5529083DDDAf4A87816B395691a26a5f",
  },
];

const normalizeName = (value: string) =>
  value.trim().toLowerCase().replace(/\.id$/, "");

async function main() {
  const { viem } = hre;
  const [walletClient] = await viem.getWalletClients();
  console.log("Using signer:", walletClient.account.address);

  const controller = await viem.getContractAt(
    "AgentRegistrarController",
    CONTROLLER,
  );
  const nameWrapper = await viem.getContractAt("NameWrapper", NAME_WRAPPER);
  const reverseRegistrar = await viem.getContractAt(
    "ReverseRegistrar",
    REVERSE_REGISTRAR,
  );

  for (const mint of MINTS) {
    const name = normalizeName(mint.name);
    const to = mint.to as Address;
    const fullName = `${name}.id`;


    console.log(`Minting reserved: ${fullName} -> ${OWNER}`);
    const req = {
      name,
      owner: OWNER,
      secret: zeroHash,
      resolver: PUBLIC_RESOLVER,
      data: [] as `0x${string}`[],
      reverseRecord: false,
      ownerControlledFuses: 0,
      deployWallet: false,
      walletSalt: 0n,
    };
    const mintHash = await controller.write.mintReserved([req]);
    console.log("Mint tx:", mintHash);

    const tokenId = namehash(fullName);
    console.log(`Transferring ${fullName} -> ${to}`);
    const transferHash = await nameWrapper.write.safeTransferFrom([
      OWNER,
      to,
      BigInt(tokenId),
      1n,
      "0x",
    ]);
    console.log("Transfer tx:", transferHash);

    console.log(`Setting primary name for ${to}: ${fullName}`);
    const reverseHash = await reverseRegistrar.write.setNameForAddr([
      to,
      to,
      PUBLIC_RESOLVER,
      fullName,
    ]);
    console.log("Reverse tx:", reverseHash);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
