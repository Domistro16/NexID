'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { formatEther, namehash, keccak256, toBytes } from 'viem';
import { useAllOwnedNames } from '../hooks/getAllNames';
import { useReferralStats } from '../hooks/useReferralStats';
import { useENSName } from '../hooks/getPrimaryName';
import { usePaymentProfile } from '../hooks/usePaymentProfile';
import { useTextRecords } from '../hooks/getTextRecords';
import { useReputation } from '../hooks/useReputation';
import { RISK_LABELS, TIERS, SLASH_AMOUNTS } from '../lib/reputation/constants';
import {
  LayoutGrid,
  Fingerprint,
  CreditCard,
  Award,
  History,
  Settings,
  TrendingUp,
  RefreshCw,
  Download,
  Check,
  Plus,
  Wallet,
  Twitter,
  Github,
  Activity,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Search,
  MoreVertical,
  Image as ImageIcon,
  Package,
  Star,
  X,
  CheckCircle,
  ExternalLink,
  AlertCircle,
  Loader2,
  Copy,
  Link,
  KeyRound,
} from 'lucide-react';
import { constants } from '../constant';
import Modal from 'react-modal';
import DomainImage from './DomainImage';
import { PaymentConfig } from './PaymentConfig';
import { usePrivy } from '@privy-io/react-auth';
import '../app/dashboard/dashboard.css';

if (typeof window !== 'undefined') {
  Modal.setAppElement(document.body);
}

// ── ABI Definitions (reused from profile) ──────────────────────────
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

const addrAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'addr',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const setTextAbi = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'node', type: 'bytes32' },
      { internalType: 'string', name: 'key', type: 'string' },
      { internalType: 'string', name: 'value', type: 'string' },
    ],
    name: 'setText',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const resolverAbiForRead = [
  {
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'resolver',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// ── Hooks ──────────────────────────────────────────────────────────
function useIsWrapped(name: string) {
  const { data: wrapped } = useReadContract({
    abi: isWrappedAbi,
    functionName: 'isWrapped',
    address: constants.NameWrapper,
    args: [namehash(name)],
  });
  return wrapped as boolean | undefined;
}

// ── Modal Props ────────────────────────────────────────────────────
interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
}

// ── Domain Image Modal ─────────────────────────────────────────────
function DomainImageModal({ isOpen, onClose, domain }: ActionModalProps) {
  return (
    <Modal isOpen={isOpen} onRequestClose={onClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: '#1a1a1a' }}>
        <button onClick={onClose} className="modal-close-btn" style={{ color: '#888' }}>
          <X size={24} />
        </button>
        <h2 className="modal-title" style={{ color: '#fff' }}>{domain}</h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DomainImage domain={domain} className="w-full max-w-md rounded-lg" />
        </div>
      </div>
    </Modal>
  );
}

// ── Change BSC Record Modal ────────────────────────────────────────
function ChangeBSCRecordModal({ isOpen, onClose, domain }: ActionModalProps) {
  const [bscAddress, setBscAddress] = useState('');
  const [step, setStep] = useState(0);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

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

  const handleClose = () => { setStep(0); setBscAddress(''); onClose(); };

  return (
    <Modal isOpen={isOpen} onRequestClose={handleClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: '#1a1a1a' }}>
        <button onClick={handleClose} className="modal-close-btn" style={{ color: '#888' }}><X size={24} /></button>
        {step === 0 ? (
          <>
            <h2 className="modal-title" style={{ color: '#fff' }}>Change BSC Record for {domain}</h2>
            <p className="modal-desc" style={{ color: '#aaa' }}>Enter the BSC address this domain should resolve to</p>
            <input value={bscAddress} onChange={(e) => setBscAddress(e.target.value)} placeholder={currentBscAddress || '0x...'} className="modal-input" style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }} />
            <div className="modal-buttons">
              <button onClick={handleClose} className="modal-btn-secondary" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>Cancel</button>
              <button onClick={handleSetBSCRecord} disabled={isPending || !bscAddress} className="modal-btn-primary" style={{ background: '#fff', color: '#000', opacity: (isPending || !bscAddress) ? 0.6 : 1 }}>
                {isPending ? 'Confirming...' : 'Update Record'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title" style={{ color: '#fff', textAlign: 'center' }}>BSC Record Updated!</h2>
            <p className="modal-desc" style={{ color: '#aaa', textAlign: 'center' }}>{domain} now resolves to {bscAddress.slice(0, 6)}...{bscAddress.slice(-4)}</p>
            {hash && <p style={{ color: '#888', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>TX: {hash}</p>}
            <button onClick={handleClose} className="modal-btn-primary" style={{ width: '100%', background: '#fff', color: '#000', marginTop: '16px' }}>Done</button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Wrap Modal ─────────────────────────────────────────────────────
function WrapModal({ isOpen, onClose, domain }: ActionModalProps) {
  const label = domain.replace(/\.id$/, '');
  const { address } = useAccount();
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState('');
  const { writeContractAsync: approveContract } = useWriteContract();
  const { writeContractAsync: wrapContract, data: hash } = useWriteContract();

  const handleWrap = async () => {
    const labelhash = keccak256(toBytes(label));
    try {
      setStep(1); setInfo('Approving wrapper contract...');
      await approveContract({ abi: approveAbi, address: constants.BaseRegistrar, functionName: 'approve', args: [constants.NameWrapper, labelhash] });
      setInfo('Wrapping name...');
      await wrapContract({ abi: wrapETH2LDAbi, address: constants.NameWrapper, functionName: 'wrapETH2LD', args: [label, address, 0, constants.PublicResolver] });
      setInfo('Wrap complete!');
    } catch (error) { console.error('Wrap error:', error); setInfo('Error wrapping name'); }
  };

  const handleClose = () => { setStep(0); setInfo(''); onClose(); };

  return (
    <Modal isOpen={isOpen} onRequestClose={handleClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: '#1a1a1a' }}>
        <button onClick={handleClose} className="modal-close-btn" style={{ color: '#888' }}><X size={24} /></button>
        {step === 0 ? (
          <>
            <h2 className="modal-title" style={{ color: '#fff' }}>Wrap {domain}</h2>
            <p className="modal-desc" style={{ color: '#aaa' }}>Wrapping your name gives you new features like permissions and subname control.</p>
            <div className="modal-buttons">
              <button onClick={handleClose} className="modal-btn-secondary" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>Cancel</button>
              <button onClick={handleWrap} className="modal-btn-primary" style={{ background: '#fff', color: '#000' }}>Wrap Name</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title" style={{ color: '#fff', textAlign: 'center' }}>{info}</h2>
            {hash && <p style={{ color: '#888', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>TX: {hash}</p>}
            {info === 'Wrap complete!' && <button onClick={handleClose} className="modal-btn-primary" style={{ width: '100%', background: '#fff', color: '#000', marginTop: '16px' }}>Done</button>}
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Unwrap Modal ───────────────────────────────────────────────────
function UnwrapModal({ isOpen, onClose, domain }: ActionModalProps) {
  const label = domain.replace(/\.id$/, '');
  const { address } = useAccount();
  const [step, setStep] = useState(0);
  const [ownerAddress, setOwnerAddress] = useState(address || '');
  const [managerAddress, setManagerAddress] = useState(address || '');
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const handleUnwrap = async () => {
    const labelhash = keccak256(toBytes(label));
    try {
      await writeContractAsync({ abi: unwrapETH2LDAbi, address: constants.NameWrapper, functionName: 'unwrapETH2LD', args: [labelhash, ownerAddress as `0x${string}`, managerAddress as `0x${string}`] });
      setStep(1);
    } catch (error) { console.error('Unwrap error:', error); }
  };

  const handleClose = () => { setStep(0); setOwnerAddress(address || ''); setManagerAddress(address || ''); onClose(); };

  return (
    <Modal isOpen={isOpen} onRequestClose={handleClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: '#1a1a1a' }}>
        <button onClick={handleClose} className="modal-close-btn" style={{ color: '#888' }}><X size={24} /></button>
        {step === 0 ? (
          <>
            <h2 className="modal-title" style={{ color: '#fff' }}>Unwrap {domain}</h2>
            <p className="modal-desc" style={{ color: '#aaa' }}>Owner address (receives the NFT)</p>
            <input value={ownerAddress} onChange={(e) => setOwnerAddress(e.target.value)} placeholder="Owner address" className="modal-input" style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }} />
            <p className="modal-desc" style={{ color: '#aaa', marginTop: '12px' }}>Manager address</p>
            <input value={managerAddress} onChange={(e) => setManagerAddress(e.target.value)} placeholder="Manager address" className="modal-input" style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }} />
            <div className="modal-buttons">
              <button onClick={handleClose} className="modal-btn-secondary" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>Cancel</button>
              <button onClick={handleUnwrap} disabled={isPending} className="modal-btn-primary" style={{ background: '#fff', color: '#000', opacity: isPending ? 0.6 : 1 }}>
                {isPending ? 'Confirming...' : 'Unwrap'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title" style={{ color: '#fff', textAlign: 'center' }}>Transaction Submitted</h2>
            <p className="modal-desc" style={{ color: '#aaa', textAlign: 'center' }}>Your unwrap transaction has been submitted.</p>
            {hash && <p style={{ color: '#888', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>TX: {hash}</p>}
            <button onClick={handleClose} className="modal-btn-primary" style={{ width: '100%', background: '#fff', color: '#000', marginTop: '16px' }}>Done</button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Set Primary Modal ──────────────────────────────────────────────
function SetPrimaryModal({ isOpen, onClose, domain }: ActionModalProps) {
  const [step, setStep] = useState(0);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const handleSetPrimary = async () => {
    try {
      await writeContractAsync({ abi: setNameAbi, address: constants.ReverseRegistrar, functionName: 'setName', args: [domain] });
      setStep(1);
    } catch (error) { console.error('Set primary error:', error); }
  };

  const handleClose = () => { setStep(0); onClose(); };

  return (
    <Modal isOpen={isOpen} onRequestClose={handleClose} closeTimeoutMS={300} className="modal-content" overlayClassName="modal-overlay">
      <div className="action-modal" style={{ background: '#1a1a1a' }}>
        <button onClick={handleClose} className="modal-close-btn" style={{ color: '#888' }}><X size={24} /></button>
        {step === 0 ? (
          <>
            <h2 className="modal-title" style={{ color: '#fff' }}>Set as Primary Name</h2>
            <p className="modal-desc" style={{ color: '#aaa' }}>Setting <strong>{domain}</strong> as your primary name will display it across dApps when you connect your wallet.</p>
            <div className="modal-buttons">
              <button onClick={handleClose} className="modal-btn-secondary" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>Cancel</button>
              <button onClick={handleSetPrimary} disabled={isPending} className="modal-btn-primary" style={{ background: '#fff', color: '#000', opacity: isPending ? 0.6 : 1 }}>
                {isPending ? 'Confirming...' : 'Set Primary'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title" style={{ color: '#fff', textAlign: 'center' }}>Primary Name Set!</h2>
            <p className="modal-desc" style={{ color: '#aaa', textAlign: 'center' }}>{domain} is now your primary name.</p>
            {hash && <p style={{ color: '#888', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>TX: {hash}</p>}
            <button onClick={handleClose} className="modal-btn-primary" style={{ width: '100%', background: '#fff', color: '#000', marginTop: '16px' }}>Done</button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Actions Dropdown ───────────────────────────────────────────────
function ActionsDropdown({ domain, isPrimary }: { domain: string; isPrimary: boolean }) {
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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div ref={dropdownRef} className="actions-dropdown-container">
        <button onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} className="actions-trigger-btn">
          <MoreVertical size={16} />
        </button>
        {isOpen && (
          <div className="actions-menu" onClick={(e) => e.stopPropagation()}>
            <button className="actions-menu-item" onClick={() => { setShowImageModal(true); setIsOpen(false); }}><ImageIcon size={14} /> View Image</button>
            <button className="actions-menu-item" onClick={() => { setShowResolverModal(true); setIsOpen(false); }}><Settings size={14} /> Change BSC Record</button>
            {isWrapped ? (
              <button className="actions-menu-item" onClick={() => { setShowUnwrapModal(true); setIsOpen(false); }}><Package size={14} /> Unwrap</button>
            ) : (
              <button className="actions-menu-item" onClick={() => { setShowWrapModal(true); setIsOpen(false); }}><Package size={14} /> Wrap</button>
            )}
            {!isPrimary && (
              <button className="actions-menu-item" onClick={() => { setShowPrimaryModal(true); setIsOpen(false); }}><Star size={14} /> Set as Primary</button>
            )}
          </div>
        )}
      </div>
      <DomainImageModal isOpen={showImageModal} onClose={() => setShowImageModal(false)} domain={domain} />
      <ChangeBSCRecordModal isOpen={showResolverModal} onClose={() => setShowResolverModal(false)} domain={domain} />
      <WrapModal isOpen={showWrapModal} onClose={() => setShowWrapModal(false)} domain={domain} />
      <UnwrapModal isOpen={showUnwrapModal} onClose={() => setShowUnwrapModal(false)} domain={domain} />
      <SetPrimaryModal isOpen={showPrimaryModal} onClose={() => setShowPrimaryModal(false)} domain={domain} />
    </>
  );
}

// ── Tab Definitions ────────────────────────────────────────────────
type TabId = 'overview' | 'identities' | 'payments' | 'reputation' | 'history' | 'settings';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={20} /> },
  { id: 'identities', label: 'My Identities', icon: <Fingerprint size={20} /> },
  { id: 'payments', label: 'Payments', icon: <CreditCard size={20} /> },
  { id: 'reputation', label: 'Reputation', icon: <Award size={20} /> },
  { id: 'history', label: 'History', icon: <History size={20} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
];

const REPUTATION_ALLOWLIST = new Set([
  '0xd83defba240568040b39bb2c8b4db7db02d40593',
]);

// ════════════════════════════════════════════════════════════════════
// ── Main Dashboard Component ───────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { exportWallet, user, ready: privyReady, authenticated } = usePrivy();
  const hasEmbeddedWallet = !!user?.linkedAccounts.find(
    (account) =>
      account.type === 'wallet' &&
      account.walletClientType === 'privy' &&
      account.connectorType === 'embedded'
  );
  const canExportKey = privyReady && authenticated && hasEmbeddedWallet;
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [copied, setCopied] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [payMode, setPayMode] = useState<'link' | 'invoice'>('link');
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDescription, setPayDescription] = useState('');
  const [payDomain, setPayDomain] = useState('');
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);
  const [generatedPayLink, setGeneratedPayLink] = useState('');
  const [invoiceClient, setInvoiceClient] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceItems, setInvoiceItems] = useState([{ description: '', amount: '' }]);

  // Settings state
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [recordValue, setRecordValue] = useState('');
  const [settingsDomain, setSettingsDomain] = useState('');

  // Data hooks
  const { domains, isLoading: domainsLoading } = useAllOwnedNames(address?.toLowerCase() || '');
  const { referralCount, totalEarnings, referralPct, isLoading: referralLoading } = useReferralStats(address);
  const { name: primaryName } = useENSName({ owner: address as `0x${string}` });

  // Payment profile for selected domain
  const { profile: paymentProfile, isLoading: paymentProfileLoading, refetch: refetchPaymentProfile } = usePaymentProfile(payDomain || '');

  // Set default pay domain when domains load
  useEffect(() => {
    if (domains.length > 0 && !payDomain) {
      setPayDomain(domains[0].name || '');
    }
  }, [domains, payDomain]);

  // Set default settings domain
  useEffect(() => {
    if (domains.length > 0 && !settingsDomain) {
      setSettingsDomain(domains[0].name || '');
    }
  }, [domains, settingsDomain]);

  // Resolver for settings domain
  const settingsLabel = settingsDomain.replace(/\.id$/, '');
  const { data: settingsResolver } = useReadContract({
    abi: resolverAbiForRead,
    functionName: 'resolver',
    address: constants.Registry,
    args: [namehash(settingsDomain || 'placeholder.id')],
  });

  // Text records for settings domain
  const socialKeys = ['com.twitter', 'com.github', 'com.discord', 'org.telegram', 'email', 'url', 'avatar', 'description'];
  const { records: textRecords, isLoading: textRecordsLoading } = useTextRecords({
    resolverAddress: (settingsResolver as `0x${string}`) || ('0x' as `0x${string}`),
    name: settingsDomain || 'placeholder.id',
    keys: socialKeys,
  });

  // Write contract for setting text records
  const { writeContractAsync: writeTextRecord, isPending: isSettingRecord } = useWriteContract();

  // ── Reputation state ──────────────────────────────────────────────
  const { reputation, isLoading: repLoading, error: repError, checkReputation, reset: resetReputation } = useReputation();
  const [repSearchAddress, setRepSearchAddress] = useState('');
  const [repAutoChecked, setRepAutoChecked] = useState(false);

  // Auto-check connected wallet on tab switch
  useEffect(() => {
    if (activeTab === 'reputation' && address && !repAutoChecked && !reputation) {
      checkReputation(address);
      setRepAutoChecked(true);
    }
  }, [activeTab, address, repAutoChecked, reputation, checkReputation]);

  const handleRepSearch = () => {
    const target = repSearchAddress.trim() || address;
    if (target) {
      checkReputation(target);
    }
  };

  // Computed
  const domainsOwned = domains.length;
  const hasReputationAccess =
    domainsOwned > 0 || (address ? REPUTATION_ALLOWLIST.has(address.toLowerCase()) : false);
  const totalReferrals = referralCount ? Number(referralCount) : 0;
  const earningsInUsdc = totalEarnings ? Number(formatEther(totalEarnings)) : 0;
  const currentPct = referralPct ? Number(referralPct) : 25;

  const displayName = useMemo(() => {
    if (primaryName && typeof primaryName === 'string' && primaryName.endsWith('.id')) return primaryName;
    if (domains.length > 0 && domains[0].name) return domains[0].name;
    if (address) return address.slice(0, 6) + '...' + address.slice(-4);
    return '';
  }, [primaryName, domains, address]);

  const referralDomain = useMemo(() => {
    if (primaryName && typeof primaryName === 'string' && primaryName.endsWith('.id')) return primaryName.replace('.id', '');
    if (domains.length > 0) return domains[0].name?.replace('.id', '') || '';
    return '';
  }, [primaryName, domains]);

  const referralLink = referralDomain ? `https://names.nexdomains.com?ref=${referralDomain}` : '';

  const copyToClipboard = (text: string) => {
    if (!text) return;
    const fallback = (t: string) => {
      const textarea = document.createElement('textarea');
      textarea.value = t;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); } catch (e) { console.warn('copy failed', e); }
      document.body.removeChild(textarea);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true); setToastVisible(true);
        setTimeout(() => { setCopied(false); setToastVisible(false); }, 2000);
      }).catch(() => {
        fallback(text);
        setCopied(true); setToastVisible(true);
        setTimeout(() => { setCopied(false); setToastVisible(false); }, 2000);
      });
    } else {
      fallback(text);
      setCopied(true); setToastVisible(true);
      setTimeout(() => { setCopied(false); setToastVisible(false); }, 2000);
    }
  };

  const formatDate = (timestamp: string | number) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // ── Not connected ────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="dashboard-container">
        <div className="dash-connect-prompt">
          <div className="dash-connect-icon">🔐</div>
          <h2>Connect Your Wallet</h2>
          <p>Please connect your wallet to access your dashboard and manage your .id domains.</p>
        </div>
      </div>
    );
  }

  // ── Tab content renderers ────────────────────────────────────────
  const renderOverview = () => (
    <div className="dash-fade-in">
      <div className="dash-header">
        <div>
          <h2 className="dash-title">Welcome back, {displayName.replace('.id', '')}</h2>
          <p className="dash-subtitle">Here is what&apos;s happening with your decentralized identity today.</p>
        </div>
        <button className="dash-refresh-btn" onClick={() => window.location.reload()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="dash-stats-grid">
        <div className="dash-stat-card">
          <div className="dash-stat-label">Domains Owned</div>
          <div className="dash-stat-val">{domainsLoading ? '...' : domainsOwned}</div>
          <div className="dash-stat-trend" style={{ color: '#1565C0' }}>
            {primaryName ? '1 Primary' : 'No primary set'}
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-label">Total Referrals</div>
          <div className="dash-stat-val">{referralLoading ? '...' : totalReferrals}</div>
          <div className="dash-stat-trend"><TrendingUp size={16} /> {currentPct}% commission</div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-label">Referral Earnings</div>
          <div className="dash-stat-val">{referralLoading ? '...' : `${earningsInUsdc.toFixed(2)} USDC`}</div>
          <div className="dash-stat-trend">Lifetime earnings</div>
        </div>
      </div>

      <div className="refer-section">
        <div className="refer-bg" />
        <div className="refer-content">
          <h3 className="refer-title">Invite Friends, Earn {currentPct}% Forever.</h3>
          <p className="refer-desc">Share your unique link. When someone mints a .id name, you instantly get {currentPct}% of the mint price sent to your wallet.</p>
          <div className="refer-input-group">
            <input type="text" className="refer-input" value={referralLink || 'Register a domain to get your referral link'} readOnly />
            {referralLink && (
              <button className={`refer-btn ${copied ? 'copied' : ''}`} onClick={() => copyToClipboard(referralLink)}>
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            )}
          </div>
        </div>
      </div>

      <h3 style={{ fontWeight: 700, fontSize: '20px', marginBottom: '24px' }}>Your Domains</h3>
      {domainsLoading ? (
        <p style={{ color: '#888' }}>Loading your domains...</p>
      ) : domains.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          <p style={{ marginBottom: '16px' }}>No domains found</p>
          <button className="dash-mint-btn" onClick={() => router.push('/')}>Register a Domain</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="d-table">
            <thead><tr><th>Domain</th><th>Status</th><th>Minted</th><th>Actions</th></tr></thead>
            <tbody>
              {domains.slice(0, 5).map((domain: any, i: number) => {
                const now = Math.floor(Date.now() / 1000);
                const isExpired = domain.expiryDate && Number(domain.expiryDate) < now;
                const isPrimary = primaryName === domain.name;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>
                      {domain.name}
                      {isPrimary && <span className="dash-status-pill primary" style={{ marginLeft: 8 }}>Primary</span>}
                    </td>
                    <td><span className={`dash-status-pill ${isExpired ? 'expired' : 'active'}`}>{isExpired ? 'Expired' : 'Active'}</span></td>
                    <td>{domain.createdAt ? formatDate(domain.createdAt) : '-'}</td>
                    <td><ActionsDropdown domain={domain.name} isPrimary={isPrimary} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {domains.length > 5 && (
        <button
          style={{ marginTop: '16px', color: '#666', fontWeight: 600, fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => setActiveTab('identities')}
        >
          View all {domains.length} domains →
        </button>
      )}
    </div>
  );

  const renderIdentities = () => (
    <div className="dash-fade-in">
      <div className="dash-header">
        <div>
          <h2 className="dash-title">My Identities</h2>
          <p className="dash-subtitle">Manage your .id domains and configurations.</p>
        </div>
        <button className="dash-mint-btn" onClick={() => router.push('/')}>Mint New ID</button>
      </div>

      {domainsLoading ? (
        <p style={{ color: '#888' }}>Loading...</p>
      ) : domains.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
          <p style={{ marginBottom: '16px' }}>No domains found. Mint your first .id identity!</p>
          <button className="dash-mint-btn" onClick={() => router.push('/')}>Register a Domain</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {domains.map((domain: any, i: number) => {
            const isPrimary = primaryName === domain.name;
            const now = Math.floor(Date.now() / 1000);
            const isExpired = domain.expiryDate && Number(domain.expiryDate) < now;
            const initial = domain.name ? domain.name[0].toUpperCase() : '?';
            return (
              <div key={i} className="identity-card">
                <div className="identity-card-left">
                  <div className={`identity-card-icon ${isPrimary ? '' : 'secondary'}`}>{initial}</div>
                  <div>
                    <div className="identity-card-name">
                      {domain.name}
                      {isPrimary && <span className="dash-status-pill primary">Primary</span>}
                      {isExpired && <span className="dash-status-pill expired">Expired</span>}
                    </div>
                    <div className="identity-card-sub">Lifetime Ownership</div>
                  </div>
                </div>
                <ActionsDropdown domain={domain.name} isPrimary={isPrimary} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const handleGeneratePayLink = async () => {
    if (!payDomain || !payAmount) return;
    const cleanName = payDomain.replace('.id', '');
    try {
      const response = await fetch(`/api/x402/${encodeURIComponent(cleanName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: payAmount,
          token: constants.USDC,
          chainId: 8453,
          description: payDescription || undefined,
        })
      });
      const data = await response.json();
      if (data.invoiceId) {
        setGeneratedPayLink(`https://names.nexid.fun/pay/${cleanName}/${data.invoiceId}`);
      } else {
        setGeneratedPayLink(`https://names.nexid.fun/pay/${cleanName}?amount=${payAmount}`);
      }
      setShowInvoicePreview(true);
    } catch {
      setGeneratedPayLink(`https://names.nexid.fun/pay/${cleanName}?amount=${payAmount}`);
      setShowInvoicePreview(true);
    }
  };

  const handleGenerateAlwaysOnLink = () => {
    if (!payDomain) return;
    const cleanName = payDomain.replace('.id', '');
    setGeneratedPayLink(`https://names.nexid.fun/pay/${cleanName}`);
    setShowInvoicePreview(true);
  };

  const handleGenerateInvoice = () => {
    if (!payDomain) return;
    const cleanName = payDomain.replace('.id', '');
    const total = invoiceItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    setGeneratedPayLink(`https://names.nexid.fun/pay/${cleanName}?amount=${total}&client=${encodeURIComponent(invoiceClient)}&due=${invoiceDueDate}`);
    setShowInvoicePreview(true);
  };

  const renderPayments = () => (
    <div className="dash-fade-in">
      <div className="dash-header">
        <div>
          <h2 className="dash-title">Payments</h2>
          <p className="dash-subtitle">Accept payments through your .id domain using x402.</p>
        </div>
      </div>

      {domains.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          <p style={{ marginBottom: '16px' }}>Register a domain to enable payments.</p>
          <button className="dash-mint-btn" onClick={() => router.push('/')}>Register a Domain</button>
        </div>
      ) : (
        <>
          <div className="dash-form-group" style={{ marginBottom: '24px' }}>
            <label className="dash-form-label">Payment Domain</label>
            <select
              className="dash-form-input"
              value={payDomain}
              onChange={(e) => { setPayDomain(e.target.value); setShowInvoicePreview(false); }}
            >
              {domains.map((d: any, i: number) => (
                <option key={i} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          {paymentProfileLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', marginBottom: '24px' }}>
              <Loader2 size={16} className="animate-spin" /> Loading payment profile...
            </div>
          ) : paymentProfile?.paymentEnabled ? (
            <div style={{ padding: '16px', background: 'rgba(0,200,83,0.08)', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(0,200,83,0.2)', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <CheckCircle size={16} style={{ color: '#00C853' }} />
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Payments Enabled</span>
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                <div>Payment Address: <code style={{ fontSize: '12px' }}>{paymentProfile.paymentAddress.slice(0, 6)}...{paymentProfile.paymentAddress.slice(-4)}</code></div>
                {paymentProfile.supportedChains.length > 0 && (
                  <div>Chains: {paymentProfile.supportedChains.map(c => c === 8453 ? 'Base' : `Chain ${c}`).join(', ')}</div>
                )}
              </div>
              <button
                onClick={() => setShowPaymentConfig(true)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Settings size={14} /> Edit
              </button>
            </div>
          ) : (
            <div style={{ padding: '16px', background: 'rgba(255,176,0,0.08)', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(255,176,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: '#FFB000' }} />
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Payment profile not configured</span>
              </div>
              <p style={{ fontSize: '13px', color: '#666', margin: '4px 0 0' }}>Set up your resolver&apos;s x402 payment profile to accept payments.</p>
              <div style={{ marginTop: '12px' }}>
                <button
                  className="dash-btn-primary"
                  onClick={() => setShowPaymentConfig(true)}
                  style={{ width: 'auto' }}
                >
                  Configure Payments
                </button>
              </div>
            </div>
          )}

          <div className="tabs-pill">
            <button className={`tab-pill-btn ${payMode === 'link' ? 'active' : ''}`} onClick={() => { setPayMode('link'); setShowInvoicePreview(false); }}>Payment Link</button>
            <button className={`tab-pill-btn ${payMode === 'invoice' ? 'active' : ''}`} onClick={() => { setPayMode('invoice'); setShowInvoicePreview(false); }}>Invoice</button>
          </div>

          {payMode === 'link' ? (
            <div className="pay-form">
              <div className="dash-form-group">
                <label className="dash-form-label">Amount (USDC)</label>
                <input type="number" className="dash-form-input" placeholder="0.00" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
              <div className="dash-form-group">
                <label className="dash-form-label">Description (Optional)</label>
                <input type="text" className="dash-form-input" placeholder="What is this for?" value={payDescription} onChange={(e) => setPayDescription(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="dash-btn-primary" onClick={handleGeneratePayLink} disabled={!payAmount || !payDomain}>
                  <Link size={16} /> Generate Payment Link
                </button>
                <button className="dash-btn-primary" onClick={handleGenerateAlwaysOnLink} disabled={!payDomain} style={{ background: '#111', color: '#fff' }}>
                  <Link size={16} /> Generate Always-On Link
                </button>
              </div>
            </div>
          ) : (
            <div className="pay-form">
              <div className="dash-form-group">
                <label className="dash-form-label">Client Email / Web3 ID</label>
                <input type="text" className="dash-form-input" placeholder="client@email.com or client.id" value={invoiceClient} onChange={(e) => setInvoiceClient(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="dash-form-group">
                  <label className="dash-form-label">Invoice Number</label>
                  <input type="text" className="dash-form-input" value={`#INV-${String(domains.length).padStart(3, '0')}`} readOnly />
                </div>
                <div className="dash-form-group">
                  <label className="dash-form-label">Due Date</label>
                  <input type="date" className="dash-form-input" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} />
                </div>
              </div>
              <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>
                  <span>Item</span><span>Amount (USDC)</span>
                </div>
                {invoiceItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input type="text" className="dash-form-input" style={{ flex: 2 }} placeholder="Item Description" value={item.description} onChange={(e) => {
                      const updated = [...invoiceItems];
                      updated[idx].description = e.target.value;
                      setInvoiceItems(updated);
                    }} />
                    <input type="number" className="dash-form-input" style={{ flex: 1 }} placeholder="0.00" value={item.amount} onChange={(e) => {
                      const updated = [...invoiceItems];
                      updated[idx].amount = e.target.value;
                      setInvoiceItems(updated);
                    }} />
                  </div>
                ))}
                <button style={{ fontSize: '12px', fontWeight: 700, color: '#FFB000', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setInvoiceItems([...invoiceItems, { description: '', amount: '' }])}>
                  <Plus size={12} /> Add Item
                </button>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '12px', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Total</span>
                  <span>{invoiceItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toFixed(2)} USDC</span>
                </div>
              </div>
              <button className="dash-btn-primary" onClick={handleGenerateInvoice} disabled={!invoiceClient || invoiceItems.every(i => !i.amount)}>
                Generate Invoice
              </button>
            </div>
          )}

          {showInvoicePreview && generatedPayLink && (
            <div className="invoice-preview">
              <div className="invoice-preview-header">
                <div className="invoice-preview-icon"><Check size={24} /></div>
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: '18px', color: '#33691E', margin: 0 }}>Generated Successfully</h4>
                  <p style={{ fontSize: '14px', color: '#558B2F', margin: 0 }}>Share this link to get paid via {payDomain}.</p>
                </div>
              </div>
              <div className="invoice-preview-link">{generatedPayLink}</div>
              <button style={{ fontSize: '14px', fontWeight: 700, color: '#111', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => copyToClipboard(generatedPayLink)}>
                <Copy size={14} /> Copy Link
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const closePaymentConfig = () => {
    setShowPaymentConfig(false);
    refetchPaymentProfile();
  };



  const renderReputation = () => {
    if (!hasReputationAccess) {
      return (
        <div className="dash-fade-in">
          <div className="dash-header">
            <div>
              <h2 className="dash-title">Reputation Score</h2>
              <p className="dash-subtitle">Reputation is unlocked when you own a .id domain.</p>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
            <Shield size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>You need a .id domain to access reputation</p>
            <p style={{ fontSize: '13px', marginBottom: '16px' }}>Register a domain to unlock reputation and security insights.</p>
            <button className="dash-mint-btn" onClick={() => router.push('/')}>Register a Domain</button>
          </div>
        </div>
      );
    }

    const score = reputation?.score ?? 0;
    const tier = reputation?.tier ?? 'Platinum';
    const tierConfig = Object.values(TIERS).find(t => t.label === tier) || TIERS.PLATINUM;
    const scoreColor = score >= 90 ? '#00C853' : score >= 70 ? '#64DD17' : score >= 40 ? '#FFB000' : '#FF3D00';
    const tierDescription = score >= 90
      ? 'Your identity is highly trusted by dApps.'
      : score >= 70
        ? 'Your identity has good standing.'
        : score >= 40
          ? 'Some risk flags detected on this wallet.'
          : 'Multiple risk flags detected. Proceed with caution.';

    // SVG circle calculations
    const circumference = 2 * Math.PI * 45; // ~283
    const strokeDashoffset = reputation
      ? circumference - (score / 100) * circumference
      : circumference;

    // All risk categories for the factors grid
    const allRiskCategories = Object.entries(SLASH_AMOUNTS) as [string, number][];
    const flaggedSet = new Set(reputation?.flags || []);

    return (
      <div className="dash-fade-in">
        <div className="dash-header">
          <div>
            <h2 className="dash-title">Reputation Score</h2>
            <p className="dash-subtitle">On-chain trust metric powered by GoPlus Security.</p>
          </div>
          {reputation && (
            <button className="dash-refresh-btn" onClick={() => {
              const target = repSearchAddress.trim() || address;
              if (target) checkReputation(target);
            }}>
              <RefreshCw size={16} /> Refresh
            </button>
          )}
        </div>

        {/* Search bar */}
        <div style={{
          display: 'flex', gap: '12px', marginBottom: '32px',
          background: '#fafafa', padding: '6px', borderRadius: '16px', border: '1px solid #eee',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', color: '#888' }}>
            <Search size={18} />
          </div>
          <input
            type="text"
            value={repSearchAddress}
            onChange={(e) => setRepSearchAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRepSearch()}
            placeholder={address ? `${address.slice(0, 6)}...${address.slice(-4)} (your wallet)` : 'Enter wallet address...'}
            style={{
              flex: 1, background: 'transparent', border: 'none', padding: '12px 0',
              fontSize: '14px', fontWeight: 500, fontFamily: 'monospace', outline: 'none',
            }}
          />
          <button
            onClick={handleRepSearch}
            disabled={repLoading}
            style={{
              background: '#111', color: 'white', padding: '10px 24px', borderRadius: '12px',
              fontWeight: 700, fontSize: '14px', border: 'none', cursor: 'pointer',
              opacity: repLoading ? 0.6 : 1, whiteSpace: 'nowrap',
            }}
          >
            {repLoading ? 'Checking...' : 'Check'}
          </button>
        </div>

        {repError && (
          <div style={{
            padding: '16px', background: 'rgba(255,61,0,0.08)', borderRadius: '12px',
            marginBottom: '24px', border: '1px solid rgba(255,61,0,0.2)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <AlertCircle size={16} style={{ color: '#FF3D00' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#FF3D00' }}>{repError}</span>
          </div>
        )}

        {repLoading && !reputation && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 600 }}>Analyzing wallet security...</p>
          </div>
        )}

        {reputation && (
          <>
            {/* Checked address label */}
            {reputation.address !== address?.toLowerCase() && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px',
                padding: '12px 16px', background: 'rgba(255,176,0,0.08)', borderRadius: '12px',
                border: '1px solid rgba(255,176,0,0.2)',
              }}>
                <Search size={14} style={{ color: '#FFB000' }} />
                <span style={{ fontSize: '13px', color: '#888' }}>
                  Showing results for <code style={{ fontWeight: 700, color: '#111', fontSize: '12px' }}>{reputation.address}</code>
                </span>
              </div>
            )}

            <div className="rep-grid">
              {/* Score card */}
              <div className="bento-card dark" style={{ textAlign: 'center' }}>
                <div style={{
                  display: 'inline-block', padding: '6px 16px', borderRadius: '100px', fontSize: '11px',
                  fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '1px',
                  background: `${tierConfig.color}22`, color: tierConfig.color, marginBottom: '20px',
                }}>
                  {tier}
                </div>
                <div className="rep-score-big">
                  <svg viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#333" strokeWidth="8" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke={scoreColor} strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                      style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s ease' }} />
                  </svg>
                  <div style={{ position: 'absolute' }}><div className="rep-val-big">{score}</div></div>
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '20px', color: 'white' }}>
                  {score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 40 ? 'Moderate Risk' : 'High Risk'}
                </h3>
                <p style={{ fontSize: '14px', color: '#888', margin: '8px 0 24px' }}>{tierDescription}</p>
                {reputation.isClean && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '10px', background: 'rgba(0,200,83,0.1)', borderRadius: '12px', marginBottom: '16px',
                  }}>
                    <ShieldCheck size={16} style={{ color: '#00C853' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#00C853' }}>No Risk Flags</span>
                  </div>
                )}
                <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>
                  Checked {new Date(reputation.checkedAt).toLocaleString()}
                </p>
              </div>

              {/* Factors */}
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '20px', marginBottom: '16px' }}>Security Analysis</h3>
                <div className="rep-factors-list">
                  {allRiskCategories.map(([flag, penalty]) => {
                    const isFlagged = flaggedSet.has(flag);
                    const label = RISK_LABELS[flag] || flag;
                    return (
                      <div className="rep-factor" key={flag} style={{
                        borderColor: isFlagged ? 'rgba(255,61,0,0.2)' : undefined,
                        background: isFlagged ? 'rgba(255,61,0,0.03)' : undefined,
                      }}>
                        <div className="rep-factor-icon" style={{
                          color: isFlagged ? '#FF3D00' : '#00C853',
                          background: isFlagged ? 'rgba(255,61,0,0.1)' : undefined,
                        }}>
                          {isFlagged ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontWeight: 700, fontSize: '14px', margin: 0 }}>{label}</h4>
                          <p style={{ fontSize: '12px', color: isFlagged ? '#FF3D00' : '#888', margin: 0 }}>
                            {isFlagged ? `Flagged (-${penalty} pts)` : 'Clean'}
                          </p>
                        </div>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: isFlagged ? '#FF3D00' : '#00C853',
                        }} />
                      </div>
                    );
                  })}
                </div>

                {/* Breakdown summary */}
                {!reputation.isClean && (
                  <div style={{
                    marginTop: '24px', padding: '20px', background: '#111', borderRadius: '16px',
                    border: '1px solid #222',
                  }}>
                    <h4 style={{ fontWeight: 700, fontSize: '14px', color: '#fff', marginBottom: '12px' }}>Score Breakdown</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '13px' }}>
                        <span>Starting Score</span><span style={{ color: '#fff', fontWeight: 700 }}>100</span>
                      </div>
                      {Object.entries(reputation.breakdown).map(([flag, penalty]) => (
                        <div key={flag} style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '13px' }}>
                          <span>{RISK_LABELS[flag] || flag}</span>
                          <span style={{ color: '#FF3D00', fontWeight: 700 }}>{penalty}</span>
                        </div>
                      ))}
                      <div style={{
                        borderTop: '1px solid #333', marginTop: '4px', paddingTop: '8px',
                        display: 'flex', justifyContent: 'space-between', fontSize: '14px',
                      }}>
                        <span style={{ fontWeight: 700, color: '#fff' }}>Final Score</span>
                        <span style={{ fontWeight: 800, color: scoreColor }}>{score}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!reputation && !repLoading && !repError && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
            <Shield size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Check any wallet&apos;s reputation</p>
            <p style={{ fontSize: '13px' }}>Enter an address above or click Check to scan your connected wallet.</p>
          </div>
        )}
      </div>
    );
  };

  const exportHistoryCSV = () => {
    if (domains.length === 0) return;
    const headers = ['Date', 'Event', 'Domain', 'Expiry', 'Status'];
    const now = Math.floor(Date.now() / 1000);
    const rows = domains.map((domain: any) => {
      const isExpired = domain.expiryDate && Number(domain.expiryDate) < now;
      return [
        domain.createdAt ? formatDate(domain.createdAt) : '-',
        'Registration',
        domain.name || '-',
        domain.expiryDate ? formatDate(domain.expiryDate) : 'Lifetime',
        isExpired ? 'Expired' : 'Active',
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexdomains-history-${address?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderHistory = () => (
    <div className="dash-fade-in">
      <div className="dash-header">
        <div>
          <h2 className="dash-title">History</h2>
          <p className="dash-subtitle">View all your transactions and events.</p>
        </div>
        <button className="dash-export-btn" onClick={exportHistoryCSV} disabled={domains.length === 0}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      {domainsLoading ? (
        <p style={{ color: '#888' }}>Loading...</p>
      ) : domains.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: '40px' }}>No transaction history yet.</p>
      ) : (
        <div className="table-container">
          <table className="d-table">
            <thead><tr><th>Date</th><th>Event</th><th>Domain</th><th>Expiry</th><th>Status</th></tr></thead>
            <tbody>
              {domains.map((domain: any, i: number) => {
                const now = Math.floor(Date.now() / 1000);
                const isExpired = domain.expiryDate && Number(domain.expiryDate) < now;
                const isPrimary = primaryName === domain.name;
                return (
                  <tr key={i}>
                    <td>{domain.createdAt ? formatDate(domain.createdAt) : '-'}</td>
                    <td>
                      Registration
                      {isPrimary && <span className="dash-status-pill primary" style={{ marginLeft: 6, fontSize: '10px' }}>Primary</span>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{domain.name}</td>
                    <td>{domain.expiryDate ? formatDate(domain.expiryDate) : 'Lifetime'}</td>
                    <td><span className={`dash-status-pill ${isExpired ? 'expired' : 'completed'}`}>{isExpired ? 'Expired' : 'Active'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const socialConfig: { key: string; label: string; icon: React.ReactNode; placeholder: string }[] = [
    { key: 'com.twitter', label: 'X (Twitter)', icon: <Twitter size={20} />, placeholder: '@username' },
    { key: 'com.github', label: 'GitHub', icon: <Github size={20} />, placeholder: 'username' },
    { key: 'com.discord', label: 'Discord', icon: <Activity size={20} />, placeholder: 'username#1234' },
    { key: 'org.telegram', label: 'Telegram', icon: <ExternalLink size={20} />, placeholder: '@username' },
    { key: 'email', label: 'Email', icon: <CreditCard size={20} />, placeholder: 'you@email.com' },
    { key: 'url', label: 'Website', icon: <ExternalLink size={20} />, placeholder: 'https://yoursite.com' },
    { key: 'description', label: 'Bio', icon: <Fingerprint size={20} />, placeholder: 'A short description...' },
  ];

  const getRecordValue = (key: string) => {
    const record = textRecords.find(r => r.key === key);
    return record?.value || '';
  };

  const handleSaveRecord = async (key: string, value: string) => {
    if (!settingsDomain || !settingsResolver) return;
    try {
      await writeTextRecord({
        abi: setTextAbi,
        address: constants.PublicResolver,
        functionName: 'setText',
        args: [namehash(settingsDomain), key, value],
      });
      setEditingRecord(null);
      setRecordValue('');
    } catch (error) {
      console.error('Failed to set text record:', error);
    }
  };

  const renderSettings = () => (
    <div className="dash-fade-in">
      <div className="dash-header">
        <div>
          <h2 className="dash-title">Settings</h2>
          <p className="dash-subtitle">Manage your on-chain profile records.</p>
        </div>
      </div>

      <div className="pay-form">
        {domains.length > 0 && (
          <>
            <div className="dash-form-group">
              <label className="dash-form-label">Domain</label>
              <select
                className="dash-form-input"
                value={settingsDomain}
                onChange={(e) => { setSettingsDomain(e.target.value); setEditingRecord(null); }}
              >
                {domains.map((d: any, i: number) => (
                  <option key={i} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="dash-form-group">
              <label className="dash-form-label">Profile Records</label>
              {textRecordsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', padding: '12px' }}>
                  <Loader2 size={16} className="animate-spin" /> Loading records...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {socialConfig.map((social) => {
                    const currentValue = getRecordValue(social.key);
                    const isEditing = editingRecord === social.key;
                    return (
                      <div key={social.key} className={`settings-social-item ${currentValue ? '' : 'disconnected'}`}>
                        <div style={{ opacity: currentValue ? 1 : 0.5 }}>{social.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{social.label}</div>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                              <input
                                type="text"
                                className="dash-form-input"
                                style={{ fontSize: '13px', padding: '6px 10px' }}
                                value={recordValue}
                                onChange={(e) => setRecordValue(e.target.value)}
                                placeholder={social.placeholder}
                                autoFocus
                              />
                              <button
                                className="settings-social-btn connect"
                                style={{ whiteSpace: 'nowrap' }}
                                onClick={() => handleSaveRecord(social.key, recordValue)}
                                disabled={isSettingRecord}
                              >
                                {isSettingRecord ? '...' : 'Save'}
                              </button>
                              <button
                                className="settings-social-btn"
                                onClick={() => { setEditingRecord(null); setRecordValue(''); }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span className={`social-name ${currentValue ? '' : 'muted'}`} style={{ fontSize: '12px' }}>
                              {currentValue || `Not set`}
                            </span>
                          )}
                        </div>
                        {!isEditing && (
                          <button
                            className={`settings-social-btn ${currentValue ? '' : 'connect'}`}
                            onClick={() => { setEditingRecord(social.key); setRecordValue(currentValue); }}
                          >
                            {currentValue ? 'Edit' : 'Set'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <div className="dash-form-group">
          <label className="dash-form-label">Wallet Address</label>
          <div className="settings-social-item">
            <Wallet size={20} style={{ color: '#fff' }} />
            <span className="social-name" style={{ fontFamily: 'monospace', fontSize: '13px' }}>{address}</span>
            <button className="settings-social-btn" onClick={() => address && copyToClipboard(address)}>
              <Copy size={14} />
            </button>
          </div>
        </div>

        {canExportKey && (
          <div className="dash-form-group">
            <label className="dash-form-label">Embedded Wallet</label>
            <button
              onClick={exportWallet}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '14px',
                color: '#fff',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <KeyRound size={18} /> Export Private Key
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const tabContent: Record<TabId, () => React.ReactNode> = {
    overview: renderOverview,
    identities: renderIdentities,
    payments: renderPayments,
    reputation: renderReputation,
    history: renderHistory,
    settings: renderSettings,
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <>
      <div className="dashboard-container">
        <div className="dash-grid">
          <aside className="dash-sidebar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`dash-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </aside>

          <main className="dash-content">
            {tabContent[activeTab]()}
          </main>
        </div>
      </div>

      <Modal
        isOpen={showPaymentConfig}
        onRequestClose={closePaymentConfig}
        closeTimeoutMS={200}
        className="modal-content"
        overlayClassName="modal-overlay"
      >
        <div className="action-modal" style={{ background: '#1a1a1a' }}>
          <PaymentConfig name={payDomain.replace('.id', '')} onClose={closePaymentConfig} />
        </div>
      </Modal>

      <div className={`toast-notification ${toastVisible ? 'toast-active' : ''}`}>
        <CheckCircle size={16} style={{ color: '#00C853' }} /> Link Copied
      </div>
    </>
  );
}
