'use client'

import { useState } from 'react'

/**
 * Collapsible info panel explaining agent pattern matching for pricing
 */
export const AgentPatternInfo = () => {
    const [isOpen, setIsOpen] = useState(false)

    const patterns = [
        {
            category: 'Suffixes',
            examples: ['-agent', '-bot', '-ai', '-tutor', '-edu'],
            price: '$0.01-$0.02'
        },
        {
            category: 'Versions',
            examples: ['-v1', '-v42', '-20260204'],
            price: '$0.02-$0.03'
        },
        {
            category: 'UUID/Hex',
            examples: ['agent-7f3a9b2c-...'],
            price: '$0.01'
        },
        {
            category: 'Prefixes',
            examples: ['agent-', 'bot-', 'fleet-'],
            price: '$0.02-$0.03'
        },
        {
            category: 'Functional',
            examples: ['-analyzer-', '-generator-'],
            price: '$0.03-$0.05'
        },
    ]

    return (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-4 flex justify-between items-center text-left hover:bg-gray-700/30 transition-colors"
            >
                <span className="font-medium text-sm">🤖 What qualifies for agent pricing?</span>
                <span
                    className={`transform transition-transform duration-200 text-gray-400 ${isOpen ? 'rotate-180' : ''
                        }`}
                >
                    ▼
                </span>
            </button>

            {isOpen && (
                <div className="p-4 pt-0 border-t border-gray-700/50">
                    <p className="text-sm text-gray-400 mb-4">
                        Names 10+ characters matching agent patterns get $0.01-$0.10 pricing:
                    </p>

                    <div className="space-y-3">
                        {patterns.map((p) => (
                            <div key={p.category} className="flex justify-between items-start">
                                <div>
                                    <div className="font-medium text-sm text-white">{p.category}</div>
                                    <div className="text-xs text-gray-500">
                                        {p.examples.join(', ')}
                                    </div>
                                </div>
                                <span className="text-green-400 text-sm font-mono">{p.price}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                        <div className="text-sm text-yellow-400 font-medium">Examples:</div>
                        <div className="text-xs text-gray-400 mt-1 space-y-1">
                            <div>• trading-bot-v2-alpha → $0.03</div>
                            <div>• fleet-coordinator-main → $0.02</div>
                            <div>• agent-7f3a9b2c-1d4e-... → $0.01</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
