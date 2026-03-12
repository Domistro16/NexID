import type { DeployFunction } from 'hardhat-deploy/types'
import { formatEther } from 'viem'
import { namehash } from 'viem/ens'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  if (!network.tags.use_root) {
    return true
  }

  const registry = await viem.getContract('ENSRegistry')

  const bri = await viem.deploy('BaseRegistrarImplementation', [
    registry.address,
    namehash('id'),
  ])
  if (!bri.newlyDeployed) return

  const hash =
    (bri as any).transactionHash ??
    (bri as any).hash ??
    (bri as any).txHash ??
    (bri as any).receipt?.transactionHash
  if (!hash) {
    console.warn(
      'No tx hash found on deploy result — check bri object with console.log(bri)',
    )
  } else {
    // Wait for mined r
    if (!bri) return
    const gasUsed = bri.receipt!.gasUsed // bigint
    const client = await viem.getPublicClient()
    const effectiveGasPrice = await client.getGasPrice() // bigint fallback

    const feeWei = Number(gasUsed) * Number(effectiveGasPrice) // bigint multiplication, exact

    console.log('gasUsed:', gasUsed.toString())
    console.log('effectiveGasPrice (wei):', effectiveGasPrice.toString())
    console.log('fee (native token):', formatEther(feeWei as any)) // human readable
    console.log('receipt object:', bri.receipt)
  }
}

func.id = 'registrar'
func.tags = ['ethregistrar', 'BaseRegistrarImplementation']
func.dependencies = ['registry', 'root']

export default func
