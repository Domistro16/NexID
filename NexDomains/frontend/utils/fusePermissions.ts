/**
 * ENS Name Wrapper fuse constants
 */
export const FUSES = {
  CANNOT_UNWRAP: 1 << 0, // 1
  CANNOT_BURN_FUSES: 1 << 1, // 2
  CANNOT_TRANSFER: 1 << 2, // 4
  CANNOT_SET_RESOLVER: 1 << 3, // 8
  CANNOT_SET_TTL: 1 << 4, // 16
  CANNOT_APPROVE: 1 << 6, // 64
} as const

/**
 * Checks permissions based on fuse mask
 * @param fuseMask - BigInt fuse mask from NameWrapper
 * @returns Object containing permission flags
 */
export function getPermissions(fuseMask: bigint) {
  const mask = Number(fuseMask)

  return {
    canUnwrap: !(mask & FUSES.CANNOT_UNWRAP),
    canBurnFuses: !(mask & FUSES.CANNOT_BURN_FUSES),
    canTransfer: !(mask & FUSES.CANNOT_TRANSFER),
    canSetResolver: !(mask & FUSES.CANNOT_SET_RESOLVER),
    canSetTTL: !(mask & FUSES.CANNOT_SET_TTL),
    canApprove: !(mask & FUSES.CANNOT_APPROVE),
  }
}

/**
 * Permission items configuration for UI display
 */
export function getPermissionItems(perms: ReturnType<typeof getPermissions>) {
  return [
    {
      key: 'unwrap',
      label: 'Unwrap name',
      description: 'Revert from wrapped to registry state',
      allowed: perms.canUnwrap,
    },
    {
      key: 'transfer',
      label: 'Transfer domain',
      description: 'Send your ENS name to another address',
      allowed: perms.canTransfer,
    },
    {
      key: 'approve',
      label: 'Approve operator',
      description:
        'The owner of this name can change the manager approved to renew subnames',
      allowed: perms.canApprove,
    },
    {
      key: 'setResolver',
      label: 'Change resolver',
      description: 'Point your name to a different resolver contract',
      allowed: perms.canSetResolver,
    },
    {
      key: 'setTTL',
      label: 'Set TTL',
      description: 'Change the time-to-live for DNS caches',
      allowed: perms.canSetTTL,
    },
    {
      key: 'burnFuses',
      label: 'Burn fuses',
      description: 'Permanently revoke additional permissions',
      allowed: perms.canBurnFuses,
    },
  ]
}
