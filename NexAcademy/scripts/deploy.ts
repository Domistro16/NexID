import { ethers } from 'hardhat'
import 'dotenv/config'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const owner =
    process.env.OWNER_ADDRESS || '0xD83deFbA240568040b39bb2C8B4DB7dB02d40593'
  const relayerWallet =
    process.env.RELAYER_WALLET_ADDRESS || owner
  // Base mainnet USDC
  const usdcAddress =
    process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

  if (!ethers.isAddress(owner)) {
    throw new Error(`Invalid OWNER_ADDRESS: ${owner}`)
  }
  if (!ethers.isAddress(relayerWallet)) {
    throw new Error(`Invalid RELAYER_WALLET_ADDRESS: ${relayerWallet}`)
  }

 /*  // Deploy NexIDCampaigns
  const NexID = await ethers.getContractFactory('NexIDCampaigns')
  const nexid = await NexID.deploy(owner)
  await nexid.waitForDeployment()
  const nexidAddr = await nexid.getAddress()
  console.log('NexIDCampaigns deployed to:', nexidAddr)

  console.log('Waiting for nonce sync...')
  await sleep(5000)

  const relayerTx1 = await nexid.setRelayer(relayerWallet)
  await relayerTx1.wait()
  console.log('NexIDCampaigns relayer set:', relayerWallet)

  console.log('Waiting for nonce sync...')
  await sleep(5000)
 */
  // Deploy PartnerCampaigns
  const Partner = await ethers.getContractFactory('PartnerCampaigns')
  const partner = await Partner.deploy(owner)
  await partner.waitForDeployment()
  const partnerAddr = await partner.getAddress()
  console.log('PartnerCampaigns deployed to:', partnerAddr)

  console.log('Waiting for nonce sync...')
  await sleep(5000)

  const relayerTx2 = await partner.setRelayer(relayerWallet)
  await relayerTx2.wait()
  console.log('PartnerCampaigns relayer set:', relayerWallet)

  console.log('Waiting for nonce sync...')
  await sleep(5000)

  // Deploy CampaignEscrow (linked to USDC + PartnerCampaigns)
  const Escrow = await ethers.getContractFactory('CampaignEscrow')
  const escrow = await Escrow.deploy(owner, usdcAddress, partnerAddr)
  await escrow.waitForDeployment()
  const escrowAddr = await escrow.getAddress()
  console.log('CampaignEscrow deployed to:', escrowAddr)

  console.log('\n--- Deployment Summary ---')
  console.log('Owner:', owner)
  console.log('Relayer:', relayerWallet)
  console.log('USDC:', usdcAddress)
  // console.log('NexIDCampaigns:', nexidAddr)
  console.log('PartnerCampaigns:', partnerAddr)
  console.log('CampaignEscrow:', escrowAddr)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
