/**
 * Shortens an Ethereum address to display format
 * @param address - Full Ethereum address
 * @returns Shortened address in format: 0x1234...56789
 */
export function shortenAddress(address: string): string {
  if (address) {
    return `${address.slice(0, 4)}...${address.slice(-5).toUpperCase()}`
  } else {
    return '0x000...00000'
  }
}

/**
 * Extracts IPFS CID from a URL and returns the IPFS gateway URL
 * @param data - URL containing IPFS data
 * @returns IPFS gateway URL
 */
export function getCID(data: string): string {
  const parts = data.split('/ipfs/')
  const cid = parts[1]?.split('/')[0]
  return `https://ipfs.io/ipfs/${cid}`
}

/**
 * Formats a duration object into a readable string
 * @param duration - Duration object with years, months, days
 * @returns Formatted duration string
 */
export function formatDuration(duration: {
  years: number
  months: number
  days: number
}): string {
  return (
    (duration.years > 0
      ? ` ${duration.years} year${duration.years > 1 ? 's' : ''}`
      : '') +
    (duration.months > 0
      ? `${duration.years > 0 ? ',' : ''} ${duration.months} month${
          duration.months > 1 ? 's' : ''
        }`
      : '') +
    (duration.days > 0
      ? `${duration.months > 0 || duration.years > 0 ? ',' : ''} ${
          duration.days
        } day${duration.days > 1 ? 's' : ''}`
      : '')
  )
}
