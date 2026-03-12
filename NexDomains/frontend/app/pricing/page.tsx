'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'

export default function PricingPage() {
  const router = useRouter()

  return (
    <div className="landing-page-container">
      <div className="max-w-5xl mx-auto">
        <button
          className="mb-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="w-4 h-4" /> Back Home
        </button>

        <h2 className="text-4xl font-extrabold text-center mb-4" style={{ fontFamily: "'Manrope', sans-serif" }}>
          Transparent Pricing.
        </h2>
        <p className="text-center text-muted-foreground mb-12">
          One-time minting fee. No renewal costs. Lifetime ownership.
        </p>

        <div className="pricing-split-container">
          {/* Agent Pricing */}
          <div className="pricing-card agent">
            <div className="pricing-header">AI Agents</div>
            <div className="pricing-sub">For autonomous on-chain actors.</div>

            <div className="pricing-price-box">
              <div className="pp-val">$0.01 - 0.10</div>
              <div className="pp-label">Variable Gas-Optimized Rate</div>
            </div>

            <div className="pricing-example">
              <div className="pricing-example-label">Example</div>
              <div className="pricing-example-name">the-defi-agent.id</div>
            </div>

            <div className="pricing-list">
              <div className="pl-item">
                <span className="pl-name">API Minting Access</span>
                <span className="pl-price"><Check className="w-4 h-4 text-green-500" /></span>
              </div>
              <div className="pl-item">
                <span className="pl-name">x402 Standard</span>
                <span className="pl-price"><Check className="w-4 h-4 text-green-500" /></span>
              </div>
              <div className="pl-item">
                <span className="pl-name">Rate Limit</span>
                <span className="pl-price">50/min</span>
              </div>
              <div className="pl-item">
                <span className="pl-name">Transferable</span>
                <span className="pl-price text-gray-400">Restricted</span>
              </div>
            </div>
          </div>

          {/* Human Pricing */}
          <div className="pricing-card human">
            <div className="pricing-header pricing-header-human">Humans</div>
            <div className="pricing-sub pricing-sub-human">For personal web3 identity.</div>

            <div className="pricing-list mt-4">
              <div className="pl-item pricing-human-item">
                <span className="pl-name pl-name-muted">
                  1 Character <span className="rarity-badge gold">Ultra Rare</span>
                </span>
                <span className="pl-price pl-price-accent">$2,000</span>
              </div>
              <div className="pl-item pricing-human-item">
                <span className="pl-name pl-name-muted">
                  2 Characters <span className="rarity-badge purple">Very Rare</span>
                </span>
                <span className="pl-price pl-price-accent">$1,000</span>
              </div>
              <div className="pl-item pricing-human-item">
                <span className="pl-name pl-name-muted">
                  3 Characters <span className="rarity-badge blue">Rare</span>
                </span>
                <span className="pl-price pl-price-solid">$200</span>
              </div>
              <div className="pl-item pricing-human-item">
                <span className="pl-name pl-name-muted">4 Characters</span>
                <span className="pl-price pl-price-solid">$40</span>
              </div>
              <div className="pl-item pricing-human-item">
                <span className="pl-name pl-name-muted">5 Characters</span>
                <span className="pl-price pl-price-solid">$10</span>
              </div>
              <div className="pl-item pricing-human-item">
                <span className="pl-name pl-name-muted">6-9 Characters</span>
                <span className="pl-price pl-price-solid">$5</span>
              </div>
              <div className="pl-item pricing-human-item">
                <span className="pl-name pl-name-strong">10+ Characters</span>
                <span className="pl-price pl-price-solid">$2</span>
              </div>
            </div>

            <div className="mt-auto pt-8">
              <button
                className="w-full bg-[#FFB000] text-black font-bold py-4 rounded-xl hover:bg-white transition-colors"
                onClick={() => router.push('/')}
              >
                Mint Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
