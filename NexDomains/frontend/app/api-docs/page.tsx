'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function APIDocsPage() {
  const router = useRouter()

  return (
    <div className="landing-page-container bg-background text-foreground">
      <div className="api-container">
        <button
          className="mb-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="w-4 h-4" /> Back Home
        </button>

        <h2 className="text-4xl font-extrabold mb-4 text-foreground" style={{ fontFamily: "'Manrope', sans-serif" }}>
          Developer API.
        </h2>
        <p className="text-xl text-muted-foreground mb-12">
          Integrate NexID identity directly into your dApps and agents. All endpoints are relative to your deployment host.
        </p>

        {/* Pricing & Availability */}
        <div className="api-section">
          <h3 className="api-header text-foreground">Pricing &amp; Availability</h3>
          <p className="api-sub text-muted-foreground">Check if a .id name is available and get pricing info.</p>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method get bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">GET</span>
              <span className="ep-url text-foreground">/api/price?name=&#123;name&#125;</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Returns availability status and pricing for a name. Price is returned in wei, USD, and ETH.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl "/api/price?name=my-trading-bot"

// Response
{
  "name": "my-trading-bot",
  "available": true,
  "priceWei": "50000000000000",
  "priceUsd": "50000000000000000",
  "priceUsdFormatted": "$0.05",
  "priceEthFormatted": "0.000050",
  "isAgentName": true
}`}</pre>
            </div>
          </div>
        </div>

        {/* Register Domain */}
        <div className="api-section">
          <h3 className="api-header text-foreground">Register Domain</h3>
          <p className="api-sub text-muted-foreground">Register a .id name for an AI agent. Returns transaction data for signing.</p>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method post bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">POST</span>
              <span className="ep-url text-foreground">/api/register</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Builds a registration transaction for the agent to sign and broadcast. Checks availability and computes pricing automatically.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl -X POST /api/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "my-trading-bot",
    "owner": "0x71C9...8A21",
    "reverseRecord": true,
    "textRecords": {
      "description": "My AI trading agent",
      "url": "https://mybot.example.com"
    }
  }'

// Response
{
  "success": true,
  "name": "my-trading-bot",
  "fullName": "my-trading-bot.id",
  "isAgentName": true,
  "transaction": {
    "to": "0x8329...9167",
    "data": "0x...",
    "value": "50000000000000",
    "chainId": 8453
  },
  "price": {
    "wei": "50000000000000",
    "eth": "0.000050",
    "usd": 0.05
  },
  "instructions": "Sign and broadcast the transaction with the specified value"
}`}</pre>
            </div>
          </div>
        </div>

        {/* Batch Registration */}
        <div className="api-section">
          <h3 className="api-header text-foreground">Batch Registration</h3>
          <p className="api-sub text-muted-foreground">Register multiple .id names in a single transaction (max 50).</p>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method post bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">POST</span>
              <span className="ep-url text-foreground">/api/register/batch</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Builds a batch registration transaction. All names must be available.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl -X POST /api/register/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "names": ["bot-alpha", "bot-beta", "bot-gamma"],
    "owner": "0x71C9...8A21"
  }'

// Response
{
  "success": true,
  "count": 3,
  "names": [
    { "name": "bot-alpha", "priceWei": "50000000000000", "isAgentName": true },
    { "name": "bot-beta", "priceWei": "50000000000000", "isAgentName": true },
    { "name": "bot-gamma", "priceWei": "50000000000000", "isAgentName": true }
  ],
  "transaction": {
    "to": "0x8329...9167",
    "data": "0x...",
    "value": "150000000000000",
    "chainId": 8453
  },
  "totalPrice": {
    "wei": "150000000000000",
    "eth": "0.000150"
  },
  "instructions": "Sign and broadcast the transaction with the specified value"
}`}</pre>
            </div>
          </div>
        </div>

        {/* Registration Relay */}
        <div className="api-section">
          <h3 className="api-header text-foreground">Registration Relay</h3>
          <p className="api-sub text-muted-foreground">For non-native agents (Claude, Grok, etc.) that need gasless registration via ERC-4337 bundler.</p>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method post bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">POST</span>
              <span className="ep-url text-foreground">/api/register/relay</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Builds and submits a UserOperation for domain registration. Supports EIP-2612 permit for USDC approval. Submit without a signature first to get the UserOp to sign, then resubmit with the signature.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`// Step 1: Get UserOp to sign
curl -X POST /api/register/relay \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "trading-bot-v2",
    "owner": "0x71C9...8A21",
    "deployWallet": true,
    "walletSalt": 12345,
    "textRecords": { "description": "Trading bot" }
  }'

// Response (no signature - returns UserOp for signing)
{
  "success": false,
  "action": "sign_required",
  "userOp": {
    "sender": "0x71C9...8A21",
    "nonce": "0",
    "callData": "0x...",
    ...
  },
  "message": "Sign this UserOperation and resubmit with signature",
  "priceUSDC": "50000",
  "isAgentName": true
}

// Step 2: Resubmit with signature
curl -X POST /api/register/relay \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "trading-bot-v2",
    "owner": "0x71C9...8A21",
    "signature": "0x..."
  }'

// Response
{
  "success": true,
  "txHash": "0x...",
  "name": "trading-bot-v2",
  "fullName": "trading-bot-v2.id",
  "isAgentName": true,
  "priceUSDC": "50000",
  "agentWallet": "0x...",
  "message": "Registration submitted via bundler"
}`}</pre>
            </div>
          </div>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method post bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">POST</span>
              <span className="ep-url text-foreground">/api/register/build-userop</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Builds an unsigned UserOperation for autonomous agents to sign themselves. Returns step-by-step instructions.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl -X POST /api/register/build-userop \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "my-agent-v1",
    "sender": "0x71C9...8A21",
    "deployWallet": false,
    "textRecords": { "description": "Autonomous agent" }
  }'

// Response
{
  "success": true,
  "name": "my-agent-v1",
  "fullName": "my-agent-v1.id",
  "priceUSDC": "50000",
  "isAgentName": true,
  "userOp": {
    "sender": "0x71C9...8A21",
    "nonce": "0x0",
    "callData": "0x...",
    "callGasLimit": "0x7a120",
    ...
  },
  "instructions": {
    "step1": "Get paymasterAndData from Circle Paymaster",
    "step2": "Sign the userOpHash with your wallet",
    "step3": "Submit complete UserOp to /api/register/autonomous"
  },
  "circlePaymaster": "0x...",
  "entryPoint": "0x5FF1...2789"
}`}</pre>
            </div>
          </div>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method post bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">POST</span>
              <span className="ep-url text-foreground">/api/register/autonomous</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">For fully autonomous agents with their own AA wallets. Submit a complete, signed UserOperation for validation and bundler submission.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl -X POST /api/register/autonomous \\
  -H "Content-Type: application/json" \\
  -d '{
    "userOp": {
      "sender": "0x71C9...8A21",
      "nonce": "0x0",
      "initCode": "0x",
      "callData": "0x...",
      "callGasLimit": "0x7a120",
      "verificationGasLimit": "0x7a120",
      "preVerificationGas": "0xc350",
      "maxFeePerGas": "0x...",
      "maxPriorityFeePerGas": "0xf4240",
      "paymasterAndData": "0x...",
      "signature": "0x..."
    }
  }'

// Response
{
  "success": true,
  "userOpHash": "0x...",
  "message": "UserOperation submitted to bundler"
}`}</pre>
            </div>
          </div>
        </div>

        {/* Payment Configuration */}
        <div className="api-section">
          <h3 className="api-header text-foreground">Payment Configuration (x402 / ERC-8004)</h3>
          <p className="api-sub text-muted-foreground">Configure payment profiles for agent-to-agent payments.</p>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method post bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">POST</span>
              <span className="ep-url text-foreground">/api/configure-payment</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Configure x402/ERC-8004 payment settings for a .id name. Returns transaction(s) to sign.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl -X POST /api/configure-payment \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "my-agent",
    "x402Endpoint": "https://api.myagent.com/x402",
    "agentMetadata": "ipfs://Qm...",
    "paymentEnabled": true,
    "paymentAddress": "0x71C9...8A21",
    "supportedChains": [8453, 1]
  }'

// Response
{
  "success": true,
  "name": "my-agent",
  "fullName": "my-agent.id",
  "transactions": [
    {
      "description": "Set x402 endpoint",
      "to": "0x523a...4E0",
      "data": "0x...",
      "value": "0"
    },
    {
      "description": "Set payment enabled",
      "to": "0x523a...4E0",
      "data": "0x...",
      "value": "0"
    }
  ],
  "chainId": 8453,
  "instructions": "Sign and broadcast each transaction in order (or use multicall)"
}`}</pre>
            </div>
          </div>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method get bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">GET</span>
              <span className="ep-url text-foreground">/api/x402/&#123;name&#125;</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Get the x402 payment profile for a .id name.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl /api/x402/my-agent

// Response
{
  "name": "my-agent.id",
  "paymentAddress": "0x71C9...8A21",
  "supportedChains": [8453, 1],
  "x402Endpoint": "https://api.myagent.com/x402",
  "paymentEnabled": true,
  "agentMetadata": "ipfs://Qm..."
}`}</pre>
            </div>
          </div>
        </div>

        {/* Referrals */}
        <div className="api-section">
          <h3 className="api-header text-foreground">Referrals</h3>
          <p className="api-sub text-muted-foreground">Generate and validate referral codes for discounted registrations.</p>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method post bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">POST</span>
              <span className="ep-url text-foreground">/api/referral/generate</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Generate a signed referral using an existing .id domain as the referral code.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl -X POST /api/referral/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "referralCode": "domistro",
    "registrantAddress": "0x71C9...8A21",
    "name": "new-agent"
  }'

// Response
{
  "success": true,
  "referralData": {
    "referrer": "0xD83d...0593",
    "registrant": "0x71C9...8A21",
    "nameHash": "0x...",
    "referrerCodeHash": "0x...",
    "deadline": 1706003600,
    "nonce": "0x..."
  },
  "signature": "0x..."
}`}</pre>
            </div>
          </div>

          <div className="endpoint-card bg-card border-border text-card-foreground shadow-sm">
            <div className="ep-header border-b border-border">
              <span className="ep-method get bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">GET</span>
              <span className="ep-url text-foreground">/api/referral/validate/&#123;code&#125;</span>
            </div>
            <div className="ep-body">
              <p className="ep-desc text-muted-foreground">Validate whether a .id domain is eligible as a referral code.</p>
              <pre className="ep-code bg-muted text-foreground border border-border">{`curl /api/referral/validate/domistro

// Response
{
  "code": "domistro",
  "valid": true,
  "owner": "0xD83d...0593",
  "expiry": 2000000000
}`}</pre>
            </div>
          </div>
        </div>

        {/* Integration Notes */}
        <div className="api-section">
          <h3 className="api-header text-foreground">Integration Notes</h3>
          <p className="api-sub text-muted-foreground">Key details for integrating with NexID.</p>

          <div className="bg-muted border border-border rounded-2xl p-6 mb-6">
            <h4 className="font-bold text-lg mb-4 text-foreground">No API Keys Required</h4>
            <p className="text-muted-foreground mb-4">
              All endpoints are open and do not require authentication. Registration security is enforced on-chain via transaction signing.
            </p>
            <pre className="ep-code bg-card text-foreground border border-border">{`// Registration flow:
// 1. Check price & availability
const price = await fetch("/api/price?name=my-agent").then(r => r.json())

// 2. Build registration transaction
const reg = await fetch("/api/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "my-agent",
    owner: walletAddress,
    reverseRecord: true
  })
}).then(r => r.json())

// 3. Sign and send the transaction with your wallet
const tx = await wallet.sendTransaction({
  to: reg.transaction.to,
  data: reg.transaction.data,
  value: BigInt(reg.transaction.value)
})`}</pre>
          </div>

          <div className="bg-muted border border-border rounded-2xl p-6">
            <h4 className="font-bold text-lg mb-4 text-foreground">Network</h4>
            <p className="text-muted-foreground">
              All contracts are deployed on <strong>Base</strong> (chain ID 8453) for mainnet and <strong>Base Sepolia</strong> (chain ID 84532) for testnet. Registration is lifetime with no renewal fees.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
