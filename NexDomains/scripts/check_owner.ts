
import { formatEther } from 'viem'
import hre from 'hardhat'

async function main() {
    const { viem } = hre
    const [deployer] = await viem.getWalletClients()
    const publicClient = await viem.getPublicClient()

    console.log('Account:', deployer.account.address)
    const balance = await publicClient.getBalance({ address: deployer.account.address })
    console.log('Balance:', formatEther(balance))

    const registrarAddress = '0x6e17358262D66d109E3a069d204367ABF1Ac76F4'
    console.log('Checking registrar at:', registrarAddress)

    try {
        const registrar = await viem.getContractAt('BaseRegistrarImplementation', registrarAddress)
        const owner = await registrar.read.owner()
        console.log('Registrar Owner:', owner)
    } catch (e) {
        console.error('Error fetching owner:', e)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
