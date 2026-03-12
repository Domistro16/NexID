import type { DeployFunction } from 'hardhat-deploy/types'

const func: DeployFunction = async function (hre) {
  const { viem } = hre

  await viem.deploy('ExtendedDNSResolver', [])
}

func.tags = ['resolvers', 'ExtendedDNSResolver']

export default func
