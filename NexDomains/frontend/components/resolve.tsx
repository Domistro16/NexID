'use client';

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { keccak256, toBytes, zeroAddress } from 'viem'
import { useAccount } from 'wagmi'
import dynamic from 'next/dynamic'
import Update from './updateTextRecords'
import Unwrap from './unwrap'
import ChangeResolver from './changeResolver'
import Wrap from './wrap'
import { constants } from '../constant'
import { shortenAddress, getCID } from '../utils/domainUtils'
import { getPermissions, getPermissionItems } from '../utils/fusePermissions'
import { useResolveData } from '../hooks/useResolveData'
import ProfileTab from './resolve/ProfileTab'
import { Switch } from '@headlessui/react'

// Dynamic import with SSR disabled to prevent canvas/fabric bundling issues
const DomainImage = dynamic(() => import('./DomainImage'), { ssr: false })

const THEME_KEY = 'nexid-theme'

const Resolve = () => {
  const router = useRouter()
  const params = useParams()
  const label = params.label as string
  const [expiry, setExpiry] = useState('')
  const [expiryTime, setExpiryTime] = useState('')
  const [graceExpiry, setGraceExpiry] = useState('')
  const [graceExpiryTime, setGraceExpiryTime] = useState('')
  const [tab, setTab] = useState('profile')
  const [isOpen, setIsOpen] = useState(false)
  const { address: walletAddress } = useAccount()
  const [next, setNext] = useState(1)
  const [resolverOpen, setResolverOpen] = useState(false)
  const [wrapOpen, setWrapOpen] = useState(false)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
    }

    // Listen for body class changes (when nav toggles dark mode)
    const observer = new MutationObserver(() => {
      const isDarkMode = document.body.classList.contains('dark-mode')
      setTheme(isDarkMode ? 'dark' : 'light')
    })

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    // Check initial state from body class
    if (document.body.classList.contains('dark-mode')) {
      setTheme('dark')
    }

    return () => observer.disconnect()
  }, [])

  const isDark = theme === 'dark'

  // Use custom hook for all data fetching
  const {
    available,
    wrapped,
    wrappedOwner,
    owner,
    manager,
    expires,
    gexpires,
    resolver,
    address,
    referrals,
    texts,
    accounts,
    others,
    fuseMask,
    primaryName,
    woname,
    oname,
    manname,
    isLoading,
    isPending,
    wLoading,
    ownerLoading,
    managerLoading,
    node,
  } = useResolveData(label as string, walletAddress as `0x${string}`)

  useEffect(() => {
    document.title = `${label}.id`
  }, [label])

  useEffect(() => {
    if (label != undefined && label.includes('.')) {
      router.push('/')
    }
  }, [])

  useEffect(() => {
    if (available === true) {
      router.push('/register/' + label)
    } else if (available === false) {
      setNext(0)
    }
  }, [available, router, label])

  useEffect(() => {
    if (expires && gexpires) {
      const tsSeconds = Number(expires)
      const date = new Date(tsSeconds * 1000)
      setExpiry(
        date.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      )
      setExpiryTime(
        date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
        }),
      )
      const tseSeconds = Number(gexpires)
      const gdate = new Date(tseSeconds * 1000)
      gdate.setDate(gdate.getDate() + 30)
      setGraceExpiry(
        gdate.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      )
      setGraceExpiryTime(
        gdate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
        }),
      )
    }
  }, [expires, gexpires])

  const perms = getPermissions(fuseMask)
  const permissionItems = getPermissionItems(perms)

  const handleRenewal = () => {
    if (walletAddress != wrappedOwner || owner) {
      setNext(0)
    } else {
      setNext(1)
    }
    setIsOpen(true)
  }

  const handleWrapper = () => {
    if (wrapped == true) {
      setIsOpen(true)
    } else {
      setWrapOpen(true)
    }
  }

  const img = others.find((record) => record.key === 'avatar')
    ? getCID(others.find((record) => record.key === 'avatar')!.value)
    : null

  // Card styles
  const cardStyle = {
    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
    backdropFilter: 'saturate(180%) blur(28px)',
    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.06)',
    borderRadius: '26px',
    boxShadow: isDark ? '0 25px 50px rgba(0,0,0,0.55)' : '0 22px 55px rgba(0,0,0,0.08)',
  }

  const tabStyle = (isActive: boolean) => ({
    padding: '10px 20px',
    background: 'transparent',
    border: 'none',
    fontSize: '16px',
    fontWeight: 600,
    color: isActive ? (isDark ? '#fff' : '#111') : (isDark ? '#888' : '#666'),
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    borderBottom: isActive ? `2px solid ${isDark ? '#fff' : '#111'}` : '2px solid transparent',
  })

  const buttonPrimaryStyle = {
    padding: '12px 24px',
    background: isDark ? '#fff' : '#111',
    color: isDark ? '#000' : '#fff',
    border: 'none',
    borderRadius: '40px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
    transition: 'all 0.25s ease',
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: `3px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
            borderTop: `3px solid ${isDark ? '#fff' : '#111'}`,
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div>
      <div className="hero-spacer" />
      <div className="flex flex-col mx-auto p-4 mb-20 md:mb-5 md:px-30 mt-10 lg:px-60">
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: isDark ? '#f8f8f8' : '#111', marginBottom: '20px' }}>
            {label as string}.id
          </h2>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
            <button
              style={tabStyle(tab === 'profile')}
              onClick={() => setTab('profile')}
            >
              Profile
            </button>
            <button
              style={tabStyle(tab === 'records')}
              onClick={() => setTab('records')}
            >
              Records
            </button>
            <button
              style={tabStyle(tab === 'ownership')}
              onClick={() => setTab('ownership')}
            >
              Ownership
            </button>
            {wrapped == true && (
              <button
                style={tabStyle(tab === 'permissions')}
                onClick={() => setTab('permissions')}
              >
                Permissions
              </button>
            )}
            <button
              style={tabStyle(tab === 'more')}
              onClick={() => setTab('more')}
            >
              More
            </button>
          </div>

          {/* Tab Content */}
          {tab == 'profile' ? (
            <ProfileTab
              label={label as string}
              texts={texts}
              accounts={accounts}
              others={others}
              address={address as string}
              isPending={isPending}
              wrapped={wrapped as boolean}
              wrappedOwner={wrappedOwner as string}
              owner={owner as string}
              wLoading={wLoading}
              ownerLoading={ownerLoading}
              managerLoading={managerLoading}
              manager={manager as string}
              expiry={expiry}
              primaryName={primaryName as string}
              referrals={Number(referrals)}
              walletAddress={walletAddress as string}
              handleRenewal={handleRenewal}
              expires={expires as bigint}
              isOpen={isOpen}
              setIsOpen={setIsOpen}
              next={next}
            />
          ) : tab == 'records' ? (
            <div style={{ ...cardStyle, padding: '24px' }}>
              {texts.length > 0 ? (
                <div>
                  <div style={{ fontWeight: 600, color: isDark ? '#ccc' : '#333', marginBottom: '12px' }}>
                    Text
                    <span style={{ fontWeight: 400, fontSize: '14px', marginLeft: '12px', color: isDark ? '#888' : '#666' }}>
                      {texts.length} Records
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {texts.map((item) => (
                      <div
                        key={item.key}
                        style={{
                          background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                          padding: '12px 16px',
                          borderRadius: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '14px',
                        }}
                      >
                        <span style={{ color: isDark ? '#888' : '#666', fontWeight: 600, minWidth: '100px' }}>
                          {item.key}
                        </span>
                        <span style={{ color: isDark ? '#fff' : '#111', overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-all' }}>
                          {item.key === 'avatar' ? getCID(item.value) : item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontWeight: 600, color: isDark ? '#888' : '#666', fontSize: '14px' }}>
                  No Text Records
                </div>
              )}

              {address != zeroAddress ? (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontWeight: 600, color: isDark ? '#ccc' : '#333', marginBottom: '12px' }}>
                    Address
                  </div>
                  <div
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                      padding: '12px 16px',
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                    }}
                  >
                    <span style={{ color: isDark ? '#888' : '#666', fontWeight: 600, minWidth: '100px' }}>bsc</span>
                    <span style={{ color: isDark ? '#fff' : '#111', wordBreak: 'break-all' }}>{address as string}</span>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '20px', fontWeight: 600, color: isDark ? '#888' : '#666', fontSize: '14px' }}>
                  No Address
                </div>
              )}

              <Update
                texts={texts}
                label={label as string}
                owner={address as `0x${string}`}
                resolverAddress={constants.PublicResolver}
                setIsOpen={setIsOpen}
                isOpen={isOpen}
                image={img ? img : ''}
              />
              {wrappedOwner == walletAddress || owner == walletAddress ? (
                <button
                  style={{ ...buttonPrimaryStyle, marginTop: '20px' }}
                  onClick={() => setIsOpen(true)}
                >
                  Edit Records
                </button>
              ) : null}
            </div>
          ) : tab == 'ownership' ? (
            <div>
              <div style={{ ...cardStyle, padding: '24px', marginBottom: '20px' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: isDark ? '#fff' : '#111', paddingBottom: '16px', borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)' }}>
                  Roles
                </div>
                {wrapped == true ? (
                  <div>
                    <div style={{ padding: '16px 0', borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: isDark ? '#fff' : '#111', marginRight: '8px' }}>Owner:</span>
                      <span style={{ fontSize: '14px', color: isDark ? '#ccc' : '#333', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                        {woname as string}
                        {!(woname as string)?.startsWith('0x') && (
                          <span style={{ fontSize: '12px', color: isDark ? '#888' : '#666', marginLeft: '8px' }}>
                            ({shortenAddress(wrappedOwner as string)})
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: isDark ? '#fff' : '#111', marginRight: '8px' }}>BSC Record:</span>
                      <span style={{ fontSize: '14px', color: isDark ? '#ccc' : '#333' }}>
                        {shortenAddress(address as string)}
                      </span>
                    </div>
                  </div>
                ) : wrapped == false ? (
                  <div>
                    <div style={{ padding: '16px 0', borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: isDark ? '#fff' : '#111', marginRight: '8px' }}>Owner:</span>
                      <span style={{ fontSize: '14px', color: isDark ? '#ccc' : '#333', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                        {oname as string}
                        {!(oname as string)?.startsWith('0x') && (
                          <span style={{ fontSize: '12px', color: isDark ? '#888' : '#666', marginLeft: '8px' }}>
                            ({shortenAddress(owner as string)})
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: isDark ? '#fff' : '#111', marginRight: '8px' }}>Manager:</span>
                      <span style={{ fontSize: '14px', color: isDark ? '#ccc' : '#333', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                        {manname as string}
                        {!(manname as string)?.startsWith('0x') && (
                          <span style={{ fontSize: '12px', color: isDark ? '#888' : '#666', marginLeft: '8px' }}>
                            ({shortenAddress(manager as string)})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={{ ...cardStyle, padding: '0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                  <div style={{ padding: '24px', borderRight: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: isDark ? '#fff' : '#111' }}>Name Expires</div>
                    <div style={{ fontSize: '14px', marginTop: '4px', color: isDark ? '#ccc' : '#333' }}>
                      {expiry}
                      <span style={{ color: isDark ? '#888' : '#666', marginLeft: '8px' }}>{expiryTime}</span>
                    </div>
                  </div>
                  <div style={{ padding: '24px' }}>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: isDark ? '#fff' : '#111' }}>Grace Period Expires</div>
                    <div style={{ fontSize: '14px', marginTop: '4px', color: isDark ? '#ccc' : '#333' }}>
                      {graceExpiry}
                      <span style={{ color: isDark ? '#888' : '#666', marginLeft: '8px' }}>{graceExpiryTime}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : tab == 'permissions' ? (
            <section style={{ ...cardStyle, padding: '32px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: isDark ? '#fff' : '#111', marginBottom: '16px' }}>Permissions</h2>
              {permissionItems.map(({ key, label, description, allowed }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    marginTop: '12px',
                    background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                    borderRadius: '14px',
                  }}
                >
                  <div style={{ maxWidth: '80%' }}>
                    <div style={{ fontWeight: 500, color: isDark ? '#fff' : '#111' }}>{label}</div>
                    <div style={{ fontSize: '14px', color: isDark ? '#888' : '#666', marginTop: '4px' }}>
                      {description}
                    </div>
                  </div>
                  <Switch
                    checked={allowed}
                    disabled
                    className={`
                      ${allowed ? 'bg-blue-600' : isDark ? 'bg-gray-700' : 'bg-gray-200'}
                      relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    <span className="sr-only">Toggle setting</span>
                    <span
                      aria-hidden="true"
                      className={`
                        ${allowed ? 'translate-x-6' : 'translate-x-1'}
                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      `}
                    />
                  </Switch>
                </div>
              ))}
            </section>
          ) : tab == 'more' ? (
            <div>
              <section style={{ ...cardStyle, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px' }}>
                  <h1 style={{ fontSize: '20px', fontWeight: 700, color: isDark ? '#fff' : '#111' }}>Token</h1>
                  <a
                    href={`https://bscscan.com/nft/${wrapped == true
                      ? constants.NameWrapper + '/' + BigInt(node).toString(10)
                      : constants.BaseRegistrar + '/' + BigInt(keccak256(toBytes(label as string))).toString(10)
                      }`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: isDark ? '#fff' : '#111', fontWeight: 600, textDecoration: 'none' }}
                  >
                    BscScan
                  </a>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div
                      style={{
                        background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                        padding: '12px 16px',
                        borderRadius: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                      }}
                    >
                      <span style={{ color: isDark ? '#888' : '#666', minWidth: '60px' }}>hex</span>
                      <span style={{ color: isDark ? '#fff' : '#111', wordBreak: 'break-all' }}>{node}</span>
                    </div>
                    <div
                      style={{
                        background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                        padding: '12px 16px',
                        borderRadius: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                      }}
                    >
                      <span style={{ color: isDark ? '#888' : '#666', minWidth: '60px' }}>decimal</span>
                      <span style={{ color: isDark ? '#fff' : '#111', wordBreak: 'break-all' }}>{BigInt(node).toString(10)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                    <DomainImage
                      className="h-48 md:h-40 md:w-60"
                      domain={`${label}.id`}
                    />
                  </div>
                </div>
              </section>

              <section style={{ ...cardStyle, padding: '24px', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 700, color: isDark ? '#fff' : '#111', marginBottom: '16px' }}>Name Wrapper</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: '200px',
                      background: isDark ? 'rgba(20, 212, 107, 0.1)' : 'rgba(20, 212, 107, 0.1)',
                      padding: '12px 16px',
                      borderRadius: '14px',
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#14d46b',
                    }}
                  >
                    {wrapped == true ? 'Wrapped' : 'Unwrapped'}
                  </div>
                  {wrappedOwner == walletAddress || owner == walletAddress ? (
                    <button
                      style={buttonPrimaryStyle}
                      onClick={handleWrapper}
                    >
                      {wrapped == true ? 'Unwrap' : 'Wrap'}
                    </button>
                  ) : null}
                </div>
              </section>

              <section style={{ ...cardStyle, padding: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 700, color: isDark ? '#fff' : '#111', marginBottom: '16px' }}>Resolver</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: '200px',
                      background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                      padding: '12px 16px',
                      borderRadius: '14px',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: isDark ? '#fff' : '#111',
                      wordBreak: 'break-all',
                    }}
                  >
                    {resolver}
                  </div>
                  {wrappedOwner == walletAddress || owner == walletAddress ? (
                    <button
                      style={buttonPrimaryStyle}
                      onClick={() => setResolverOpen(true)}
                    >
                      Change Resolver
                    </button>
                  ) : null}
                </div>
              </section>

              <Unwrap
                label={label as string}
                setIsOpen={setIsOpen}
                isOpen={isOpen}
              />
              <Wrap
                label={label as string}
                setIsOpen={setWrapOpen}
                isOpen={wrapOpen}
              />
              <ChangeResolver
                label={label as string}
                setIsOpen={setResolverOpen}
                isOpen={resolverOpen}
                wrapped={wrapped as boolean}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default Resolve
