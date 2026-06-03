import hre from "hardhat";

const { ethers, network } = hre;

const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
] as const;

const recipientAbi = [
  "function protocolTreasury() view returns (address)",
  "function rewardsPool() view returns (address)",
  "function securityPool() view returns (address)"
] as const;

const rewardAuthorizationTypes = {
  RewardAuthorization: [
    { name: "account", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "idNameHash", type: "bytes32" },
    { name: "authorizationId", type: "bytes32" },
    { name: "action", type: "uint8" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalAddress(name: string) {
  const value = process.env[name];
  return value && ethers.isAddress(value) ? ethers.getAddress(value) : null;
}

function normalizePrivateKey(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is required`);
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) throw new Error(`${name} must be a 32-byte private key.`);
  return normalized;
}

function collateralEnvName() {
  if (network.name === "baseSepolia") return "USDC_BASE_SEPOLIA";
  if (network.name === "base") return "USDC_BASE_MAINNET";
  return "EDGE_REWARD_TOKEN_ADDRESS";
}

async function recipientsFor(label: string, address: string | null) {
  if (!address) return { label, address: null, status: "missing" };
  const contract = await ethers.getContractAt(recipientAbi, address);
  return {
    label,
    address,
    protocolTreasury: await contract.protocolTreasury(),
    rewardsPool: await contract.rewardsPool(),
    securityPool: await contract.securityPool()
  };
}

async function main() {
  const distributorAddress = ethers.getAddress(required("EDGE_REWARD_DISTRIBUTOR_ADDRESS"));
  const expectedRewardToken = ethers.getAddress(required(collateralEnvName()));
  const expectedAuthorizer = ethers.getAddress(required("EDGE_REWARD_AUTHORIZER_ADDRESS"));
  const authorizerWallet = new ethers.Wallet(normalizePrivateKey("EDGE_REWARD_AUTHORIZER_PRIVATE_KEY", process.env.EDGE_REWARD_AUTHORIZER_PRIVATE_KEY), ethers.provider);
  if (authorizerWallet.address !== expectedAuthorizer) {
    throw new Error("EDGE_REWARD_AUTHORIZER_PRIVATE_KEY does not match EDGE_REWARD_AUTHORIZER_ADDRESS.");
  }

  const distributor = await ethers.getContractAt("EdgeRewardDistributor", distributorAddress);
  const rewardToken = ethers.getAddress(await distributor.rewardToken());
  const token = await ethers.getContractAt(erc20Abi, rewardToken);
  const [deployer] = await ethers.getSigners();
  const [symbol, decimals, balance, deployerBalance, authorizerRole, pauserRole] = await Promise.all([
    token.symbol().catch(() => "TOKEN"),
    token.decimals().catch(() => 6),
    token.balanceOf(distributorAddress),
    token.balanceOf(deployer.address),
    distributor.AUTHORIZER_ROLE(),
    distributor.PAUSER_ROLE()
  ]);
  const [authorizerHasRole, paused] = await Promise.all([
    distributor.hasRole(authorizerRole, expectedAuthorizer),
    distributor.paused()
  ]);
  const [feeRouterRecipients, stakeVaultRecipients] = await Promise.all([
    recipientsFor("FeeRouter", optionalAddress("NATIVE_FEE_ROUTER_ADDRESS")),
    recipientsFor("LaunchStakeVault", optionalAddress("NATIVE_LAUNCH_STAKE_VAULT_ADDRESS"))
  ]);

  const checks = {
    rewardTokenMatchesEnv: rewardToken.toLowerCase() === expectedRewardToken.toLowerCase(),
    authorizerMatchesEnv: authorizerWallet.address.toLowerCase() === expectedAuthorizer.toLowerCase(),
    authorizerHasRole,
    distributorNotPaused: !paused,
    feeRouterRewardsRecipientSet: "rewardsPool" in feeRouterRecipients
      ? String(feeRouterRecipients.rewardsPool).toLowerCase() === distributorAddress.toLowerCase()
      : false,
    stakeVaultRewardsRecipientSet: "rewardsPool" in stakeVaultRecipients
      ? String(stakeVaultRecipients.rewardsPool).toLowerCase() === distributorAddress.toLowerCase()
      : false
  };

  let staticCalls: Record<string, unknown> = {
    skipped: true,
    reason: "Distributor has no reward token balance. Fund it with at least 1 atomic unit to simulate claim/spend transfers."
  };

  if (balance > BigInt(0)) {
    const amount = BigInt(1);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60);
    const idNameHash = ethers.namehash("verify.id");
    const claimAuthorization = {
      account: deployer.address,
      recipient: deployer.address,
      amount,
      idNameHash,
      authorizationId: ethers.keccak256(ethers.toUtf8Bytes(`verify:${Date.now()}:claim`)),
      action: 1,
      deadline
    };
    const spendAuthorization = {
      ...claimAuthorization,
      recipient: optionalAddress("NEXDOMAINS_RELAYER_ADDRESS") ?? deployer.address,
      authorizationId: ethers.keccak256(ethers.toUtf8Bytes(`verify:${Date.now()}:spend`)),
      action: 2
    };
    const domain = {
      name: "NexMarketsEdgeRewardDistributor",
      version: "1",
      chainId: network.config.chainId,
      verifyingContract: distributorAddress
    };
    const claimSignature = await authorizerWallet.signTypedData(domain, rewardAuthorizationTypes, claimAuthorization);
    const spendSignature = await authorizerWallet.signTypedData(domain, rewardAuthorizationTypes, spendAuthorization);

    await distributor.claim.staticCall(claimAuthorization, claimSignature);
    await distributor.spendForIdMint.staticCall(spendAuthorization, spendSignature);
    staticCalls = {
      skipped: false,
      amountAtomic: amount.toString(),
      claimStaticCall: "ok",
      spendForIdMintStaticCall: "ok"
    };
  }

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.config.chainId,
    distributor: distributorAddress,
    rewardToken,
    token: {
      symbol,
      decimals: Number(decimals),
      distributorBalanceAtomic: balance.toString(),
      deployerBalanceAtomic: deployerBalance.toString()
    },
    expectedAuthorizer,
    roles: {
      authorizerRole,
      pauserRole,
      authorizerHasRole
    },
    recipients: [feeRouterRecipients, stakeVaultRecipients],
    checks,
    staticCalls
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
