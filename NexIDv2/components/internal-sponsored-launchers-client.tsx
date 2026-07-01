"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, parseAbi, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { userFacingTransactionError } from "@/lib/client/transaction-error";

type SponsoredLauncherRow = {
  wallet: string;
  allowance: number;
  used: number;
  remaining: number;
};

type SponsoredLauncherResult = {
  chainId: number;
  network: string;
  factoryAddress: string;
  rpcConfigured: boolean;
  adminAddress: string | null;
  adminHasRole: boolean | null;
  txHash?: string;
  blockNumber?: string;
  rows?: SponsoredLauncherRow[];
};

const sponsoredFactoryWriteAbi = parseAbi([
  "function setSponsoredLaunchAllowances(address[] creators, uint256[] allowances)"
]);

function statusText(result: SponsoredLauncherResult | null) {
  if (!result) return "Not checked";
  if (!result.rpcConfigured) return "RPC missing";
  if (!result.adminAddress) return "Connect admin wallet";
  if (result.adminHasRole === false) return "Signer not authorized";
  if (result.adminHasRole === true) return "Ready";
  return "Read only";
}

function statusTone(result: SponsoredLauncherResult | null) {
  if (!result) return "warn";
  if (!result.rpcConfigured || !result.adminAddress || result.adminHasRole === false) return "bad";
  if (result.adminHasRole === true) return "good";
  return "warn";
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error || "Sponsored launcher request failed.";
    throw new Error(message);
  }
  return body as SponsoredLauncherResult;
}

function parseWalletInput(input: string) {
  const parts = input
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("Enter at least one sponsored launcher wallet.");
  if (parts.length > 50) throw new Error("Sponsored launcher batches are limited to 50 wallets at a time.");

  const seen = new Set<string>();
  const wallets: Address[] = [];
  for (const part of parts) {
    if (!isAddress(part)) throw new Error(`Invalid wallet address: ${part}`);
    const wallet = getAddress(part) as Address;
    const key = wallet.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      wallets.push(wallet);
    }
  }
  return wallets;
}

function readUrl(chainId: number, wallets: string, adminAddress?: string) {
  const params = new URLSearchParams({ chainId: String(chainId) });
  if (wallets.trim()) params.set("wallets", wallets);
  if (adminAddress) params.set("adminAddress", adminAddress);
  return `/api/internal/sponsored-launchers?${params.toString()}`;
}

export function InternalSponsoredLaunchersClient({
  defaultChainId,
  defaultAllowance
}: {
  defaultChainId: number;
  defaultAllowance: number;
}) {
  const [chainId, setChainId] = useState(defaultChainId);
  const [allowance, setAllowance] = useState(defaultAllowance);
  const [wallets, setWallets] = useState("");
  const [result, setResult] = useState<SponsoredLauncherResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"check" | "set" | null>(null);
  const { address } = useAccount();
  const activeChainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const rows = result?.rows ?? [];
  const totalRemaining = useMemo(() => rows.reduce((sum, row) => sum + row.remaining, 0), [rows]);

  async function loadSummary() {
    setError("");
    const response = await fetch(readUrl(chainId, "", address), { cache: "no-store" });
    setResult(await readJson(response));
  }

  useEffect(() => {
    void loadSummary().catch((err) => setError(err instanceof Error ? err.message : "Could not load sponsored launcher status."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, address]);

  async function checkWallets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading("check");
    try {
      const response = await fetch(readUrl(chainId, wallets, address), { cache: "no-store" });
      setResult(await readJson(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read sponsored launcher allowances.");
    } finally {
      setLoading(null);
    }
  }

  async function setAllowances() {
    setError("");
    setMessage("");
    setLoading("set");
    try {
      if (!address) throw new Error("Connect the admin wallet before setting allowances.");
      if (!Number.isInteger(allowance) || allowance < 0 || allowance > 1000) {
        throw new Error("Sponsored launch allowance must be an integer between 0 and 1000.");
      }
      const factoryAddress = result?.factoryAddress;
      if (!factoryAddress || !isAddress(factoryAddress)) throw new Error("Sponsored market factory is not configured.");
      const parsedWallets = parseWalletInput(wallets);
      const belowUsed = rows.find((row) => allowance < row.used);
      if (belowUsed) throw new Error(`Allowance ${allowance} is below ${belowUsed.wallet}'s used count of ${belowUsed.used}.`);
      if (result?.adminHasRole === false) {
        throw new Error(`${address} does not have DEFAULT_ADMIN_ROLE on the sponsored factory.`);
      }
      if (activeChainId !== chainId) {
        setMessage("Switching wallet network.");
        await switchChainAsync({ chainId });
      }
      if (!publicClient) throw new Error("Public client is not ready for this network.");

      setMessage("Confirm the sponsored allowance update in the connected admin wallet.");
      const hash = await writeContractAsync({
        address: getAddress(factoryAddress) as Address,
        abi: sponsoredFactoryWriteAbi,
        functionName: "setSponsoredLaunchAllowances",
        args: [parsedWallets, parsedWallets.map(() => BigInt(allowance))],
        chainId
      });
      setMessage("Waiting for allowance transaction confirmation.");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const response = await fetch(readUrl(chainId, wallets, address), { cache: "no-store" });
      const nextResult = await readJson(response);
      setResult({
        ...nextResult,
        txHash: hash,
        blockNumber: receipt.blockNumber.toString()
      });
      setMessage("Sponsored launcher allowance updated onchain.");
    } catch (err) {
      setError(userFacingTransactionError(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="internal-actions">
      <form onSubmit={checkWallets} className="internal-form">
        <div className="internal-form-grid">
          <textarea
            value={wallets}
            onChange={(event) => setWallets(event.target.value)}
            placeholder="Wallet addresses, one per line or comma-separated"
            required
          />
          <input
            type="number"
            min={0}
            max={1000}
            value={allowance}
            onChange={(event) => setAllowance(Number(event.target.value))}
            aria-label="Total sponsored launch allowance"
          />
          <select value={chainId} onChange={(event) => setChainId(Number(event.target.value))} aria-label="Network">
            <option value={8453}>Base mainnet</option>
            <option value={84532}>Base Sepolia</option>
          </select>
          <button type="submit" disabled={loading !== null}>
            {loading === "check" ? "Checking..." : "Check wallets"}
          </button>
        </div>
        <p className="internal-check">
          The allowance is the total number of sponsored markets each wallet can launch. Used launches remain counted onchain.
        </p>
      </form>

      <div className="internal-record-list">
        <article className="internal-record">
          <div className="internal-record-main">
            <div className="internal-record-title">
              <h2>Sponsored Factory</h2>
              <div className="internal-chip-row">
                <span className={`internal-chip ${statusTone(result)}`}>{statusText(result)}</span>
                <span className="internal-chip">{result?.network ?? "Base"}</span>
              </div>
            </div>
            <div className="internal-record-metrics">
              <div className="internal-record-metric">
                <span>Factory</span>
                <b>{result?.factoryAddress ?? "loading"}</b>
              </div>
              <div className="internal-record-metric">
                <span>Connected admin</span>
                <b>{address ?? "not connected"}</b>
              </div>
              <div className="internal-record-metric">
                <span>Wallets checked</span>
                <b>{rows.length}</b>
              </div>
              <div className="internal-record-metric">
                <span>Remaining launches</span>
                <b>{totalRemaining}</b>
              </div>
            </div>
            {result?.txHash ? (
              <details className="internal-details" open>
                <summary>Latest transaction</summary>
                <div>
                  <p><span>Tx hash</span><b>{result.txHash}</b></p>
                  <p><span>Block</span><b>{result.blockNumber ?? "pending"}</b></p>
                </div>
              </details>
            ) : null}
          </div>
          <div className="internal-record-actions">
            <ConnectButton />
            <button type="button" disabled={loading !== null || !wallets.trim() || !address} onClick={setAllowances}>
              {loading === "set" ? "Submitting..." : `Set ${allowance} launches each`}
            </button>
          </div>
        </article>

        {error ? <div className="internal-empty">{error}</div> : null}
        {message ? <div className="internal-empty">{message}</div> : null}

        {rows.map((row) => (
          <article className="internal-record" key={row.wallet}>
            <div className="internal-record-main">
              <div className="internal-record-title">
                <h2>{row.wallet}</h2>
                <div className="internal-chip-row">
                  <span className={`internal-chip ${row.remaining > 0 ? "good" : "warn"}`}>
                    {row.remaining} remaining
                  </span>
                </div>
              </div>
              <div className="internal-record-metrics">
                <div className="internal-record-metric">
                  <span>Total allowance</span>
                  <b>{row.allowance}</b>
                </div>
                <div className="internal-record-metric">
                  <span>Used</span>
                  <b>{row.used}</b>
                </div>
                <div className="internal-record-metric">
                  <span>Remaining</span>
                  <b>{row.remaining}</b>
                </div>
                <div className="internal-record-metric">
                  <span>Launch mode</span>
                  <b>Sponsored</b>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
