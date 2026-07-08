# NexMind ACP Market Launch

NexMind exposes an ACP provider offering for agent callers:

`Structure and launch a prediction market from a thesis`

The ACP path is an adapter over the existing NexMarkets agent launch pipeline. It does not introduce a second market creation path and it does not make NexMind the creator of record.

## Endpoints

- `GET /api/acp/provider`
- `POST /api/acp/jobs`
- `GET /api/acp/jobs/:id`
- `POST /api/acp/jobs/:id/confirm`
- `POST /api/acp/jobs/:id/settlement`

## Flow

1. The requester posts raw thesis text, its wallet address, optional Virtuals identity, optional preferred `.id`, and a confirmation mode.
2. NexMind runs the existing thesis structuring logic and returns a Resolution Card.
3. The requester controls confirmation with `confirmationMode: "manual"` or `confirmationMode: "auto"` / `autoApprove: true`.
4. Confirmation calls the existing `launchMarketForAgent` service with the requester wallet as `ownerAccount`.
5. The returned transaction payload is the standard NexMarkets market launch authorization. The requester wallet pays the $20 creator bond when it broadcasts.
6. ACP service-fee settlement is recorded separately with `POST /api/acp/jobs/:id/settlement`; this tracks ACP escrow revenue for NexMind and does not route market bond, creator fee, or trading fees to NexMind.

## Identity

ACP requester identity is stored on the same `AgentProfile` and `.id` record used by the direct agent-launch API. Resolution order:

1. Existing requester `AgentProfile.publicId`.
2. Existing active local `.id` for the requester wallet.
3. Preferred ACP domain if it is not already active for a different wallet.
4. A deterministic Virtuals-derived fallback with a wallet suffix.

If a mint transaction can be prepared through NexDomains, the ACP job includes it in `idAction`. The launch authorization still uses the requester wallet and never requires NexMind custody.
