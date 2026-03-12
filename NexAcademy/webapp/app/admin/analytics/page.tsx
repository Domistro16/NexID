import AdminShell from "../_components/AdminShell";

export default function AdminAnalyticsPage() {
  return (
    <AdminShell active="analytics">
      <section className="max-w-[1600px] mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="admin-panel p-0 flex flex-col overflow-hidden border-[#333] h-[450px]">
            <div className="p-4 border-b border-[#222] bg-[#0a0a0a] flex justify-between items-center">
              <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-muted">Sybil Detection Radar</h3>
              <span className="text-[9px] bg-[#222] text-nexid-muted px-1.5 py-0.5 rounded font-bold border border-[#333]">COMING SOON</span>
            </div>

            <div className="h-64 radar-container bg-[#050505] border-b border-[#1a1a1a] relative">
              <div className="absolute inset-0 flex items-center justify-center"><div className="w-16 h-16 border border-[#222] rounded-full" /></div>
              <div className="absolute inset-0 flex items-center justify-center"><div className="w-32 h-32 border border-[#222] rounded-full" /></div>
              <div className="absolute inset-0 flex items-center justify-center"><div className="w-48 h-48 border border-[#222] rounded-full" /></div>
              <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-px bg-[#222]" /></div>
              <div className="absolute inset-0 flex items-center justify-center"><div className="h-full w-px bg-[#222]" /></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-nexid-muted text-xs font-mono">No active threats</span>
              </div>
            </div>

            <div className="p-4 bg-[#0a0a0a] flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-xs text-nexid-muted mb-2">Sybil detection and threat monitoring will be available in a future update.</div>
                <div className="text-[10px] font-mono text-[#555]">Cluster analysis, IP flagging, and automated bans</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="admin-panel p-5 h-[220px]">
              <div className="flex items-center justify-between mb-4 border-b border-[#1a1a1a] pb-2">
                <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-muted">Threat Resolution Ledger</h3>
                <span className="text-[9px] bg-[#222] text-nexid-muted px-1.5 py-0.5 rounded font-bold border border-[#333]">COMING SOON</span>
              </div>
              <div className="flex items-center justify-center h-[120px]">
                <div className="text-xs text-nexid-muted text-center">
                  <div>Threat logging and resolution tracking</div>
                  <div className="text-[10px] font-mono text-[#555] mt-1">will appear here when enabled.</div>
                </div>
              </div>
            </div>

            <div className="admin-panel p-5 h-[206px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-muted">API Verification Latency</h3>
                <span className="text-[9px] bg-[#222] text-nexid-muted px-1.5 py-0.5 rounded font-bold border border-[#333]">COMING SOON</span>
              </div>
              <div className="flex items-center justify-center h-[120px]">
                <div className="text-xs text-nexid-muted text-center">
                  <div>Real-time API health monitoring</div>
                  <div className="text-[10px] font-mono text-[#555] mt-1">will appear here when enabled.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
