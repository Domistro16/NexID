"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, parseAbi, type Hash } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import AdminShell from "../_components/AdminShell";

type DomainClaim = {
  id: string;
  domainName: string;
  walletAddress: string;
  claimedAt: string;
  campaignId: number;
  campaignTitle: string | null;
};

type DomainClaimsResponse = {
  claims: DomainClaim[];
  reservedNames: string[];
  summary: {
    totalClaims: number;
    uniqueWallets: number;
    uniqueCampaigns: number;
  };
};

const CONTROLLER_ADDRESS = (
  process.env.NEXT_PUBLIC_AGENT_REGISTRAR_CONTROLLER_ADDRESS ||
  process.env.NEXT_PUBLIC_CONTROLLER_ADDRESS ||
  "0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494"
) as `0x${string}`;

const BATCH_SIZE = 25;

const AGENT_REGISTRAR_CONTROLLER_ABI = parseAbi([
  "function owner() view returns (address)",
  "function reserveName(string name, address owner)",
  "function reserveNamesBatch(string[] names, address[] owners)",
]);

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function shortAddress(value: string) {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function chunkClaims(items: DomainClaim[], size: number) {
  const chunks: DomainClaim[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export default function AdminDomainsPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [claims, setClaims] = useState<DomainClaim[]>([]);
  const [reservedNames, setReservedNames] = useState<string[]>([]);
  const [summary, setSummary] = useState<DomainClaimsResponse["summary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [controllerOwner, setControllerOwner] = useState<`0x${string}` | null>(null);
  const [controllerOwnerError, setControllerOwnerError] = useState<string | null>(null);
  const [reserveLoading, setReserveLoading] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [reserveMessage, setReserveMessage] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);

  useEffect(() => {
    fetch("/api/admin/domain-claims", { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch domain claims");
        }
        const data: DomainClaimsResponse = await res.json();
        setClaims(Array.isArray(data.claims) ? data.claims : []);
        setReservedNames(Array.isArray(data.reservedNames) ? data.reservedNames : []);
        setSummary(data.summary ?? null);
      })
      .catch((err) => console.error("Domain claims fetch error:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!publicClient) return;

    publicClient.readContract({
      address: CONTROLLER_ADDRESS,
      abi: AGENT_REGISTRAR_CONTROLLER_ABI,
      functionName: "owner",
    })
      .then((owner) => {
        setControllerOwner(owner as `0x${string}`);
        setControllerOwnerError(null);
      })
      .catch((err) => {
        console.error("Controller owner read error:", err);
        setControllerOwner(null);
        setControllerOwnerError("Could not read controller owner");
      });
  }, [publicClient]);

  const filteredClaims = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return claims;
    return claims.filter((claim) => {
      return (
        claim.domainName.toLowerCase().includes(query) ||
        claim.walletAddress.toLowerCase().includes(query) ||
        (claim.campaignTitle ?? "").toLowerCase().includes(query)
      );
    });
  }, [claims, search]);

  const reservedNamesText = useMemo(() => reservedNames.join("\n"), [reservedNames]);

  const canReserve =
    !!walletClient &&
    !!publicClient &&
    !!address &&
    (!controllerOwner || controllerOwner.toLowerCase() === address.toLowerCase());

  async function handleCopyReservedNames() {
    try {
      await navigator.clipboard.writeText(reservedNamesText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed", err);
    }
  }

  async function reserveClaims(items: DomainClaim[], label: string) {
    if (!walletClient || !publicClient || !address) {
      setReserveError("Connect the controller owner wallet first.");
      return;
    }
    if (controllerOwner && controllerOwner.toLowerCase() !== address.toLowerCase()) {
      setReserveError("Connected wallet is not the AgentRegistrarController owner.");
      return;
    }

    const invalidWalletClaims = items.filter((item) => !isAddress(item.walletAddress));
    if (invalidWalletClaims.length > 0) {
      setReserveError(
        `Invalid claimant wallet address for: ${invalidWalletClaims
          .map((item) => `${item.domainName}.id`)
          .join(", ")}`,
      );
      return;
    }

    const normalizedClaims = Array.from(
      items.reduce((map, item) => {
        const name = item.domainName.trim().toLowerCase();
        if (!name) return map;
        if (!map.has(name)) {
          map.set(name, { ...item, domainName: name });
        }
        return map;
      }, new Map<string, DomainClaim>()).values(),
    );

    if (normalizedClaims.length === 0) {
      setReserveError("No names available to reserve.");
      return;
    }

    const chunks = chunkClaims(normalizedClaims, BATCH_SIZE);

    setReserveLoading(true);
    setReserveError(null);
    setReserveMessage(`Preparing ${label}...`);

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const names = chunk.map((item) => item.domainName);
        const owners = chunk.map((item) => item.walletAddress as `0x${string}`);

        setReserveMessage(
          `Submitting chunk ${index + 1}/${chunks.length} (${chunk.length} name${chunk.length === 1 ? "" : "s"})...`,
        );

        const hash = await walletClient.writeContract({
          address: CONTROLLER_ADDRESS,
          abi: AGENT_REGISTRAR_CONTROLLER_ABI,
          functionName: "reserveNamesBatch",
          args: [names, owners],
        });

        setLastTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setReserveMessage(`Reserved ${normalizedClaims.length} name${normalizedClaims.length === 1 ? "" : "s"} successfully.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reserve transaction failed";
      setReserveError(message);
      setReserveMessage(null);
    } finally {
      setReserveLoading(false);
    }
  }

  return (
    <AdminShell active="domains">
      <section className="max-w-[1600px] mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="admin-panel p-4 bg-[#0a0a0a]">
            <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-1">Reserved Names</div>
            <div className="text-2xl font-display text-white">
              {loading ? "..." : (summary?.totalClaims ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="admin-panel p-4 bg-[#0a0a0a]">
            <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-1">Unique Wallets</div>
            <div className="text-2xl font-display text-white">
              {loading ? "..." : (summary?.uniqueWallets ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="admin-panel p-4 bg-[#0a0a0a]">
            <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-1">Campaigns With Claims</div>
            <div className="text-2xl font-display text-white">
              {loading ? "..." : (summary?.uniqueCampaigns ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
          <div className="admin-panel p-5 bg-[#0a0a0a] space-y-5">
            <div>
              <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-muted">Direct Reserve Action</h3>
              <p className="mt-2 text-xs text-nexid-muted">
                This calls `reserveNamesBatch` on the SafuDomains `AgentRegistrarController` and uses each claimant wallet as the owner.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-nexid-muted">Controller</span>
                <span className="font-mono text-white">{shortAddress(CONTROLLER_ADDRESS)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-nexid-muted">Controller Owner</span>
                <span className="font-mono text-white">
                  {controllerOwner ? shortAddress(controllerOwner) : controllerOwnerError ?? "..."}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-nexid-muted">Connected Wallet</span>
                <span className="font-mono text-white">{address ? shortAddress(address) : "Not connected"}</span>
              </div>
            </div>

            <div className="rounded border border-[#222] bg-[#050505] px-3 py-2 text-xs text-nexid-muted">
              Owner mapping comes from each claim row’s `walletAddress`.
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => reserveClaims(claims, "all claimed names")}
                disabled={reserveLoading || claims.length === 0 || !canReserve}
                className="rounded bg-nexid-gold px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
              >
                {reserveLoading ? "Submitting..." : "Reserve All Claimed Names"}
              </button>
              <button
                type="button"
                onClick={() => reserveClaims(filteredClaims, "filtered names")}
                disabled={reserveLoading || filteredClaims.length === 0 || !canReserve}
                className="rounded border border-[#333] bg-[#111] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Reserve Filtered Names
              </button>
            </div>

            {!canReserve ? (
              <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {controllerOwner && address && controllerOwner.toLowerCase() !== address.toLowerCase()
                  ? "Connect the contract owner wallet before sending the reserve transaction."
                  : "Wallet client unavailable."}
              </div>
            ) : null}

            {reserveMessage ? (
              <div className="rounded border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                {reserveMessage}
              </div>
            ) : null}

            {reserveError ? (
              <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {reserveError}
              </div>
            ) : null}

            {lastTxHash ? (
              <a
                href={`https://basescan.org/tx/${lastTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-mono text-nexid-gold hover:underline"
              >
                View last tx: {String(lastTxHash).slice(0, 14)}...
              </a>
            ) : null}

            <div className="border-t border-[#1a1a1a] pt-5 space-y-4">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-muted">Name Export</h3>
                <p className="mt-2 text-xs text-nexid-muted">You can still copy the raw list if needed.</p>
              </div>

              <textarea
                readOnly
                value={reservedNamesText}
                className="min-h-[220px] w-full rounded border border-[#222] bg-[#050505] p-3 text-xs text-white outline-none"
                spellCheck={false}
              />

              <button
                type="button"
                onClick={handleCopyReservedNames}
                disabled={reservedNames.length === 0}
                className="rounded border border-[#333] bg-[#111] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {copied ? "Copied" : "Copy Names"}
              </button>
            </div>
          </div>

          <div className="admin-panel p-5 bg-[#0a0a0a] overflow-hidden">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-muted">Domain Claim Ledger</h3>
                <p className="mt-2 text-xs text-nexid-muted">Search by domain, wallet, or campaign, then reserve directly.</p>
              </div>
              <input
                type="text"
                placeholder="Search domain or wallet..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="admin-input w-full md:w-72"
              />
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-nexid-muted">Loading domain claims...</div>
              ) : filteredClaims.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-nexid-muted">
                  {claims.length === 0 ? "No domain claims yet" : "No results match your search"}
                </div>
              ) : (
                <table className="linear-table">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Wallet</th>
                      <th>Campaign</th>
                      <th className="text-right">Claimed</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClaims.map((claim) => (
                      <tr key={claim.id}>
                        <td className="font-mono text-nexid-gold">{claim.domainName}.id</td>
                        <td className="font-mono text-white/80">{shortAddress(claim.walletAddress)}</td>
                        <td className="text-white">{claim.campaignTitle ?? `Campaign #${claim.campaignId}`}</td>
                        <td className="text-right font-mono text-nexid-muted">{formatDateTime(claim.claimedAt)}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => reserveClaims([claim], `${claim.domainName}.id`)}
                            disabled={reserveLoading || !canReserve}
                            className="rounded border border-[#333] bg-[#111] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            Reserve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
