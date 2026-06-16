import hre from "hardhat";
import { nexMarketsChainIdForNetwork, nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

const SUPPORTED_NATIVE_MARKET_TEMPLATES = [
  "token_price_threshold",
  "token_basket_race",
  "official_announcement",
  "sports_result",
  "sports_transfer",
  "chart_rank",
  "award_outcome",
  "public_release",
  "custom_objective"
] as const;

function configuredFactoryAddress() {
  const chainId = nexMarketsChainIdForNetwork(hre.network.name);
  return nexMarketsContracts(chainId)?.marketFactory || process.env.NATIVE_MARKET_FACTORY_ADDRESS || process.env.NEXT_PUBLIC_NATIVE_MARKET_FACTORY_ADDRESS;
}

async function main() {
  const factoryAddress = configuredFactoryAddress();
  if (!factoryAddress) throw new Error("Native market factory address is required in config/nexmarkets-contracts.ts.");
  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractAt("MarketFactory", factoryAddress);
  const templateAdminRole = await factory.TEMPLATE_ADMIN_ROLE();
  const hasRole = await factory.hasRole(templateAdminRole, deployer.address);
  if (!hasRole) {
    throw new Error(`Signer ${deployer.address} does not have TEMPLATE_ADMIN_ROLE on factory ${factoryAddress}.`);
  }

  const results = [];
  for (const template of SUPPORTED_NATIVE_MARKET_TEMPLATES) {
    const templateId = ethers.id(template);
    const before = await factory.allowedTemplates(templateId);
    let txHash: string | null = null;
    if (!before) {
      const tx = await factory.setTemplateAllowed(templateId, true);
      txHash = tx.hash;
      await tx.wait();
    }
    const after = await factory.allowedTemplates(templateId);
    results.push({ template, templateId, before, after, txHash });
  }

  console.log(JSON.stringify({
    network: hre.network.name,
    factory: factoryAddress,
    signer: deployer.address,
    templates: results
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
