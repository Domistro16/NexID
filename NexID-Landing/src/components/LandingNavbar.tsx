import { Link } from "react-router-dom";

type LandingNavbarProps = {
  protocolHref?: string;
  onLaunchApp?: () => void;
};

const LandingNavbar = ({ protocolHref = "#protocol", onLaunchApp }: LandingNavbarProps) => {
  const handleLaunchApp = () => {
    if (onLaunchApp) {
      onLaunchApp();
      return;
    }

    window.location.href = "https://academy.nexid.fun";
  };

  return (
    <header className="fixed top-0 z-50 flex h-20 w-full items-center justify-between border-b border-nexid-border bg-[#030303]/80 px-6 backdrop-blur-xl lg:px-12">
      <button
        type="button"
        className="font-display cursor-pointer text-2xl font-black tracking-tighter transition-colors hover:text-white/80"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        N<span className="hidden sm:inline">ex</span>ID<span className="text-nexid-gold">.</span>
      </button>

      <nav className="hidden gap-10 text-sm font-medium md:flex">
        <a href={protocolHref} className="text-nexid-muted transition-colors hover:text-white">
          Protocol
        </a>
        <Link to="/terms" className="text-nexid-muted transition-colors hover:text-white">
          Terms
        </Link>
        <a href="https://academy.nexid.fun" className="text-nexid-muted transition-colors hover:text-white">
          Academy
        </a>
        <a href="https://academy.nexid.fun/partner-portal" className="text-nexid-muted transition-colors hover:text-white">
          Enterprise
        </a>
      </nav>

      <div className="flex items-center gap-4">
        <Link to="/terms" className="text-sm font-medium text-nexid-muted transition-colors hover:text-white md:hidden">
          Terms
        </Link>
        <button
          type="button"
          onClick={handleLaunchApp}
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] active:scale-95"
        >
          Launch App
        </button>
      </div>
    </header>
  );
};

export default LandingNavbar;
