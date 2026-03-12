"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import AdminShell from "../_components/AdminShell";
import {
  normalizeCampaignModules,
  type CampaignModuleGroup,
  type CampaignModuleItem,
} from "@/lib/campaign-modules";
import {
  useAdminContract,
  type NexIDCreateParams,
  type PartnerCreateParams,
} from "@/hooks/useAdminContract";

type OwnerMode = "NEXID" | "PARTNER";
type ModuleGroup = CampaignModuleGroup;
type ModuleItem = CampaignModuleItem;
type ActiveSection = "global" | number;

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function createDefaultItem(type: ModuleItem["type"], title: string): ModuleItem {
  const base = { type, title, points: 100 };
  if (type === "video") {
    return { ...base, videoUrl: "", description: "" };
  }
  if (type === "task") {
    return {
      ...base,
      description: "",
      actionUrl: "",
      actionLabel: "",
      verificationType: "none",
    };
  }
  if (type === "quiz") {
    return {
      ...base,
      question: "",
      options: ["", "", "", ""],
      correctIndex: 0,
    };
  }
  return base;
}

function createDefaultModule(index: number): ModuleGroup {
  return {
    title: `Module ${index + 1}`,
    items: [createDefaultItem("video", `${index + 1}.1 - New Video`)],
  };
}

function normalizeModulesForEditor(rawModules: unknown): ModuleGroup[] {
  const groups = normalizeCampaignModules(rawModules);
  return groups.map((group, groupIndex) => ({
    title: (group.title || "").trim() || `Module ${groupIndex + 1}`,
    description: group.description,
    items: group.items.map((item, itemIndex) => ({
      ...item,
      title: (item.title || "").trim() || `Item ${itemIndex + 1}`,
      points: typeof item.points === "number" ? item.points : 100,
    })),
  }));
}

function summarizeModule(group: ModuleGroup): string {
  if (group.items.length === 0) {
    return "No items";
  }
  const counts = group.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});
  const breakdown = Object.entries(counts)
    .map(([type, count]) => `${type}:${count}`)
    .join(" | ");
  return `${group.items.length} item${group.items.length === 1 ? "" : "s"} | ${breakdown}`;
}

function getQuizOptions(item: ModuleItem | null): string[] {
  if (!item || item.type !== "quiz") {
    return ["", "", "", ""];
  }
  const options = [...(item.options ?? [])];
  while (options.length < 4) {
    options.push("");
  }
  return options.slice(0, 4);
}

export default function AdminBuilderPage() {
  const { address } = useAccount();
  const {
    createCampaignOnChain,
    createEscrowCampaign,
    isEscrowConfigured,
    loading: contractLoading,
    txHash,
    error: contractError,
    isConfigured,
  } = useAdminContract();

  const [ownerMode, setOwnerMode] = useState<OwnerMode>("PARTNER");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorNamespace, setSponsorNamespace] = useState("");
  const [tier, setTier] = useState("STANDARD");
  const [prizePoolUsdc, setPrizePoolUsdc] = useState(0);
  const [keyTakeaways, setKeyTakeaways] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [modules, setModules] = useState<ModuleGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txStep, setTxStep] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("global");
  const [activeItemByModule, setActiveItemByModule] = useState<Record<number, number>>({});

  // Edit mode
  const searchParams = useSearchParams();
  const editIdParam = searchParams.get("edit");
  const [editId, setEditId] = useState<number | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (!editIdParam) return;
    const id = Number(editIdParam);
    if (!Number.isFinite(id)) return;
    setEditId(id);
    setEditLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch(`/api/admin/campaigns/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((body) => {
        const c = body.campaign;
        if (!c) return;
        setTitle(c.title || "");
        setObjective(c.objective || "");
        setSponsorName(c.sponsorName || "");
        setSponsorNamespace(c.sponsorNamespace || "");
        setTier(c.tier || "STANDARD");
        setOwnerMode(c.ownerType === "NEXID" ? "NEXID" : "PARTNER");
        setPrizePoolUsdc(Number(c.prizePoolUsdc) || 0);
        setKeyTakeaways(Array.isArray(c.keyTakeaways) ? c.keyTakeaways.join("\n") : "");
        setCoverImageUrl(c.coverImageUrl || "");
        setModules(normalizeModulesForEditor(c.modules));
        setActiveItemByModule({});
      })
      .catch(() => setError("Failed to load campaign for editing."))
      .finally(() => setEditLoading(false));
  }, [editIdParam]);

  function getActiveItemIndex(moduleIndex: number, group: ModuleGroup): number {
    if (group.items.length === 0) {
      return 0;
    }
    const requested = activeItemByModule[moduleIndex] ?? 0;
    return Math.max(0, Math.min(requested, group.items.length - 1));
  }

  function setActiveItem(moduleIndex: number, itemIndex: number) {
    setActiveItemByModule((prev) => ({
      ...prev,
      [moduleIndex]: Math.max(0, itemIndex),
    }));
  }

  function updateModule(moduleIndex: number, updater: (module: ModuleGroup) => ModuleGroup) {
    setModules((prev) =>
      prev.map((module, index) => (index === moduleIndex ? updater(module) : module)),
    );
  }

  function updateModuleItem(
    moduleIndex: number,
    itemIndex: number,
    updater: (item: ModuleItem) => ModuleItem,
  ) {
    updateModule(moduleIndex, (module) => {
      if (!module.items[itemIndex]) {
        return module;
      }
      return {
        ...module,
        items: module.items.map((item, index) => (index === itemIndex ? updater(item) : item)),
      };
    });
  }

  function addModuleGroup() {
    const nextIndex = modules.length;
    setModules((prev) => [...prev, createDefaultModule(prev.length)]);
    setActiveSection(nextIndex);
    setActiveItemByModule((prev) => ({ ...prev, [nextIndex]: 0 }));
  }

  function removeModuleGroup(moduleIndex: number) {
    setModules((prev) => prev.filter((_, index) => index !== moduleIndex));
    setActiveItemByModule((prev) => {
      const next: Record<number, number> = {};
      for (const [rawIndex, selectedItem] of Object.entries(prev)) {
        const index = Number(rawIndex);
        if (!Number.isInteger(index) || index === moduleIndex) {
          continue;
        }
        const shiftedIndex = index > moduleIndex ? index - 1 : index;
        next[shiftedIndex] = selectedItem;
      }
      return next;
    });

    if (activeSection === moduleIndex) {
      setActiveSection("global");
      return;
    }
    if (typeof activeSection === "number" && activeSection > moduleIndex) {
      setActiveSection(activeSection - 1);
    }
  }

  function addItemToModule(moduleIndex: number, type: ModuleItem["type"]) {
    const currentLength = modules[moduleIndex]?.items.length ?? 0;
    const suggestedTitle =
      type === "video"
        ? `${moduleIndex + 1}.${currentLength + 1} - New Video`
        : type === "task"
          ? `${moduleIndex + 1}.${currentLength + 1} - New Task`
          : type === "quiz"
            ? `${moduleIndex + 1}.${currentLength + 1} - New Quiz`
            : `${moduleIndex + 1}.${currentLength + 1} - New Step`;

    updateModule(moduleIndex, (module) => ({
      ...module,
      items: [...module.items, createDefaultItem(type, suggestedTitle)],
    }));
    setActiveItemByModule((prev) => ({ ...prev, [moduleIndex]: currentLength }));
  }

  function removeItemFromModule(moduleIndex: number, itemIndex: number) {
    const currentModule = modules[moduleIndex];
    const nextActiveItem = currentModule
      ? Math.max(0, Math.min(itemIndex, currentModule.items.length - 2))
      : 0;

    updateModule(moduleIndex, (module) => ({
      ...module,
      items: module.items.filter((_, index) => index !== itemIndex),
    }));
    setActiveItemByModule((prev) => ({ ...prev, [moduleIndex]: nextActiveItem }));
  }

  function changeItemType(moduleIndex: number, itemIndex: number, nextType: ModuleItem["type"]) {
    updateModuleItem(moduleIndex, itemIndex, (item) => {
      const preservedTitle = (item.title || "").trim() || `Item ${itemIndex + 1}`;
      return {
        ...createDefaultItem(nextType, preservedTitle),
        points: typeof item.points === "number" ? item.points : 100,
      };
    });
  }

  async function submitCampaign(status: "DRAFT" | "LIVE") {
    setSaving(true);
    setError(null);
    setMessage(null);
    setTxStep(null);

    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setError("Missing admin auth token.");
        return;
      }

      const resolvedSponsor = ownerMode === "NEXID" ? "NexID Core" : sponsorName.trim();
      if (!resolvedSponsor) {
        setError("Sponsor name is required.");
        return;
      }

      const takeaways = keyTakeaways
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const modulesPayload = modules;
      const moduleCountForProgress = modulesPayload.length;

      // If editing, use PATCH instead of POST
      if (editId) {
        setTxStep("Updating campaign...");
        const patchRes = await fetch(`/api/admin/campaigns/${editId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            objective: objective.trim(),
            sponsorName: resolvedSponsor,
            sponsorNamespace: sponsorNamespace.trim() || null,
            tier,
            ownerType: ownerMode,
            contractType: ownerMode === "NEXID" ? "NEXID_CAMPAIGNS" : "PARTNER_CAMPAIGNS",
            prizePoolUsdc,
            keyTakeaways: takeaways,
            coverImageUrl: coverImageUrl.trim() || null,
            modules: modulesPayload,
            status,
            isPublished: status === "LIVE",
          }),
        });
        const patchData = await patchRes.json();
        if (!patchRes.ok) {
          setError(patchData?.error || "Failed to update campaign.");
        } else {
          setMessage(`Campaign updated: ${patchData?.campaign?.title ?? title}`);
        }
        setTxStep(null);
        setSaving(false);
        return;
      }

      // Step 1: Create campaign in database
      setTxStep("Creating campaign in database...");
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          objective: objective.trim(),
          sponsorName: resolvedSponsor,
          sponsorNamespace: sponsorNamespace.trim() || null,
          tier,
          ownerType: ownerMode,
          contractType: ownerMode === "NEXID" ? "NEXID_CAMPAIGNS" : "PARTNER_CAMPAIGNS",
          prizePoolUsdc,
          keyTakeaways: takeaways,
          coverImageUrl: coverImageUrl.trim() || null,
          modules: modulesPayload,
          status,
          isPublished: status === "LIVE",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to create campaign.");
        return;
      }

      const dbCampaignId = data?.campaign?.id;

      // Step 2: Create campaign on-chain (admin signs tx)
      const contractType = ownerMode === "NEXID" ? "NEXID_CAMPAIGNS" : "PARTNER_CAMPAIGNS";
      if (isConfigured(contractType)) {
        setTxStep("Please confirm the transaction in your wallet...");

        let contractResult: { onChainCampaignId: number; txHash: string } | null = null;

        if (contractType === "NEXID_CAMPAIGNS") {
          const params: NexIDCreateParams = {
            title: title.trim(),
            description: objective.trim(),
            longDescription: objective.trim(),
            instructor: resolvedSponsor,
            objectives: takeaways,
            prerequisites: [],
            category: tier,
            level: "Beginner",
            thumbnailUrl: coverImageUrl.trim() || "",
            duration: "4 weeks",
            totalLessons: BigInt(moduleCountForProgress || 1),
          };
          contractResult = await createCampaignOnChain("NEXID_CAMPAIGNS", params);
        } else {
          const params: PartnerCreateParams = {
            title: title.trim(),
            description: objective.trim(),
            category: tier,
            level: "Beginner",
            thumbnailUrl: coverImageUrl.trim() || "",
            duration: "4 weeks",
            totalTasks: BigInt(moduleCountForProgress || 1),
            sponsor: (address || EMPTY_ADDRESS) as `0x${string}`,
            sponsorName: resolvedSponsor,
            sponsorLogo: coverImageUrl.trim() || "",
            prizePool: BigInt(Math.round(prizePoolUsdc * 1e6)),
            startTime: BigInt(Math.floor(Date.now() / 1000)),
            endTime: BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60), // +30 days
          };
          contractResult = await createCampaignOnChain("PARTNER_CAMPAIGNS", params);
        }

        // Step 3: Store on-chain campaign ID in database
        if (contractResult && dbCampaignId) {
          setTxStep("Storing on-chain ID in database...");
          await fetch(`/api/admin/campaigns/${dbCampaignId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              onChainCampaignId: contractResult.onChainCampaignId,
            }),
          });

          // Step 4: Create escrow campaign (partner campaigns only)
          if (contractType === "PARTNER_CAMPAIGNS" && isEscrowConfigured) {
            setTxStep("Creating escrow campaign - confirm in wallet...");
            const endTime = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
            const escrowResult = await createEscrowCampaign(
              contractResult.onChainCampaignId,
              (address || EMPTY_ADDRESS) as `0x${string}`,
              endTime,
            );

            if (escrowResult) {
              setTxStep("Storing escrow ID in database...");
              await fetch(`/api/admin/campaigns/${dbCampaignId}`, {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  escrowId: escrowResult.escrowId,
                }),
              });
            }
          }
        }

        if (contractResult) {
          setMessage(
            `Campaign created on-chain! ID: ${contractResult.onChainCampaignId} | Tx: ${contractResult.txHash.slice(0, 10)}...`,
          );
        } else {
          setMessage(
            `Campaign saved to DB (${data?.campaign?.title ?? title}). Contract tx was skipped or failed.`,
          );
        }
      } else {
        setMessage(
          `Campaign created in DB: ${data?.campaign?.title ?? title} (${data?.campaign?.status ?? status}). Contract not configured - skipped on-chain creation.`,
        );
      }

      setTxStep(null);
    } catch {
      setError("Failed to create campaign.");
    } finally {
      setSaving(false);
      setTxStep(null);
    }
  }

  const activeModuleIndex = typeof activeSection === "number" ? activeSection : null;
  const activeModule = activeModuleIndex !== null ? modules[activeModuleIndex] ?? null : null;
  const activeItemIndex =
    activeModuleIndex !== null && activeModule
      ? getActiveItemIndex(activeModuleIndex, activeModule)
      : 0;
  const activeItem = activeModule ? activeModule.items[activeItemIndex] ?? null : null;
  const quizOptions = getQuizOptions(activeItem);

  return (
    <AdminShell active="builder" noPadding>
      <div className="flex flex-col h-full bg-black">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-[#1a1a1a] px-6 bg-[#030303] shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-display text-white">
              {editId ? `Draft: ${title || "Untitled Campaign"}` : `New Campaign`}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {editLoading && <span className="text-xs text-nexid-muted">Loading...</span>}
            {txStep && <span className="text-xs text-nexid-gold animate-pulse">{txStep}</span>}
            {txHash && <span className="text-xs text-nexid-muted">Tx: {txHash.slice(0, 10)}...</span>}
            {contractError && <span className="text-xs text-red-500">{contractError}</span>}
            {message && <span className="text-xs text-green-400">{message}</span>}
            {error && <span className="text-xs text-red-500">{error}</span>}
            <span className="text-xs text-nexid-muted">
              {saving ? "Saving..." : editId ? "Auto-saved" : "Draft Mode"}
            </span>
            <button
              onClick={() => submitCampaign("DRAFT")}
              disabled={saving || contractLoading}
              className="px-4 py-2 text-xs font-semibold text-white border border-[#333] rounded hover:bg-[#111] transition-colors disabled:opacity-50"
            >
              Preview
            </button>
            <button
              onClick={() => submitCampaign("LIVE")}
              disabled={saving || contractLoading}
              className="px-6 py-2 text-xs font-bold text-black bg-nexid-gold rounded hover:bg-[#e5c100] transition-colors disabled:opacity-50"
            >
              Publish Live
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Syllabus */}
          <aside className="w-80 border-r border-[#1a1a1a] bg-[#030303] flex flex-col shrink-0">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a]">
              <span className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest">
                Syllabus Outline
              </span>
              <button
                onClick={addModuleGroup}
                className="text-white hover:text-nexid-gold transition-colors text-xl leading-none"
                title="Add module group"
              >
                +
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scroll">
              <button
                onClick={() => setActiveSection("global")}
                className={`w-full text-left p-4 rounded-lg border transition-all ${activeSection === "global"
                    ? "bg-[#111] border-[#333]"
                    : "border-transparent hover:bg-[#0a0a0a]"
                  }`}
              >
                <div className="text-sm font-bold text-white">Campaign Global Settings</div>
                <div className="text-[10px] text-nexid-muted mt-1 font-mono">Core configuration</div>
              </button>

              {modules.map((group, moduleIndex) => {
                const isActive = activeSection === moduleIndex;
                return (
                  <div
                    key={`module-${moduleIndex}`}
                    className={`group flex items-start gap-2 rounded-lg border transition-all ${isActive ? "bg-[#111] border-[#333]" : "border-transparent hover:bg-[#0a0a0a]"
                      }`}
                  >
                    <button
                      onClick={() => setActiveSection(moduleIndex)}
                      className="flex-1 overflow-hidden text-left px-4 py-4"
                    >
                      <div className="text-sm font-bold text-white truncate">
                        {moduleIndex + 1}. {group.title || `Module ${moduleIndex + 1}`}
                      </div>
                      <div className="text-[10px] text-nexid-muted mt-1 font-mono tracking-wide truncate">
                        {summarizeModule(group)}
                      </div>
                    </button>
                    <button
                      onClick={() => removeModuleGroup(moduleIndex)}
                      className="text-nexid-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-3"
                      title="Delete module group"
                    >
                      X
                    </button>
                  </div>
                );
              })}

              <div className="pt-4 border-t border-[#1a1a1a] mt-4">
                <button
                  onClick={addModuleGroup}
                  className="w-full py-4 border border-dashed border-[#333] text-[10px] font-mono font-bold text-nexid-muted uppercase tracking-widest rounded-lg hover:border-nexid-gold hover:text-nexid-gold transition-colors flex items-center justify-center gap-2 bg-[#050505]"
                >
                  <span className="text-lg leading-none mb-0.5">+</span> ADD MODULE GROUP
                </button>
              </div>
            </div>
          </aside>

          {/* Right Panel - Configuration */}
          <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-8 md:p-12 lg:p-16 custom-scroll">
            <div className="max-w-3xl">
              {activeSection === "global" ? (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <h2 className="font-display text-2xl text-white mb-8 pb-4 border-b border-[#1a1a1a]">Global Settings</h2>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setOwnerMode("NEXID")}
                      className={`rounded-xl border p-5 text-left transition-colors ${ownerMode === "NEXID" ? "border-nexid-gold bg-nexid-gold/10" : "border-[#333] bg-[#111] hover:bg-[#1a1a1a]"
                        }`}
                    >
                      <div className="text-base font-bold text-white">NexID Internal</div>
                      <div className="mt-2 text-xs text-nexid-muted leading-relaxed">
                        Uses `NexIDCampaigns` contract for in-house campaigns with no escrow.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOwnerMode("PARTNER")}
                      className={`rounded-xl border p-5 text-left transition-colors ${ownerMode === "PARTNER" ? "border-nexid-gold bg-nexid-gold/10" : "border-[#333] bg-[#111] hover:bg-[#1a1a1a]"
                        }`}
                    >
                      <div className="text-base font-bold text-white">Partner Sponsored</div>
                      <div className="mt-2 text-xs text-nexid-muted leading-relaxed">
                        Uses `PartnerCampaigns` contract. Requires escrow funding.
                      </div>
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                        Campaign Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="admin-input text-base py-3"
                        placeholder="e.g. Advanced Tokenomics"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                        Objective / Description
                      </label>
                      <textarea
                        value={objective}
                        onChange={(e) => setObjective(e.target.value)}
                        className="admin-input h-32 resize-none py-3"
                        placeholder="Detailed description of what the user will learn..."
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                        Sponsor / Partner Name
                      </label>
                      <input
                        type="text"
                        value={ownerMode === "NEXID" ? "NexID Core" : sponsorName}
                        onChange={(e) => setSponsorName(e.target.value)}
                        disabled={ownerMode === "NEXID"}
                        className="admin-input py-3 disabled:opacity-50"
                        placeholder="e.g. Nexus Protocol"
                      />
                    </div>

                    {ownerMode === "PARTNER" && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                            Sponsor Namespace
                          </label>
                          <input
                            type="text"
                            value={sponsorNamespace}
                            onChange={(e) => setSponsorNamespace(e.target.value)}
                            className="admin-input py-3"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                            Tier
                          </label>
                          <select value={tier} onChange={(e) => setTier(e.target.value)} className="admin-input py-3 bg-[#111] text-white">
                            <option value="STANDARD">STANDARD</option>
                            <option value="PREMIUM">PREMIUM</option>
                            <option value="ECOSYSTEM">ECOSYSTEM</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                            Prize Pool (USDC)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={prizePoolUsdc}
                            onChange={(e) => setPrizePoolUsdc(Number(e.target.value))}
                            className="admin-input py-3 font-mono"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                        Key Takeaways (One Per Line)
                      </label>
                      <textarea
                        value={keyTakeaways}
                        onChange={(e) => setKeyTakeaways(e.target.value)}
                        className="admin-input h-32 resize-none py-3"
                        placeholder="- Learn how ID routing works&#10;- Understand the tokenomics&#10;- Execute a swap"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                        Cover Image URL
                      </label>
                      <input
                        type="url"
                        value={coverImageUrl}
                        onChange={(e) => setCoverImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="admin-input py-3"
                      />
                    </div>
                  </div>
                </div>
              ) : activeModuleIndex !== null && activeModule ? (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#1a1a1a]">
                    <h2 className="font-display text-2xl text-white">Module {activeModuleIndex + 1}</h2>
                    <button
                      onClick={() => removeModuleGroup(activeModuleIndex)}
                      className="rounded border border-[#442222] px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-[#2a1212]"
                    >
                      Delete Module
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                        Module Title
                      </label>
                      <input
                        type="text"
                        value={activeModule.title}
                        onChange={(e) =>
                          updateModule(activeModuleIndex, (module) => ({ ...module, title: e.target.value }))
                        }
                        placeholder={`Module ${activeModuleIndex + 1}`}
                        className="admin-input py-3"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                        Module Description
                      </label>
                      <input
                        type="text"
                        value={activeModule.description || ""}
                        onChange={(e) =>
                          updateModule(activeModuleIndex, (module) => ({
                            ...module,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Optional module summary"
                        className="admin-input py-3"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#222] bg-[#111]/50 p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-display text-lg text-white">Items in this Module</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => addItemToModule(activeModuleIndex, "video")}
                          className="rounded border border-[#333] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-colors hover:border-nexid-gold hover:text-nexid-gold"
                        >
                          + Video
                        </button>
                        <button
                          onClick={() => addItemToModule(activeModuleIndex, "task")}
                          className="rounded border border-[#333] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-colors hover:border-nexid-gold hover:text-nexid-gold"
                        >
                          + Task
                        </button>
                        <button
                          onClick={() => addItemToModule(activeModuleIndex, "quiz")}
                          className="rounded border border-[#333] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-colors hover:border-nexid-gold hover:text-nexid-gold"
                        >
                          + Quiz
                        </button>
                      </div>
                    </div>

                    {activeModule.items.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#333] p-6 text-sm text-nexid-muted">
                        No items in this module yet. Add a video, task, or quiz.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeModule.items.map((item, itemIndex) => {
                          const isActiveItem = itemIndex === activeItemIndex;
                          return (
                            <div
                              key={`module-${activeModuleIndex}-item-${itemIndex}`}
                              className={`group flex items-center gap-2 rounded-lg border ${isActiveItem ? "border-[#444] bg-[#1a1a1a]" : "border-[#262626] bg-[#101010]"
                                }`}
                            >
                              <button
                                onClick={() => setActiveItem(activeModuleIndex, itemIndex)}
                                className="flex-1 overflow-hidden px-4 py-3 text-left"
                              >
                                <div className="truncate text-sm font-semibold text-white">
                                  {item.title || `Item ${itemIndex + 1}`}
                                </div>
                                <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-nexid-muted">
                                  {item.type}
                                </div>
                              </button>
                              <button
                                onClick={() => removeItemFromModule(activeModuleIndex, itemIndex)}
                                className="px-3 py-3 text-xs text-nexid-muted opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                                title="Delete item"
                              >
                                X
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {activeItem && (
                    <div className="space-y-6 rounded-xl border border-[#222] bg-[#111]/50 p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#222]">
                        <h3 className="font-display text-xl text-white">Item {activeItemIndex + 1} Settings</h3>
                        <div className="flex items-center gap-3">
                          <label className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest">
                            Type:
                          </label>
                          <select
                            value={activeItem.type}
                            onChange={(e) =>
                              changeItemType(activeModuleIndex, activeItemIndex, e.target.value as ModuleItem["type"])
                            }
                            className="admin-input py-2 text-sm bg-[#111]"
                          >
                            <option value="video">Video Embed</option>
                            <option value="task">Task / Verification</option>
                            <option value="quiz">Quiz Overlay</option>
                            <option value="locked">Locked</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-3">
                          <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                            Item Title
                          </label>
                          <input
                            type="text"
                            value={activeItem.title}
                            onChange={(e) =>
                              updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                ...item,
                                title: e.target.value,
                              }))
                            }
                            placeholder="e.g. Intro to Product Design"
                            className="admin-input py-3"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                            Points
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={activeItem.points ?? 100}
                            onChange={(e) =>
                              updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                ...item,
                                points: Number(e.target.value),
                              }))
                            }
                            className="admin-input py-3 font-mono"
                          />
                        </div>
                      </div>

                      {activeItem.type === "video" && (
                        <div className="space-y-6">
                          <div>
                            <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                              Video URL Embed
                            </label>
                            <input
                              type="url"
                              value={activeItem.videoUrl || ""}
                              onChange={(e) =>
                                updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                  ...item,
                                  videoUrl: e.target.value,
                                }))
                              }
                              placeholder="Synthesia or YouTube embed URL"
                              className="admin-input py-3"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                              Short Description
                            </label>
                            <input
                              type="text"
                              value={activeItem.description || ""}
                              onChange={(e) =>
                                updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                  ...item,
                                  description: e.target.value,
                                }))
                              }
                              placeholder="Optional context for this video"
                              className="admin-input py-3"
                            />
                          </div>
                        </div>
                      )}

                      {activeItem.type === "task" && (
                        <div className="space-y-6">
                          <div>
                            <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                              Task Instructions
                            </label>
                            <textarea
                              value={activeItem.description || ""}
                              onChange={(e) =>
                                updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                  ...item,
                                  description: e.target.value,
                                }))
                              }
                              placeholder="Clear instructions for the user"
                              className="admin-input py-3 h-24 resize-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                                Action URL
                              </label>
                              <input
                                type="url"
                                value={activeItem.actionUrl || ""}
                                onChange={(e) =>
                                  updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                    ...item,
                                    actionUrl: e.target.value,
                                  }))
                                }
                                placeholder="https://..."
                                className="admin-input py-3"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                                Action Button Label
                              </label>
                              <input
                                type="text"
                                value={activeItem.actionLabel || ""}
                                onChange={(e) =>
                                  updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                    ...item,
                                    actionLabel: e.target.value,
                                  }))
                                }
                                placeholder="e.g. Open Discord"
                                className="admin-input py-3"
                              />
                            </div>
                          </div>

                          <div className="pt-4 border-t border-[#222]">
                            <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-3">
                              Verification Method
                            </label>
                            <select
                              value={activeItem.verificationType || "none"}
                              onChange={(e) =>
                                updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                  ...item,
                                  verificationType: e.target.value as ModuleItem["verificationType"],
                                }))
                              }
                              className="admin-input py-3 bg-[#0a0a0a]"
                            >
                              <option value="none">Self-Reported (Click to Verify)</option>
                              <option value="discord-join">Discord Validation: Must join server</option>
                              <option value="discord-post">Discord Validation: Must post in channel</option>
                            </select>

                            {(activeItem.verificationType === "discord-join" ||
                              activeItem.verificationType === "discord-post") && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                  <div>
                                    <label className="block text-[10px] font-mono text-[#888] mb-1.5">Guild/Server ID</label>
                                    <input
                                      type="text"
                                      value={activeItem.guildId || ""}
                                      onChange={(e) =>
                                        updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                          ...item,
                                          guildId: e.target.value,
                                        }))
                                      }
                                      className="admin-input py-2 font-mono text-xs"
                                    />
                                  </div>
                                  {activeItem.verificationType === "discord-post" && (
                                    <div>
                                      <label className="block text-[10px] font-mono text-[#888] mb-1.5">Channel ID</label>
                                      <input
                                        type="text"
                                        value={activeItem.channelId || ""}
                                        onChange={(e) =>
                                          updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                            ...item,
                                            channelId: e.target.value,
                                          }))
                                        }
                                        className="admin-input py-2 font-mono text-xs"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        </div>
                      )}

                      {activeItem.type === "quiz" && (
                        <div className="space-y-6">
                          <div>
                            <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-2">
                              Quiz Question
                            </label>
                            <input
                              type="text"
                              value={activeItem.question || ""}
                              onChange={(e) =>
                                updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                  ...item,
                                  question: e.target.value,
                                }))
                              }
                              placeholder="e.g. What is the primary function of UX research?"
                              className="admin-input py-3"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-3">
                              Options (Select Correct Answer)
                            </label>
                            <div className="space-y-3">
                              {quizOptions.map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-center gap-4">
                                  <label className="relative flex cursor-pointer items-center rounded-full p-2">
                                    <input
                                      type="radio"
                                      name={`quiz-correct-${activeModuleIndex}-${activeItemIndex}`}
                                      checked={activeItem.correctIndex === optionIndex}
                                      onChange={() =>
                                        updateModuleItem(activeModuleIndex, activeItemIndex, (item) => ({
                                          ...item,
                                          correctIndex: optionIndex,
                                        }))
                                      }
                                      className="peer relative h-5 w-5 cursor-pointer appearance-none rounded-full border border-[#444] text-nexid-gold transition-all checked:border-nexid-gold"
                                    />
                                    <span className="pointer-events-none absolute left-2/4 top-2/4 h-2 w-2 -translate-x-2/4 -translate-y-2/4 rounded-full bg-nexid-gold opacity-0 transition-opacity peer-checked:opacity-100" />
                                  </label>
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={(e) =>
                                      updateModuleItem(activeModuleIndex, activeItemIndex, (item) => {
                                        const nextOptions = [...(item.options ?? [])];
                                        while (nextOptions.length < 4) {
                                          nextOptions.push("");
                                        }
                                        nextOptions[optionIndex] = e.target.value;
                                        return { ...item, options: nextOptions.slice(0, 4) };
                                      })
                                    }
                                    placeholder={`Option ${optionIndex + 1}`}
                                    className={`admin-input py-3 flex-1 ${activeItem.correctIndex === optionIndex
                                        ? "border-nexid-gold/50 bg-nexid-gold/5"
                                        : ""
                                      }`}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {activeItem.type === "locked" && (
                        <p className="text-sm text-nexid-muted">
                          Locked item enabled. Users will see this as gated content until progression
                          rules unlock it.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#333] p-8 text-sm text-nexid-muted">
                  Select a module from the left panel, or create a new module group.
                </div>
              )}

            </div>
          </main>
        </div>
      </div>
    </AdminShell>
  );
}
