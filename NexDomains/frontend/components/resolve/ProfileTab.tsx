import { Avatar } from '../useAvatar'
import { FastForwardIcon } from '@heroicons/react/solid'
import ReferralProgress from '../Refferal'
import { RiTelegramFill } from 'react-icons/ri'
import { FaXTwitter, FaYoutube } from 'react-icons/fa6'
import { IoMailSharp } from 'react-icons/io5'
import { FaRedditAlien } from 'react-icons/fa6'
import { IoLogoWhatsapp } from 'react-icons/io'
import { FaSnapchatGhost, FaGithub } from 'react-icons/fa'
import { SiBnbchain } from 'react-icons/si'
import { shortenAddress, getCID } from '../../utils/domainUtils'
// Renew removed in v2 - lifetime only
import React from 'react'
import { zeroAddress } from 'viem'

interface ProfileTabProps {
  label: string
  texts: Array<{ key: string; value: string }>
  accounts: Array<{ key: string; value: string }>
  others: Array<{ key: string; value: string }>
  address: string
  isPending: boolean
  wrapped: boolean
  wrappedOwner: string
  owner: string
  wLoading: boolean
  ownerLoading: boolean
  managerLoading: boolean
  manager: string
  expiry: string
  primaryName: string
  referrals: number
  walletAddress: string
  handleRenewal: () => void
  expires: bigint
  isOpen: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  next: number
}

const ProfileTab = ({
  label,
  texts,
  accounts,
  others,
  address,
  isPending,
  wrapped,
  wrappedOwner,
  owner,
  wLoading,
  ownerLoading,
  managerLoading,
  manager,
  expiry,
  primaryName,
  referrals,
  handleRenewal,
  expires,
  isOpen,
  setIsOpen,
  next,
}: ProfileTabProps) => {
  return (
    <div>
      <div className="rounded-xl bg-neutral-800 p-3 md:px-10 md:py-5 mt-5 border-[0.5px] border-gray-500 relative flex items-center">
        <Avatar
          name={`${label}.id`}
          className="w-15 h-15 md:w-24 md:h-24 mr-2 "
        />
        <div className="ml-1 md:ml-5 flex items-center w-[80%]">
          <div className="text-xl md:text-2xl font-bold grow-1">
            {label}.id
            {texts
              .filter((k) => k.key == 'description')
              .map((item) => (
                <div
                  key={item.key}
                  className="text-[10px] md:text-sm font-normal mt-2 max-w-90 break-all"
                >
                  {item.value}
                </div>
              ))}
          </div>
          <div className="px-4 py-2 bg-green-600/20 border border-green-500/30 rounded-lg mt-2 text-[12px] md:text-sm">
            <span className="text-green-400">✓ Lifetime</span>
          </div>
        </div>
      </div>
      {primaryName == `${label}.id` ? (
        <div>
          <ReferralProgress referrals={referrals ?? 0} />
        </div>
      ) : (
        ''
      )}

      {/* Metadata Card */}
      <div className="bg-neutral-800 rounded-xl p-4 md:p-6 mt-3 space-y-3 border-[0.5px] border-neutral-500">
        {accounts.length > 0 ? (
          <div>
            <div className="font-semibold text-gray-300 ml-1">Accounts</div>
            <div className="flex flex-wrap gap-2 ">
              {accounts.map((item) => (
                <a
                  key={item.key}
                  className="bg-gray-900 inline-block px-3 py-1 mt-2 text-sm rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105"
                  href={
                    item.key == 'com.twitter'
                      ? `https://x.com/${item.value}`
                      : item.key == 'org.telegram'
                        ? `https://t.me/${item.value}`
                        : item.key == 'com.reddit'
                          ? `https://reddit.com/user/${item.value}`
                          : item.key == 'com.whatsapp'
                            ? `https://wa.me/${item.value}`
                            : item.key == 'com.snapchat'
                              ? `https://snapchat.com/add/${item.value}`
                              : item.key == 'com.github'
                                ? `https://github.com/${item.value}`
                                : item.key == 'com.youtube'
                                  ? `https://x.com/${item.value}`
                                  : item.key == 'email'
                                    ? `mailto:${item.value}`
                                    : item.key == 'com.tiktok'
                                      ? `tiktok.com/${item.value}`
                                      : ''
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="flex items-center">
                    <span className="mr-2 font-bold text-xl">
                      {item.key == 'com.twitter' ? (
                        <FaXTwitter color="white" />
                      ) : item.key == 'org.telegram' ? (
                        <RiTelegramFill color="white" />
                      ) : item.key == 'com.reddit' ? (
                        <FaRedditAlien color="white" />
                      ) : item.key == 'com.whatsapp' ? (
                        <IoLogoWhatsapp color="white" />
                      ) : item.key == 'com.snapchat' ? (
                        <FaSnapchatGhost />
                      ) : item.key == 'com.github' ? (
                        <FaGithub color="white" />
                      ) : item.key == 'com.youtube' ? (
                        <FaYoutube color="white" />
                      ) : item.key == 'email' ? (
                        <IoMailSharp color="white" />
                      ) : item.key == 'com.tiktok' ? (
                        ''
                      ) : (
                        ''
                      )}
                    </span>
                    {item.value}
                  </div>
                </a>
              ))}
            </div>
          </div>
        ) : (
          ''
        )}
        {others.length > 0 ? (
          <div>
            <div className="font-semibold text-gray-300 ml-1">
              Other Records
            </div>
            <div className="flex flex-wrap gap-2 ">
              {others.map((item) => (
                <div
                  key={item.key}
                  className="bg-gray-900 max-w-full flex items-center px-3 py-1 mt-2 text-sm rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105"
                >
                  <span className="text-gray-400 mr-2 font-bold">
                    {item.key}
                  </span>
                  <span className="break-words overflow-hidden text-ellipsis">
                    {item.key === 'avatar' ? getCID(item.value) : item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          ''
        )}

        <div>
          {address != zeroAddress && (
            <div>
              <div className="font-semibold text-gray-300 ml-1">Addresses:</div>
              <div className="text-sm bg-gray-900 inline-block px-3 py-1 mt-2 rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105 cursor-pointer flex">
                <div className="flex items-center">
                  <span className="text-gray-400 mr-2 font-bold text-xl">
                    <SiBnbchain />
                  </span>{' '}
                  {!isPending ? shortenAddress(address as string) : ''}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="text-sm text-blue-500 cursor-pointer font-bold ml-1">
          Ownership → View
        </div>
        {wrapped == true ? (
          <div className="flex flex-wrap gap-2 text-sm mt-2">
            <div className="bg-gray-900 px-3 py-1 rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105">
              <span className="text-gray-400 mr-1 font-bold">owner </span>{' '}
              {!wLoading ? shortenAddress(`${wrappedOwner}`) : ''}
            </div>
            <div className="bg-gray-900 px-3 py-1 rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105">
              <span className="text-gray-400 mr-1 font-bold">expiry </span>{' '}
              {expiry}
            </div>
            <div className="bg-gray-900 px-3 py-1 rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105">
              <span className="text-gray-400 mr-1 font-bold">parent</span> id
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 text-sm mt-2">
            <div className="bg-gray-900 px-3 py-1 rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105">
              <span className="text-gray-400 mr-1 font-bold">manager </span>{' '}
              {!managerLoading ? shortenAddress(manager as string) : ''}
            </div>
            <div className="bg-gray-900 px-3 py-1 rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105">
              <span className="text-gray-400 mr-1 font-bold">owner </span>{' '}
              {!ownerLoading ? shortenAddress(owner as string) : ''}
            </div>
            <div className="bg-gray-900 px-3 py-1 rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105">
              <span className="text-gray-400 mr-1 font-bold">expiry </span>{' '}
              {expiry}
            </div>
            <div className="bg-gray-900 px-3 py-1 rounded-full hover:bg-gray-950 delay-200 duration-200 transition-all hover:scale-105">
              <span className="text-gray-400 mr-1 font-bold">parent</span> id
            </div>
          </div>
        )}
      </div>
      {/* v2: Renewals removed - all domains are lifetime */}
    </div>
  )
}

export default ProfileTab
