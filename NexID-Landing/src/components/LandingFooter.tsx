const LandingFooter = () => {
  return (
    <footer className="relative z-10 border-t border-[#1a1a1a] bg-[#030303] py-10 text-center">
      <div className="font-display mb-3 text-2xl font-black tracking-tighter text-white">
        N<span className="hidden sm:inline">ex</span>ID<span className="text-nexid-gold">.</span>
      </div>
      <div className="mb-6 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
        Sovereign Identity Protocol
      </div>
      <div className="flex justify-center gap-6 text-sm font-medium text-nexid-muted">
        <a href="#" className="nav-link transition-colors hover:text-white">
          X (Twitter)
        </a>
        <a href="#" className="nav-link transition-colors hover:text-white">
          Discord
        </a>
        <a href="#" className="nav-link transition-colors hover:text-white">
          Docs
        </a>
        <a href="#" className="nav-link transition-colors hover:text-white">
          GitHub
        </a>
      </div>
      <div className="mt-8 font-mono text-[10px] text-[#555]"> 2026 NexID. All rights reserved.</div>
    </footer>
  );
};

export default LandingFooter;
