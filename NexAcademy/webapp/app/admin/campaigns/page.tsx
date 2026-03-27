"use client";

import { useState, useCallback } from "react";
import type { CampaignSection, CampaignRequestRow } from "./_components/types";
import {
  IconCampaigns,
  IconPlus,
  IconQuiz,
  IconUsers,
  IconBot,
  IconSettings,
  IconInbox,
  IconDot,
} from "./_components/icons";
import CampaignsListView from "./_components/CampaignsListView";
import CampaignRequestsView from "./_components/CampaignRequestsView";
import CampaignBuilderView from "./_components/CampaignBuilderView";
import QuizLibraryView from "./_components/QuizLibraryView";
import UsersView from "./_components/UsersView";
import BotMonitorView from "./_components/BotMonitorView";
import SettingsView from "./_components/SettingsView";

/* ── Rail button config ── */
const RAIL_ITEMS: { id: CampaignSection; icon: typeof IconCampaigns; title: string }[] = [
  { id: "campaigns", icon: IconCampaigns, title: "Campaigns" },
  { id: "requests", icon: IconInbox, title: "Requests" },
  { id: "builder", icon: IconPlus, title: "Campaign Builder" },
  { id: "quiz", icon: IconQuiz, title: "Quiz Builder" },
  { id: "users", icon: IconUsers, title: "Users" },
  { id: "bots", icon: IconBot, title: "Bot Monitor" },
];

/* ── Sidebar nav config ── */
const SIDEBAR_CONFIGS: Record<CampaignSection, { title: string; items: { page: CampaignSection; label: string }[] }> = {
  campaigns: { title: "Campaigns", items: [{ page: "campaigns", label: "All Campaigns" }, { page: "requests", label: "Partner Requests" }, { page: "builder", label: "Campaign Builder" }, { page: "quiz", label: "Quiz Library" }] },
  requests: { title: "Requests", items: [{ page: "requests", label: "Partner Requests" }, { page: "campaigns", label: "All Campaigns" }] },
  builder: { title: "Builder", items: [{ page: "builder", label: "Campaign Builder" }, { page: "quiz", label: "Quiz Library" }] },
  quiz: { title: "Quiz", items: [{ page: "quiz", label: "Question Library" }, { page: "builder", label: "Campaign Builder" }] },
  users: { title: "Users", items: [{ page: "users", label: "All Users" }, { page: "bots", label: "Bot Monitor" }] },
  bots: { title: "Bot Monitor", items: [{ page: "bots", label: "Live Monitor" }, { page: "users", label: "All Users" }] },
  settings: { title: "Settings", items: [{ page: "settings", label: "System Settings" }] },
};

const TOPBAR_TITLES: Record<CampaignSection, string> = {
  campaigns: "All Campaigns",
  requests: "Partner Requests",
  builder: "Campaign Builder",
  quiz: "Quiz Library",
  users: "Users & Participants",
  bots: "Bot Monitor",
  settings: "Settings",
};

export default function AdminCampaignsPage() {
  const [section, setSection] = useState<CampaignSection>("campaigns");
  const [editCampaignId, setEditCampaignId] = useState<number | null>(null);
  const [prefillRequest, setPrefillRequest] = useState<CampaignRequestRow | null>(null);

  const goToSection = useCallback((s: CampaignSection) => {
    setSection(s);
  }, []);

  const handleEditCampaign = useCallback((id: number) => {
    setEditCampaignId(id);
    setPrefillRequest(null);
    setSection("builder");
  }, []);

  const handleViewQuestions = useCallback((id: number) => {
    setEditCampaignId(id);
    setPrefillRequest(null);
    setSection("builder");
    // Builder will auto-navigate to quiz step
  }, []);

  const handleCreateFromRequest = useCallback((request: CampaignRequestRow) => {
    setPrefillRequest(request);
    setEditCampaignId(null);
    setSection("builder");
  }, []);

  const handleManagePool = useCallback((campaignId: number) => {
    setEditCampaignId(campaignId);
    setPrefillRequest(null);
    setSection("builder");
  }, []);

  const handleNewCampaign = useCallback(() => {
    setEditCampaignId(null);
    setPrefillRequest(null);
    setSection("builder");
  }, []);

  const sidebarConfig = SIDEBAR_CONFIGS[section] ?? SIDEBAR_CONFIGS.campaigns;

  return (
    <div className="flex h-screen overflow-hidden bg-black text-sm select-none" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── LEFT ICON RAIL ── */}
      <div className="w-[52px] bg-[#060606] border-r border-white/[.06] flex flex-col items-center py-3 gap-1 shrink-0 z-50">
        {/* Logo */}
        <div className="w-8 h-8 bg-nexid-gold rounded-lg flex items-center justify-center text-[12px] font-black text-black mb-3.5">
          N
        </div>

        {/* Rail buttons */}
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id !== "builder") {
                  setEditCampaignId(null);
                  setPrefillRequest(null);
                }
                goToSection(item.id);
              }}
              title={item.title}
              className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center transition-all border ${
                isActive
                  ? "bg-[#0a0a0a] border-white/[.06] text-nexid-gold"
                  : "border-transparent text-neutral-500 hover:bg-white/[.03] hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}

        {/* Settings at bottom */}
        <button
          onClick={() => goToSection("settings")}
          title="Settings"
          className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center transition-all border mt-auto ${
            section === "settings"
              ? "bg-[#0a0a0a] border-white/[.06] text-nexid-gold"
              : "border-transparent text-neutral-500 hover:bg-white/[.03] hover:text-white"
          }`}
        >
          <IconSettings className="w-4 h-4" />
        </button>
      </div>

      {/* ── SIDEBAR ── */}
      <div className="w-60 bg-[#060606] border-r border-white/[.06] flex flex-col shrink-0 overflow-y-auto">
        <div className="px-3.5 pt-3.5 pb-2.5 border-b border-white/[.06]">
          <div className="font-display font-bold text-[13px] text-white mb-0.5">{sidebarConfig.title}</div>
          <div className="text-[10px] font-mono text-neutral-500">NexID Admin OS v1.0</div>
        </div>

        <nav className="p-2 flex-1">
          {sidebarConfig.items.map((item) => {
            const isActive = section === item.page;
            return (
              <button
                key={item.page}
                onClick={() => {
                  if (item.page !== "builder") {
                    setEditCampaignId(null);
                    setPrefillRequest(null);
                  }
                  goToSection(item.page);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-medium mb-0.5 transition-all border ${
                  isActive
                    ? "text-white bg-[#0a0a0a] border-white/[.06]"
                    : "text-neutral-500 border-transparent hover:text-white hover:bg-white/[.02]"
                }`}
              >
                <IconDot className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-nexid-gold opacity-100" : "opacity-40"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="h-[50px] border-b border-white/[.06] flex items-center px-5 bg-black/80 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" />
            <div className="font-display font-bold text-[15px] text-white tracking-tight">{TOPBAR_TITLES[section]}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-mono text-neutral-500">admin@nexid.fun</span>
            {section === "campaigns" && (
              <button
                onClick={handleNewCampaign}
                className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors"
              >
                + New Campaign
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-5">
          {section === "campaigns" && (
            <CampaignsListView
              onEditCampaign={handleEditCampaign}
              onViewQuestions={handleViewQuestions}
            />
          )}
          {section === "requests" && (
            <CampaignRequestsView onCreateFromRequest={handleCreateFromRequest} />
          )}
          {section === "builder" && (
            <CampaignBuilderView
              editCampaignId={editCampaignId}
              prefillRequest={prefillRequest}
              onSaved={() => {}}
              onManageQuestions={(id) => handleViewQuestions(id)}
            />
          )}
          {section === "quiz" && (
            <QuizLibraryView onManagePool={handleManagePool} />
          )}
          {section === "users" && <UsersView />}
          {section === "bots" && <BotMonitorView />}
          {section === "settings" && <SettingsView />}
        </div>
      </div>
    </div>
  );
}
