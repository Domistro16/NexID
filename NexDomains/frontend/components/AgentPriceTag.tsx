'use client'

interface AgentPriceTagProps {
    name: string
    priceUsd: string
    priceEth: string
    isAgentName: boolean
}

export const AgentPriceTag = ({
    name,
    priceUsd,
    priceEth,
    isAgentName
}: AgentPriceTagProps) => {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-foreground">
                    ${priceUsd}
                </span>
                <span className="text-sm text-muted-foreground">
                    ({priceEth} USDC)
                </span>
                {isAgentName && (
                    <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                        🤖 Agent Price
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
                    Lifetime
                </span>
                <span className="text-xs text-muted-foreground">
                    One-time payment, no renewals
                </span>
            </div>

            {isAgentName && (
                <p className="text-xs text-muted-foreground mt-1">
                    This name qualifies for agent pricing because it&apos;s 10+ characters
                    and matches agent naming patterns.
                </p>
            )}
        </div>
    )
}
