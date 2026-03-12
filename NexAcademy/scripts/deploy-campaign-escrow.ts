import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const owner =
    process.env.OWNER_ADDRESS || process.env.RELAYER_WALLET_ADDRESS;
  if (!owner || !ethers.isAddress(owner)) {
    throw new Error("Valid OWNER_ADDRESS is required.");
  }

  // USDC address — set via env or default to Base mainnet USDC
  const usdcAddress =
    process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  if (!ethers.isAddress(usdcAddress)) {
    throw new Error(`Invalid USDC_ADDRESS: ${usdcAddress}`);
  }

  // PartnerCampaigns address — set via env or deploy separately first
  const partnerCampaignsAddress =
    process.env.PARTNER_CAMPAIGNS_ADDRESS || ethers.ZeroAddress;

  const CampaignEscrow = await ethers.getContractFactory("CampaignEscrow");
  const escrow = await CampaignEscrow.deploy(
    owner,
    usdcAddress,
    partnerCampaignsAddress
  );
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();

  console.log("\n--- Escrow Deployment Summary ---");
  console.log("CampaignEscrow deployed:", address);
  console.log("Owner:", owner);
  console.log("USDC:", usdcAddress);
  console.log(
    "PartnerCampaigns:",
    partnerCampaignsAddress === ethers.ZeroAddress
      ? "(not linked — set later with setPartnerCampaigns)"
      : partnerCampaignsAddress
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
