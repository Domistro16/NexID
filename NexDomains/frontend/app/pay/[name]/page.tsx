'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { usePaymentProfile } from '../../../hooks/usePaymentProfile';
import { constants } from '../../../constant';
import { Loader2, CheckCircle, AlertCircle, Copy, ExternalLink, Wallet } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { base } from 'wagmi/chains';

// ERC20 ABI for transfer
const erc20Abi = [
    {
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        name: 'transfer',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

export default function PaymentPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const name = params.name as string;
    const urlAmount = searchParams.get('amount') || '';
    const client = searchParams.get('client');
    const due = searchParams.get('due');
    const invoiceId = searchParams.get('invoiceId');

    const { address, isConnected, chainId } = useAccount();
    const activeChainId = useChainId();
    const { switchChain } = useSwitchChain();
    const { login } = usePrivy();
    const { profile, isLoading: isProfileLoading, error: profileError } = usePaymentProfile(name);

    const [amount, setAmount] = useState(urlAmount);
    const [isSuccess, setIsSuccess] = useState(false);

    const { writeContractAsync: transfer, isPending: isTransferring, data: txHash } = useWriteContract();

    const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
        hash: txHash,
    });

    useEffect(() => {
        if (isTxSuccess) {
            setIsSuccess(true);
        }
    }, [isTxSuccess]);

    // Read USDC balance
    const { data: balanceData } = useReadContract({
        address: constants.USDC,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });

    const handlePay = async () => {
        if (!isConnected) {
            login();
            return;
        }

        if (chainId !== base.id) {
            switchChain({ chainId: base.id });
            return;
        }

        if (!profile?.paymentAddress || !amount) return;

        try {
            // Assuming USDC has 6 decimals on Base (and most chains)
            const amountBigInt = parseUnits(amount, 6);

            await transfer({
                abi: erc20Abi,
                address: constants.USDC,
                functionName: 'transfer',
                args: [profile.paymentAddress, amountBigInt],
            });
        } catch (error) {
            console.error('Payment failed:', error);
        }
    };

    if (isProfileLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            </div>
        );
    }

    if (profileError || !profile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] text-white p-4">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h1 className="text-2xl font-bold mb-2">Profile Not Found</h1>
                <p className="text-gray-400">Could not load payment profile for {name}.id</p>
            </div>
        );
    }

    const cleanName = name.replace('.id', '');
    const displayName = `${cleanName}.id`;

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#1a1b1f] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-8 text-center border-b border-white/10 bg-[#1a1b1f]">
                    <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-600 rounded-full mx-auto flex items-center justify-center text-4xl font-bold mb-6 shadow-lg text-white">
                        {cleanName[0].toUpperCase()}
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Pay {displayName}</h1>
                    <div className="flex items-center justify-center gap-2">
                        <p className="text-gray-400 text-sm font-mono bg-black/30 py-1.5 px-4 rounded-full">
                            {profile.paymentAddress.slice(0, 6)}...{profile.paymentAddress.slice(-4)}
                        </p>
                        <button
                            onClick={() => navigator.clipboard.writeText(profile.paymentAddress)}
                            className="text-gray-500 hover:text-white transition-colors"
                        >
                            <Copy size={16} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">
                    {isSuccess ? (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle size={40} />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Payment Sent!</h2>
                            <p className="text-gray-400 mb-8">
                                You successfully sent {amount} USDC to {displayName}
                            </p>
                            <div className="bg-black/30 rounded-xl p-4 flex items-center justify-between text-sm border border-white/5">
                                <span className="text-gray-500">Transaction Hash</span>
                                <a
                                    href={`https://basescan.org/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-amber-500 hover:text-amber-400 font-medium"
                                >
                                    {txHash?.slice(0, 6)}...{txHash?.slice(-4)}
                                    <ExternalLink size={14} />
                                </a>
                            </div>
                            <button
                                onClick={() => setIsSuccess(false)}
                                className="w-full mt-6 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all"
                            >
                                Send Another Payment
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Payment Details */}
                            {client && (
                                <div className="bg-black/30 rounded-xl p-5 space-y-3 border border-white/5">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Client</span>
                                        <span className="text-white font-medium">{client}</span>
                                    </div>
                                    {due && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Due Date</span>
                                            <span className="text-white font-medium">{due}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Amount Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2 ml-1">
                                    Amount (USDC)
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-4 text-3xl font-medium text-white placeholder-gray-700 focus:outline-none focus:border-amber-500 transition-colors"
                                    // readOnly={!!urlAmount && !invoiceId} // Allowing edit for flexibility
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                                        <img src="/usdc.png" alt="USDC" className="w-6 h-6" onError={(e) => e.currentTarget.style.display = 'none'} />
                                        <span className="text-gray-400 font-medium">USDC</span>
                                    </div>
                                </div>
                                {isConnected && balanceData !== undefined && (
                                    <p className="text-xs text-gray-500 mt-2 text-right mr-1">
                                        Balance: {formatUnits(balanceData, 6)} USDC
                                    </p>
                                )}
                            </div>

                            {/* Action Button */}
                            {isConnected ? (
                                <button
                                    onClick={handlePay}
                                    disabled={!amount || isTransferring || isTxLoading || parseFloat(amount) <= 0}
                                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 text-lg shadow-lg shadow-amber-500/20"
                                >
                                    {isTransferring || isTxLoading ? (
                                        <>
                                            <Loader2 className="animate-spin" size={20} />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            Pay {amount ? `${amount} USDC` : ''}
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={login}
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-4 rounded-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 text-lg shadow-lg shadow-amber-500/20"
                                >
                                    <Wallet size={20} />
                                    Connect Wallet to Pay
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-[#1a1b1f] p-6 text-center border-t border-white/10">
                    <a href="https://names.nexid.fun" className="text-gray-600 hover:text-amber-500 text-sm font-medium transition-colors flex items-center justify-center gap-2">
                        Powered by NexID <ExternalLink size={12} />
                    </a>
                </div>
            </div>
        </div>
    );
}
