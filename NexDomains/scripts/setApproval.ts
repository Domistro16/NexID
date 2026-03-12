import hre from 'hardhat'
async function main() {
  const { viem } = hre
  const { deployer } = await viem.getNamedClients()

  // ─── CONFIGURE THESE ────────────────────────────────────────────────────────

  const registry = await viem.getContract('ENSRegistry', deployer)
  const controller = await viem.getContract('ETHRegistrarController', deployer)
  const nameWrapper = await viem.getContract('NameWrapper', deployer)

  const hash = await nameWrapper.write.setApprovalForAll([
    '0xd83defba240568040b39bb2c8b4db7db02d40593',
    true,
  ])
  console.log(hash)
}

main().catch((error) => console.log(error))
