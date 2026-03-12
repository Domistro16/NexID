import type { Address } from 'viem'

/**
 * Wait for the nonce to propagate on L2 RPCs (Base, Base Sepolia, etc.)
 *
 * After a transaction is confirmed, load-balanced RPC nodes may still return
 * a stale nonce. This causes the next transaction to fail with
 * "nonce too low" / NONCE_EXPIRED. This helper polls until the RPC reflects
 * the updated nonce.
 *
 * Usage:
 *   const waitNonce = createNonceWaiter(viem)
 *   const hash = await contract.write.someMethod([...])
 *   await waitNonce(hash)
 *   // safe to send the next transaction
 */
export function createNonceWaiter(viem: any) {
    let publicClient: any
    let senderAddress: Address

    const init = async () => {
        if (publicClient) return
        publicClient = await viem.getPublicClient()
        const { deployer } = await viem.getNamedClients()
        senderAddress = deployer.address as Address
    }

    return async (txHash: `0x${string}`) => {
        await init()
        await viem.waitForTransactionSuccess(txHash)
        const tx = await publicClient.getTransaction({ hash: txHash })
        const expectedNextNonce = BigInt(tx.nonce) + 1n

        for (let i = 0; i < 15; i++) {
            const currentNonce = BigInt(
                await publicClient.getTransactionCount({
                    address: senderAddress,
                }),
            )
            if (currentNonce >= expectedNextNonce) return
            console.log(
                `Waiting for nonce to propagate (current: ${currentNonce}, expected: ${expectedNextNonce}, attempt ${i + 1})...`,
            )
            await new Promise((resolve) => setTimeout(resolve, 2000))
        }
    }
}
