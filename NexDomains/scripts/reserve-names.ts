import hre from "hardhat";
import { Address } from "viem";

const CONTROLLER: Address = "0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494";
const RESERVED_OWNER: Address =
  "0xd83defba240568040b39bb2c8b4db7db02d40593";

const NAMES = [
  "alice"
].map((n) => n.toLowerCase());

async function main() {
  const { viem } = hre;
  const [walletClient] = await viem.getWalletClients();

  console.log("Using signer:", walletClient.account.address);

  const controller = await viem.getContractAt(
    "AgentRegistrarController",
    CONTROLLER,
  );
  const owners: Address[] = NAMES.map(() => RESERVED_OWNER);

  const hash = await controller.write.reserveNamesBatch([NAMES, owners]);
  console.log("Tx:", hash);
  console.log("Reserved", NAMES.length, "names");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
