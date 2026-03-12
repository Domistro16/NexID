import { namehash, zeroAddress } from 'viem'
import hre from 'hardhat'

async function main() {
    const { deployments, network, viem } = hre

    const { deployer, owner } = await viem.getNamedClients()
    console.log(`Deploying with owner: ${owner.address}`)

    const registry = await viem.getContract('ENSRegistry', owner)
    const tokenAddresses: any[] = [
        {
            token: 'cake',
            tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
        },
        {
            token: 'usd1',
            tokenAddress: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d',
        },
    ]

    const registrar = await viem.getContract('BaseRegistrarImplementation', owner)
    const priceOracle = await viem.getContract('TokenPriceOracle', owner)
    const reverseRegistrar = await viem.getContract('ReverseRegistrar', owner)
    const nameWrapper = await viem.getContract('NameWrapper', owner)

    console.log('Deploying ReferralVerifier...')
    const referralDeployment = await viem.deploy('ReferralVerifier', [
        owner.address,
        registrar.address,
        nameWrapper.address,
    ])
    console.log(`ReferralVerifier deployed at: ${referralDeployment.address}`)

    console.log('Deploying ETHRegistrarController...')
    const controllerDeployment = await viem.deploy('ETHRegistrarController', [
        registrar.address,
        priceOracle.address,
        60n,
        86400n,
        reverseRegistrar.address,
        nameWrapper.address,
        registry.address,
        referralDeployment.address,
    ])
    console.log(`ETHRegistrarController deployed at: ${controllerDeployment.address}`)


    const controller = await viem.getContract('ETHRegistrarController')
    const refferal = await viem.getContract('ReferralVerifier')

    if (owner.address !== deployer.address) {
        const hash = await controller.write.transferOwnership([owner.address])
        console.log(
            `Transferring ownership of ETHRegistrarController to ${owner.address} (tx: ${hash})...`,
        )
        await viem.waitForTransactionSuccess(hash)
    }

    for (const token of tokenAddresses) {
        const hash = await controller.write.setToken([token, token.tokenAddress])
        console.log(`Adding ${token.token} to ETHRegistrarController`)
        await viem.waitForTransactionSuccess(hash)
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.name === 'mainnet') return

    const backendHash = await controller.write.setBackend([owner.address])
    console.log(`Adding backend (tx: ${backendHash})...`)
    await viem.waitForTransactionSuccess(backendHash)

    const nameWrapperSetControllerHash = await nameWrapper.write.setController([
        controller.address,
        true,
    ])
    console.log(
        `Adding ETHRegistrarController as a controller of NameWrapper (tx: ${nameWrapperSetControllerHash})...`,
    )
    await viem.waitForTransactionSuccess(nameWrapperSetControllerHash)

    const reverseRegistrarSetControllerHash =
        await reverseRegistrar.write.setController([controller.address, true])
    console.log(
        `Adding ETHRegistrarController as a controller of ReverseRegistrar (tx: ${reverseRegistrarSetControllerHash})...`,
    )
    await viem.waitForTransactionSuccess(reverseRegistrarSetControllerHash)

    const artifact = await deployments.getArtifact('IETHRegistrarController')
    // Calculate interface ID manually
    const interfaceId = '0x00000000' // You may need to calculate this properly

    const resolver = await registry.read.resolver([namehash('id')])
    if (resolver === zeroAddress) {
        console.log(
            `No resolver set for .id; not setting interface for id Registrar Controller`,
        )
        return
    }

    const ethOwnedResolver = await viem.getContract('OwnedResolver')
    const setInterfaceHash = await ethOwnedResolver.write.setInterface([
        namehash('id'),
        interfaceId,
        controller.address,
    ])
    console.log(
        `Setting ETHRegistrarController interface ID ${interfaceId} on .id resolver (tx: ${setInterfaceHash})...`,
    )
    await viem.waitForTransactionSuccess(setInterfaceHash)

    console.log('Deployment complete!')
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
