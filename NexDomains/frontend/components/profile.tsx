'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { formatEther, namehash, keccak256, toBytes } from 'viem';
import { useAllOwnedNames } from '../hooks/getAllNames';
import { useReferralStats } from '../hooks/useReferralStats';
import { useENSName } from '../hooks/getPrimaryName';

import { MoreVertical, Image, Package, Settings, Star, X } from 'lucide-react';
import { constants } from '../constant';
import Modal from 'react-modal';
import DomainImage from './DomainImage';
import '../app/profile/profile.css';

// Set app element for react-modal on client side only
if (typeof window !== 'undefined') {
  Modal.setAppElement(document.body);
}

const THEME_KEY = 'nexid-theme';

// ABI definitions
const isWrappedAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'isWrapped',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const setAddrAbi = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'node', type: 'bytes32' },
      { internalType: 'address', name: 'a', type: 'address' },
    ],
    name: 'setAddr',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const wrapETH2LDAbi = [
  {
    inputs: [
      { internalType: 'string', name: 'label', type: 'string' },
      { internalType: 'address', name: 'wrappedOwner', type: 'address' },
      { internalType: 'uint16', name: 'ownerControlledFuses', type: 'uint16' },
      { internalType: 'address', name: 'resolver', type: 'address' },
    ],
    name: 'wrapETH2LD',
    outputs: [{ internalType: 'uint64', name: 'expiry', type: 'uint64' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const approveAbi = [
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const unwrapETH2LDAbi = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'labelhash', type: 'bytes32' },
      { internalType: 'address', name: 'registrant', type: 'address' },
      { internalType: 'address', name: 'controller', type: 'address' },
    ],
    name: 'unwrapETH2LD',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const setNameAbi = [
  {
    inputs: [{ internalType: 'string', name: 'name', type: 'string' }],
    name: 'setName',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Hook to check if domain is wrapped
function useIsWrapped(name: string) {
  const { data: wrapped } = useReadContract({
    abi: isWrappedAbi,
    functionName: 'isWrapped',
    address: constants.NameWrapper,
    args: [namehash(name)],
  });
  return wrapped as boolean | undefined;
}

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  isDark: boolean;
}

// Domain Image Modal
function DomainImageModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  return (
    <Modal isOpen={isOpen} onRequestClose={onClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: isDark ? '#1a1a1a' : '#fff' }}>
        <button onClick={onClose} className="modal-close-btn" style={{ color: isDark ? '#888' : '#666' }}>
          <X size={24} />
        </button>
        <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111' }}>{domain}</h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DomainImage domain={domain} className="w-full max-w-md rounded-lg" />
        </div>
      </div>
    </Modal>
  );
}

// ABI to read current addr
const addrAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'addr',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Change BSC Record Modal - sets the BSC address the domain resolves to
function ChangeBSCRecordModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  const [bscAddress, setBscAddress] = useState('');
  const [step, setStep] = useState(0);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  // Fetch current BSC address
  const { data: currentAddr } = useReadContract({
    abi: addrAbi,
    address: constants.PublicResolver,
    functionName: 'addr',
    args: [namehash(domain)],
  });
  const currentBscAddress = currentAddr as string | undefined;

  const handleSetBSCRecord = async () => {
    try {
      await writeContractAsync({
        abi: setAddrAbi,
        address: constants.PublicResolver,
        functionName: 'setAddr',
        args: [namehash(domain), bscAddress as `0x${string}`],
      });
      setStep(1);
    } catch (error) {
      console.error('Set BSC record error:', error);
    }
  };

  const handleClose = () => {
    setStep(0);
    setBscAddress('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={handleClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: isDark ? '#1a1a1a' : '#fff' }}>
        <button onClick={handleClose} className="modal-close-btn" style={{ color: isDark ? '#888' : '#666' }}>
          <X size={24} />
        </button>
        {step === 0 ? (
          <>
            <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111' }}>Change BSC Record for {domain}</h2>
            <p className="modal-desc" style={{ color: isDark ? '#aaa' : '#666' }}>Enter the BSC address this domain should resolve to</p>
            <input
              value={bscAddress}
              onChange={(e) => setBscAddress(e.target.value)}
              placeholder={currentBscAddress || '0x...'}
              className="modal-input"
              style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4', color: isDark ? '#fff' : '#111', border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)' }}
            />
            <div className="modal-buttons">
              <button onClick={handleClose} className="modal-btn-secondary" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4', color: isDark ? '#fff' : '#111' }}>Cancel</button>
              <button onClick={handleSetBSCRecord} disabled={isPending || !bscAddress} className="modal-btn-primary" style={{ background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', opacity: (isPending || !bscAddress) ? 0.6 : 1 }}>
                {isPending ? 'Confirming...' : 'Update Record'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111', textAlign: 'center' }}>BSC Record Updated!</h2>
            <p className="modal-desc" style={{ color: isDark ? '#aaa' : '#666', textAlign: 'center' }}>{domain} now resolves to {bscAddress.slice(0, 6)}...{bscAddress.slice(-4)}</p>
            {hash && <p style={{ color: isDark ? '#888' : '#999', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>TX: {hash}</p>}
            <button onClick={handleClose} className="modal-btn-primary" style={{ width: '100%', background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', marginTop: '16px' }}>Done</button>
          </>
        )}
      </div>
    </Modal>
  );
}

// Wrap Modal
function WrapModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  const label = domain.replace(/\.id$/, '');
  const { address } = useAccount();
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState('');
  const { writeContractAsync: approveContract } = useWriteContract();
  const { writeContractAsync: wrapContract, data: hash } = useWriteContract();

  const handleWrap = async () => {
    const labelhash = keccak256(toBytes(label));
    try {
      setStep(1);
      setInfo('Approving wrapper contract...');
      await approveContract({
        abi: approveAbi,
        address: constants.BaseRegistrar,
        functionName: 'approve',
        args: [constants.NameWrapper, labelhash],
      });
      setInfo('Wrapping name...');
      await wrapContract({
        abi: wrapETH2LDAbi,
        address: constants.NameWrapper,
        functionName: 'wrapETH2LD',
        args: [label, address, 0, constants.PublicResolver],
      });
      setInfo('Wrap complete!');
    } catch (error) {
      console.error('Wrap error:', error);
      setInfo('Error wrapping name');
    }
  };

  const handleClose = () => {
    setStep(0);
    setInfo('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={handleClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: isDark ? '#1a1a1a' : '#fff' }}>
        <button onClick={handleClose} className="modal-close-btn" style={{ color: isDark ? '#888' : '#666' }}>
          <X size={24} />
        </button>
        {step === 0 ? (
          <>
            <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111' }}>Wrap {domain}</h2>
            <p className="modal-desc" style={{ color: isDark ? '#aaa' : '#666' }}>Wrapping your name gives you new features like permissions and subname control.</p>
            <div className="modal-buttons">
              <button onClick={handleClose} className="modal-btn-secondary" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4', color: isDark ? '#fff' : '#111' }}>Cancel</button>
              <button onClick={handleWrap} className="modal-btn-primary" style={{ background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff' }}>Wrap Name</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111', textAlign: 'center' }}>{info}</h2>
            {hash && <p style={{ color: isDark ? '#888' : '#999', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>TX: {hash}</p>}
            {info === 'Wrap complete!' && (
              <button onClick={handleClose} className="modal-btn-primary" style={{ width: '100%', background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', marginTop: '16px' }}>Done</button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// Unwrap Modal
function UnwrapModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  const label = domain.replace(/\.id$/, '');
  const { address } = useAccount();
  const [step, setStep] = useState(0);
  const [ownerAddress, setOwnerAddress] = useState(address || '');
  const [managerAddress, setManagerAddress] = useState(address || '');
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const handleUnwrap = async () => {
    const labelhash = keccak256(toBytes(label));
    try {
      await writeContractAsync({
        abi: unwrapETH2LDAbi,
        address: constants.NameWrapper,
        functionName: 'unwrapETH2LD',
        args: [labelhash, ownerAddress as `0x${string}`, managerAddress as `0x${string}`],
      });
      setStep(1);
    } catch (error) {
      console.error('Unwrap error:', error);
    }
  };

  const handleClose = () => {
    setStep(0);
    setOwnerAddress(address || '');
    setManagerAddress(address || '');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={handleClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: isDark ? '#1a1a1a' : '#fff' }}>
        <button onClick={handleClose} className="modal-close-btn" style={{ color: isDark ? '#888' : '#666' }}>
          <X size={24} />
        </button>
        {step === 0 ? (
          <>
            <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111' }}>Unwrap {domain}</h2>
            <p className="modal-desc" style={{ color: isDark ? '#aaa' : '#666' }}>Owner address (receives the NFT)</p>
            <input value={ownerAddress} onChange={(e) => setOwnerAddress(e.target.value)} placeholder="Owner address" className="modal-input" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4', color: isDark ? '#fff' : '#111', border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)' }} />
            <p className="modal-desc" style={{ color: isDark ? '#aaa' : '#666', marginTop: '12px' }}>Manager address</p>
            <input value={managerAddress} onChange={(e) => setManagerAddress(e.target.value)} placeholder="Manager address" className="modal-input" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4', color: isDark ? '#fff' : '#111', border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)' }} />
            <div className="modal-buttons">
              <button onClick={handleClose} className="modal-btn-secondary" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4', color: isDark ? '#fff' : '#111' }}>Cancel</button>
              <button onClick={handleUnwrap} disabled={isPending} className="modal-btn-primary" style={{ background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', opacity: isPending ? 0.6 : 1 }}>
                {isPending ? 'Confirming...' : 'Unwrap'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111', textAlign: 'center' }}>Transaction Submitted</h2>
            <p className="modal-desc" style={{ color: isDark ? '#aaa' : '#666', textAlign: 'center' }}>Your unwrap transaction has been submitted.</p>
            {hash && <p style={{ color: isDark ? '#888' : '#999', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>TX: {hash}</p>}
            <button onClick={handleClose} className="modal-btn-primary" style={{ width: '100%', background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', marginTop: '16px' }}>Done</button>
          </>
        )}
      </div>
    </Modal>
  );
}

// Set Primary Name Modal
function SetPrimaryModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  const [step, setStep] = useState(0);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const handleSetPrimary = async () => {
    try {
      await writeContractAsync({
        abi: setNameAbi,
        address: constants.ReverseRegistrar,
        functionName: 'setName',
        args: [domain],
      });
      setStep(1);
    } catch (error) {
      console.error('Set primary error:', error);
    }
  };

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={handleClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: isDark ? '#1a1a1a' : '#fff' }}>
        <button onClick={handleClose} className="modal-close-btn" style={{ color: isDark ? '#888' : '#666' }}>
          <X size={24} />
        </button>
        {step === 0 ? (
          <>
            <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111' }}>Set as Primary Name</h2>
            <p className="modal-desc" style={{ color: isDark ? '#aaa' : '#666' }}>Setting <strong>{domain}</strong> as your primary name will display it across dApps when you connect your wallet.</p>
            <div className="modal-buttons">
              <button onClick={handleClose} className="modal-btn-secondary" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4', color: isDark ? '#fff' : '#111' }}>Cancel</button>
              <button onClick={handleSetPrimary} disabled={isPending} className="modal-btn-primary" style={{ background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', opacity: isPending ? 0.6 : 1 }}>
                {isPending ? 'Confirming...' : 'Set Primary'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title" style={{ color: isDark ? '#fff' : '#111', textAlign: 'center' }}>Primary Name Set!</h2>
            <p className="modal-desc" style={{ color: isDark ? '#aaa' : '#666', textAlign: 'center' }}>{domain} is now your primary name.</p>
            {hash && <p style={{ color: isDark ? '#888' : '#999', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>TX: {hash}</p>}
            <button onClick={handleClose} className="modal-btn-primary" style={{ width: '100%', background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', marginTop: '16px' }}>Done</button>
          </>
        )}
      </div>
    </Modal>
  );
}

// Actions Dropdown Component
function ActionsDropdown({ domain, isPrimary, isDark }: { domain: string; isPrimary: boolean; isDark: boolean }) {
  const isWrapped = useIsWrapped(domain);
  const [isOpen, setIsOpen] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showResolverModal, setShowResolverModal] = useState(false);
  const [showWrapModal, setShowWrapModal] = useState(false);
  const [showUnwrapModal, setShowUnwrapModal] = useState(false);
  const [showPrimaryModal, setShowPrimaryModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div ref={dropdownRef} className="actions-dropdown-container">
        <button
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="actions-trigger-btn"
        >
          <MoreVertical size={16} />
        </button>

        {isOpen && (
          <div className={`actions-menu ${isDark ? 'dark' : ''}`} onClick={(e) => e.stopPropagation()}>
            <button className="actions-menu-item" onClick={() => { setShowImageModal(true); setIsOpen(false); }}>
              <Image size={14} /> View Image
            </button>
            <button className="actions-menu-item" onClick={() => { setShowResolverModal(true); setIsOpen(false); }}>
              <Settings size={14} /> Change BSC Record
            </button>
            {isWrapped ? (
              <button className="actions-menu-item" onClick={() => { setShowUnwrapModal(true); setIsOpen(false); }}>
                <Package size={14} /> Unwrap
              </button>
            ) : (
              <button className="actions-menu-item" onClick={() => { setShowWrapModal(true); setIsOpen(false); }}>
                <Package size={14} /> Wrap
              </button>
            )}
            {!isPrimary && (
              <button className="actions-menu-item" onClick={() => { setShowPrimaryModal(true); setIsOpen(false); }}>
                <Star size={14} /> Set as Primary
              </button>
            )}
          </div>
        )}
      </div>

      <DomainImageModal isOpen={showImageModal} onClose={() => setShowImageModal(false)} domain={domain} isDark={isDark} />
      <ChangeBSCRecordModal isOpen={showResolverModal} onClose={() => setShowResolverModal(false)} domain={domain} isDark={isDark} />
      <WrapModal isOpen={showWrapModal} onClose={() => setShowWrapModal(false)} domain={domain} isDark={isDark} />
      <UnwrapModal isOpen={showUnwrapModal} onClose={() => setShowUnwrapModal(false)} domain={domain} isDark={isDark} />
      <SetPrimaryModal isOpen={showPrimaryModal} onClose={() => setShowPrimaryModal(false)} domain={domain} isDark={isDark} />
    </>
  );
}

export default function Profile() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const referralLinkRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState('light');
  const [copied, setCopied] = useState(false);
  const [showAllDomains, setShowAllDomains] = useState(false);

  // Fetch domains
  const { domains, isLoading: domainsLoading } = useAllOwnedNames(address?.toLowerCase() || '');

  // Fetch referral stats from ReferralVerifier contract
  const { referralCount, totalEarnings, referralPct, isLoading: referralLoading } = useReferralStats(address);

  // Fetch user's primary name (reverse record)
  const { name: primaryName, loading: primaryNameLoading } = useENSName({ owner: address as `0x${string}` });

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
    }

    // Listen for body class changes (when nav toggles dark mode)
    const observer = new MutationObserver(() => {
      const isDarkMode = document.body.classList.contains('dark-mode');
      setTheme(isDarkMode ? 'dark' : 'light');
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Check initial state from body class
    if (document.body.classList.contains('dark-mode')) {
      setTheme('dark');
    }

    return () => observer.disconnect();
  }, []);

  const isDark = theme === 'dark';

  // Calculate stats
  const domainsOwned = domains.length;
  const totalReferrals = referralCount ? Number(referralCount) : 0;
  const earningsInUsdc = totalEarnings ? Number(formatEther(totalEarnings)) : 0;
  const currentPct = referralPct ? Number(referralPct) : 25;

  // Get the primary domain for referral link (prefer primary name, fallback to first domain)
  const referralDomain = useMemo(() => {
    // First try the primary name (reverse record)
    if (primaryName && typeof primaryName === 'string' && primaryName.endsWith('.id')) {
      return primaryName.replace('.id', '');
    }
    // Fallback to first owned domain
    if (domains.length > 0) {
      return domains[0].name?.replace('.id', '') || '';
    }
    return '';
  }, [primaryName, domains]);

  const referralLink = referralDomain
    ? `https://names.nexdomains.com?ref=${referralDomain}`
    : '';

  const fallbackCopy = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      console.warn('execCommand copy failed', e);
    }
    document.body.removeChild(textarea);
  };

  const copyReferralLink = () => {
    const text = referralLinkRef.current?.textContent?.trim();
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          console.warn('Clipboard API blocked, falling back', err);
          fallbackCopy(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
    } else {
      fallbackCopy(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (timestamp: string | number) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  };

  if (!isConnected) {
    return (
      <>

        <div className="soft-mist-bg" />
        <div className="nav-spacer" />
        <div className="profile-shell">
          <div className="connect-wallet-box">
            <div className="connect-wallet-icon">🔐</div>
            <h2>Connect Your Wallet</h2>
            <p>Please connect your wallet to access your profile and manage your .id domains.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>

      <div className="soft-mist-bg" />
      <div className="nav-spacer" />

      {/* PROFILE PAGE */}
      <div className="profile-shell">
        <div className="profile-container">
          <header className="profile-header">
            <div className="profile-main-meta">
              <div className="avatar">
                <div className="avatar-inner">🧑‍🦲</div>
              </div>
              <div>
                <h1 className="profile-title">Your NexDomains Profile</h1>
                <p className="profile-subline">
                  Track your .id domains, referral rewards, and on‑chain
                  identity in one clean view.
                </p>
              </div>
            </div>
            <div className="pill-row">
              <div className="pill">Identity · Learning · Rewards</div>
              <div className="pill">Live on Base · .id</div>
            </div>
          </header>

          <section className="stats-grid" aria-label="profile stats">
            <article className="stat-card">
              <div className="stat-label-row">
                <span>Domains Owned</span>
                <span className="stat-icon-pill">🏷️</span>
              </div>
              <p className="stat-value">{domainsOwned}</p>
              <p className="stat-caption">
                Each name is a permanent .id identity inside NexDomains.
              </p>
            </article>

            <article className="stat-card">
              <div className="stat-label-row">
                <span>Referral Earnings</span>
                <span className="stat-icon-pill">💰</span>
              </div>
              <p className="stat-value">
                {referralLoading ? '...' : `${earningsInUsdc.toFixed(2)} USDC`}
              </p>
              <p className="stat-caption">
                Total rewards earned from sharing your unique mint link.
              </p>
            </article>

            <article className="stat-card">
              <div className="stat-label-row">
                <span>Total Referrals</span>
                <span className="stat-icon-pill">👥</span>
              </div>
              <p className="stat-value">{referralLoading ? '...' : totalReferrals}</p>
              <p className="stat-caption">
                People who minted a .id domain through your link.
              </p>
            </article>
          </section>

          <section className="profile-layout">
            <article className="domains-card">
              <div className="section-heading">
                <h2>Your .id domains</h2>
                <span className="tag-pill">Primary identity hub</span>
              </div>
              <p className="section-caption">
                Every name you mint can route to your profiles, courses, AI
                agents, or future NexDomains utilities.
              </p>

              {domainsLoading ? (
                <div className="no-domains">
                  <p>Loading your domains...</p>
                </div>
              ) : domains.length === 0 ? (
                <div className="no-domains">
                  <p>No domains found</p>
                  <button className="register-btn" onClick={() => router.push('/')}>
                    Register a Domain
                  </button>
                </div>
              ) : (
                <>
                  <div className="domains-table-wrapper">
                    <table className="domains-table">
                      <thead>
                        <tr>
                          <th>Domain</th>
                          <th>Status</th>
                          <th>Minted</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllDomains ? domains : domains.slice(0, 10)).map((domain: any, index: number) => {
                          const now = Math.floor(Date.now() / 1000);
                          const isExpired = domain.expiryDate && Number(domain.expiryDate) < now;
                          const isPrimaryDomain = primaryName === domain.name;

                          return (
                            <tr key={index}>
                              <td className="domain-name">
                                {domain.name}
                                {isPrimaryDomain && <span className="primary-badge">Primary</span>}
                              </td>
                              <td>
                                <span className={`status-pill ${isExpired ? 'expired' : ''}`}>
                                  <span className={`status-dot ${isExpired ? 'expired' : ''}`} />
                                  {isExpired ? 'Expired' : 'Active'}
                                </span>
                              </td>
                              <td>{domain.createdAt ? formatDate(domain.createdAt) : '-'}</td>
                              <td>
                                <ActionsDropdown domain={domain.name} isPrimary={isPrimaryDomain} isDark={isDark} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {domains.length > 10 && (
                    <button className="view-all-btn" onClick={() => setShowAllDomains(!showAllDomains)}>
                      {showAllDomains ? 'Show less' : `View all ${domains.length} domains`}
                    </button>
                  )}
                </>
              )}
            </article>

            <article className="referrals-card">
              <div className="section-heading">
                <h2>Referral &amp; rewards</h2>
                <span className="tag-pill">InfoFi ready</span>
              </div>
              <p className="section-caption">
                Share your link, let frens mint, and watch your NexDomains
                earnings stack over time.
              </p>

              <div className="referral-code-box">
                <div>
                  <div className="referral-label">Your referral link</div>
                  <div
                    className="referral-code-text"
                    ref={referralLinkRef}
                  >
                    {referralLink || 'Register a domain to get your referral link'}
                  </div>
                </div>
                {referralLink && (
                  <button
                    className={`referral-copy-btn ${copied ? 'copied' : ''}`}
                    onClick={copyReferralLink}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>

              <div className="referral-bullets">
                <p>• Earn {currentPct}% of fees whenever someone mints using your link.</p>
                <p>• Start at 25% and unlock 30% after 5 successful referrals.</p>
                <p>• Rewards sent directly to your wallet on registration.</p>
              </div>
            </article>
          </section>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <section className="footer-promo">
            <div className="footer-promo-bg" />
            <h2 className="footer-title">
              Explore the NexDomains
              <br />
              Ecosystem
            </h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="https://academy.nexdomains.com/courses/all" target="_blank" rel="noopener noreferrer">
                <button className="footer-btn" type="button">
                  Visit Academy
                </button>
              </a>
              <a href="https://safupad.xyz" target="_blank" rel="noopener noreferrer">
                <button className="footer-btn" type="button" style={{ background: 'linear-gradient(135deg, #FFB000 0%, #FFD700 100%)', color: '#000' }}>
                  Launch SafuPad
                </button>
              </a>
            </div>
          </section>

          <div className="footer-actions">
            <a href="https://nexdomains.gitbook.io/nexdomains-docs/" target="_blank" rel="noopener noreferrer">
              <button className="footer-chip" type="button">
                📄 Documentation
              </button>
            </a>
            <a href="https://nexdomains.com" target="_blank" rel="noopener noreferrer">
              <button className="footer-chip" type="button">
                🌐 Main Website
              </button>
            </a>
          </div>

          <div className="footer-copy">NexDomains 2025. All rights reserved.</div>
        </div>
      </footer>
    </>
  );
}
