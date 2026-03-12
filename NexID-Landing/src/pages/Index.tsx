import { useCallback, useEffect, useRef, useState } from "react";
import LandingFooter from "@/components/LandingFooter";
import LandingNavbar from "@/components/LandingNavbar";

type ModalType = "gateway" | "mint" | "academy";

const Index = () => {
  const triggerRef = useRef<HTMLElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const namespaceRef = useRef<HTMLDivElement | null>(null);
  const academyRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const odometer = 0;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Initializing...");
  const [modalDesc, setModalDesc] = useState("Securing session.");

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const openModal = useCallback((type: ModalType) => {
    if (type === "academy") {
      setModalTitle("Entering Academy...");
      setModalDesc("Booting secure access.");
    } else if (type === "mint") {
      setModalTitle("Preparing .id Mint...");
      setModalDesc("Checking namespace availability.");
    } else {
      setModalTitle("Launching App...");
      setModalDesc("Securing session.");
    }

    setIsModalOpen(true);

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      if (type === "academy") {
        window.location.href = "https://academy.nexid.fun";
        return;
      }
      if (type === "mint") {
        window.location.href = "https://names.nexid.fun";
        return;
      }
      if (type === "gateway") {
        window.location.href = "https://academy.nexid.fun";
        return;
      }
      closeModal();
    }, 1600);
  }, [closeModal]);

  useEffect(() => {
    const triggerEl = triggerRef.current;
    const layerEl = layerRef.current;
    const namespaceEl = namespaceRef.current;
    const academyEl = academyRef.current;

    if (
      !triggerEl ||
      !layerEl ||
      !namespaceEl ||
      !academyEl ||
      window.innerWidth <= 1024
    ) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const rect = triggerEl.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);

      layerEl.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
      namespaceEl.style.transform = `translateZ(60px) translateX(${x * 12}px) translateY(${y * 12}px)`;
      academyEl.style.transform = `translateZ(140px) translateX(${x * 25}px) translateY(${y * 25}px)`;
    };

    const handleMouseLeave = () => {
      layerEl.style.transform = "rotateX(0deg) rotateY(0deg)";
      namespaceEl.style.transform = "translateZ(60px) translateX(0) translateY(0)";
      academyEl.style.transform = "translateZ(140px) translateX(0) translateY(0)";
    };

    triggerEl.addEventListener("mousemove", handleMouseMove);
    triggerEl.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      triggerEl.removeEventListener("mousemove", handleMouseMove);
      triggerEl.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
          }
        });
      },
      { threshold: 0.15 },
    );

    const revealElements = document.querySelectorAll(".nexid-reveal");
    revealElements.forEach((element) => observer.observe(element));

    return () => {
      revealElements.forEach((element) => observer.unobserve(element));
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-nexid-base font-sans text-nexid-text antialiased">
      <div className="bg-stardust" aria-hidden="true" />
      <div className="shooting-star star-1" aria-hidden="true" />
      <div className="shooting-star star-2" aria-hidden="true" />

      <LandingNavbar onLaunchApp={() => openModal("gateway")} />

      <main className="w-full pt-20">
        <section
          ref={triggerRef}
          className="hero-perspective relative flex min-h-[100vh] w-full flex-col items-center justify-center overflow-hidden px-6 text-center"
        >
          <div className="hero-orb" aria-hidden="true" />
          <div ref={layerRef} className="parallax-layer relative z-10 mb-8 w-full max-w-6xl">
            <div className="mb-16 nexid-reveal active">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-nexid-gold/30 bg-nexid-gold/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-nexid-gold shadow-inner-glaze">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-nexid-gold shadow-gold-glow" />
                The Sovereign Network Root
              </div>
              <h1 className="font-display mb-6 text-6xl font-black leading-[1] tracking-tighter text-white md:text-7xl lg:text-8xl">
                Choose your{" "}
                <span className="bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">
                  path.
                </span>
              </h1>
            </div>

            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
              <div
                ref={namespaceRef}
                className="gate-card portal-namespace group flex flex-col items-start rounded-[2.5rem] border border-white/10 bg-[#0a0a0a]/90 p-10 text-left backdrop-blur-2xl"
              >
                <div className="mb-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-nexid-gold text-black shadow-gold-glow transition-all duration-500 group-hover:scale-110">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                </div>
                <h2 className="font-display mb-4 text-4xl font-bold tracking-tight text-white">Namespace</h2>
                <p className="mb-12 text-base leading-relaxed text-nexid-muted">
                  The foundation. Secure a permanent .id domain to route your profile, wallet, and verifiable
                  credentials.
                </p>
                <button
                  type="button"
                  onClick={() => openModal("mint")}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-nexid-gold py-5 text-lg font-bold text-black transition-all hover:shadow-gold-glow-lg active:scale-95"
                >
                  Mint your .id
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>

              <div
                ref={academyRef}
                className="gate-card portal-academy group flex flex-col items-start rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 text-left backdrop-blur-xl"
              >
                <div className="mb-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-inner-glaze transition-all duration-500 group-hover:border-white/30">
                  <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h2 className="font-display mb-4 text-4xl font-bold tracking-tight text-white">Academy</h2>
                <p className="mb-12 text-base leading-relaxed text-nexid-muted">
                  The execution layer. Pass technical tracks, verify actions on-chain, and earn USDC settlements.
                </p>
                <button
                  type="button"
                  onClick={() => openModal("academy")}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 py-5 text-lg font-bold text-white transition-all hover:bg-white hover:text-black active:scale-95"
                >
                  Enter Academy
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="protocol" className="relative z-10 mx-auto w-full max-w-7xl border-t border-[#1a1a1a] px-6 py-24 lg:py-40">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="premium-panel hover-card nexid-reveal md:col-span-7 flex h-[480px] flex-col justify-between p-12">
              <div>
                <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-nexid-gold">Verification Layer</div>
                <h3 className="font-display mb-6 text-4xl font-bold leading-tight text-white">
                  Your .id is your universal resume.
                </h3>
                <p className="text-lg text-nexid-muted">
                  Achievements completed in the Academy are cryptographically bound to your namespace. Employers
                  verify your expertise instantly through your public Transcript.
                </p>
              </div>
              <div className="mt-auto flex items-center gap-5 rounded-3xl border border-[#222] bg-[#050505] p-6">
                <div className="h-16 w-16 rounded-full border border-nexid-gold/40 bg-black p-1 shadow-gold-glow">
                  <img
                    src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=150"
                    className="h-full w-full rounded-full grayscale transition-all duration-700 hover:grayscale-0"
                    alt="Profile"
                  />
                </div>
                <div>
                  <div className="font-display text-2xl font-bold text-white">
                    nadya<span className="text-nexid-gold">.id</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded-md border border-nexid-gold/20 bg-nexid-gold/10 px-2.5 py-1 font-mono text-[10px] text-nexid-gold">
                      DeFi Master
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="premium-panel hover-card nexid-reveal md:col-span-5 flex h-[480px] flex-col justify-center p-12 text-center delay-100">
              <div className="mb-10 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Network Settlement</div>
              <div className="font-display mb-4 text-6xl font-black tracking-tighter text-white">${odometer.toLocaleString()}</div>
              <p className="text-sm text-nexid-muted">USDC disbursed via protocol escrow.</p>
              <div className="relative mt-auto h-20 w-full">
                <svg viewBox="0 0 400 60" className="h-full w-full">
                  <path
                    d="M0,50 Q50,45 100,55 T200,30 T300,45 T400,20"
                    fill="none"
                    stroke="#ffb000"
                    strokeWidth="2"
                    className="animate-[pulse_3s_infinite]"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>

        <LandingFooter />
      </main>

      <div className={`modal-overlay fixed inset-0 z-[1000] flex items-center justify-center p-4 ${isModalOpen ? "active" : ""}`}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={closeModal} aria-hidden="true" />
        <div className="premium-panel relative flex w-full max-w-sm flex-col items-center p-10 text-center">
          <div className="mb-8 h-16 w-16 animate-spin rounded-full border-2 border-nexid-gold/40 border-t-nexid-gold shadow-gold-glow" />
          <h3 className="font-display mb-3 text-2xl text-white">{modalTitle}</h3>
          <p className="font-mono text-sm text-nexid-muted">{modalDesc}</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
