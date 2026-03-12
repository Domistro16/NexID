/**
 * Input Validation Utilities
 *
 * Centralized validation functions for user inputs across the application
 */

// Constants
export const VALIDATION_CONSTANTS = {
  MIN_YEARS: 1,
  MAX_YEARS: 1000,
  MIN_DOMAIN_LENGTH: 2,
  MAX_DOMAIN_LENGTH: 50,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL_REGEX: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
  TWITTER_REGEX: /^@?[A-Za-z0-9_]{1,15}$/,
  GITHUB_REGEX: /^[a-zA-Z0-9](?:[a-zA-z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
  PHONE_REGEX: /^\+?[\d\s\-\(\)]+$/,
  ADDRESS_REGEX: /^0x[a-fA-F0-9]{40}$/,
} as const

// Error messages
export const VALIDATION_ERRORS = {
  REQUIRED: 'This field is required',
  INVALID_EMAIL: 'Invalid email address',
  INVALID_URL: 'Invalid URL format',
  INVALID_TWITTER: 'Invalid Twitter handle',
  INVALID_GITHUB: 'Invalid GitHub username',
  INVALID_PHONE: 'Invalid phone number',
  INVALID_ADDRESS: 'Invalid Ethereum address',
  INVALID_DOMAIN: 'Invalid domain name',
  MIN_YEARS: `Minimum registration period is ${VALIDATION_CONSTANTS.MIN_YEARS} year`,
  MAX_YEARS: `Maximum registration period is ${VALIDATION_CONSTANTS.MAX_YEARS} years`,
  NOT_A_NUMBER: 'Please enter a valid number',
  NEGATIVE_NUMBER: 'Value cannot be negative',
  DOMAIN_TOO_SHORT: `Domain must be at least ${VALIDATION_CONSTANTS.MIN_DOMAIN_LENGTH} characters`,
  DOMAIN_TOO_LONG: `Domain cannot exceed ${VALIDATION_CONSTANTS.MAX_DOMAIN_LENGTH} characters`,
} as const

/**
 * Validation result type
 */
export interface ValidationResult {
  isValid: boolean
  error?: string
  sanitizedValue?: any
}

/**
 * Validate and sanitize year input for domain registration
 */
export function validateYears(value: string | number): ValidationResult {
  // Convert to string for initial validation
  const strValue = String(value).trim()

  // Check if empty
  if (!strValue) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.REQUIRED,
    }
  }

  // Check if it's a number
  const numValue = Number(strValue)
  if (isNaN(numValue)) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.NOT_A_NUMBER,
    }
  }

  // Check if it's an integer
  if (!Number.isInteger(numValue)) {
    return {
      isValid: false,
      error: 'Years must be a whole number',
    }
  }

  // Check if negative
  if (numValue < 0) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.NEGATIVE_NUMBER,
    }
  }

  // Check minimum
  if (numValue < VALIDATION_CONSTANTS.MIN_YEARS) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.MIN_YEARS,
      sanitizedValue: VALIDATION_CONSTANTS.MIN_YEARS,
    }
  }

  // Check maximum
  if (numValue > VALIDATION_CONSTANTS.MAX_YEARS) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.MAX_YEARS,
      sanitizedValue: VALIDATION_CONSTANTS.MAX_YEARS,
    }
  }

  return {
    isValid: true,
    sanitizedValue: numValue,
  }
}

/**
 * Validate email address
 */
export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim()

  if (!trimmed) {
    return { isValid: true, sanitizedValue: '' } // Email is optional
  }

  if (!VALIDATION_CONSTANTS.EMAIL_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.INVALID_EMAIL,
    }
  }

  return {
    isValid: true,
    sanitizedValue: trimmed.toLowerCase(),
  }
}

/**
 * Validate URL
 */
export function validateUrl(url: string): ValidationResult {
  const trimmed = url.trim()

  if (!trimmed) {
    return { isValid: true, sanitizedValue: '' } // URL is optional
  }

  if (!VALIDATION_CONSTANTS.URL_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.INVALID_URL,
    }
  }

  // Ensure URL has protocol
  let sanitized = trimmed
  if (!trimmed.match(/^https?:\/\//)) {
    sanitized = `https://${trimmed}`
  }

  return {
    isValid: true,
    sanitizedValue: sanitized,
  }
}

/**
 * Validate Twitter handle
 */
export function validateTwitter(handle: string): ValidationResult {
  const trimmed = handle.trim()

  if (!trimmed) {
    return { isValid: true, sanitizedValue: '' } // Twitter is optional
  }

  // Remove @ if present
  const cleanHandle = trimmed.replace(/^@/, '')

  if (!VALIDATION_CONSTANTS.TWITTER_REGEX.test(cleanHandle)) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.INVALID_TWITTER,
    }
  }

  return {
    isValid: true,
    sanitizedValue: cleanHandle,
  }
}

/**
 * Validate GitHub username
 */
export function validateGithub(username: string): ValidationResult {
  const trimmed = username.trim()

  if (!trimmed) {
    return { isValid: true, sanitizedValue: '' } // GitHub is optional
  }

  if (!VALIDATION_CONSTANTS.GITHUB_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.INVALID_GITHUB,
    }
  }

  return {
    isValid: true,
    sanitizedValue: trimmed,
  }
}

/**
 * Validate phone number
 */
export function validatePhone(phone: string): ValidationResult {
  const trimmed = phone.trim()

  if (!trimmed) {
    return { isValid: true, sanitizedValue: '' } // Phone is optional
  }

  if (!VALIDATION_CONSTANTS.PHONE_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.INVALID_PHONE,
    }
  }

  return {
    isValid: true,
    sanitizedValue: trimmed,
  }
}

/**
 * Validate Ethereum address
 */
export function validateAddress(address: string): ValidationResult {
  const trimmed = address.trim()

  if (!trimmed) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.REQUIRED,
    }
  }

  if (!VALIDATION_CONSTANTS.ADDRESS_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.INVALID_ADDRESS,
    }
  }

  return {
    isValid: true,
    sanitizedValue: trimmed,
  }
}

/**
 * Validate domain name
 */
export function validateDomain(domain: string): ValidationResult {
  const trimmed = domain.trim().toLowerCase()

  if (!trimmed) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.REQUIRED,
    }
  }

  // Remove .id suffix if present for length validation
  const baseDomain = trimmed.replace(/\.id$/, '')

  if (baseDomain.length < VALIDATION_CONSTANTS.MIN_DOMAIN_LENGTH) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.DOMAIN_TOO_SHORT,
    }
  }

  if (baseDomain.length > VALIDATION_CONSTANTS.MAX_DOMAIN_LENGTH) {
    return {
      isValid: false,
      error: VALIDATION_ERRORS.DOMAIN_TOO_LONG,
    }
  }

  // Check for valid characters (alphanumeric and hyphens, no leading/trailing hyphens)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(baseDomain)) {
    return {
      isValid: false,
      error: 'Domain can only contain letters, numbers, and hyphens (not at start/end)',
    }
  }

  return {
    isValid: true,
    sanitizedValue: baseDomain,
  }
}

/**
 * Sanitize text input (remove potentially dangerous characters)
 */
export function sanitizeText(text: string): string {
  return text
    .trim()
    .replace(/[<>]/g, '') // Remove HTML brackets
    .slice(0, 500) // Limit length
}

/**
 * Validate and sanitize all form fields
 */
export interface DomainFormData {
  years: number
  description: string
  email: string
  twitter: string
  website: string
  github: string
  discord: string
  phone: string
  avatar: string
}

export function validateDomainForm(data: Partial<DomainFormData>): {
  isValid: boolean
  errors: Partial<Record<keyof DomainFormData, string>>
  sanitized: Partial<DomainFormData>
} {
  const errors: Partial<Record<keyof DomainFormData, string>> = {}
  const sanitized: Partial<DomainFormData> = {}

  // Validate years (required)
  if (data.years !== undefined) {
    const yearsResult = validateYears(data.years)
    if (!yearsResult.isValid) {
      errors.years = yearsResult.error
    } else {
      sanitized.years = yearsResult.sanitizedValue
    }
  }

  // Validate email
  if (data.email !== undefined) {
    const emailResult = validateEmail(data.email)
    if (!emailResult.isValid) {
      errors.email = emailResult.error
    } else {
      sanitized.email = emailResult.sanitizedValue
    }
  }

  // Validate Twitter
  if (data.twitter !== undefined) {
    const twitterResult = validateTwitter(data.twitter)
    if (!twitterResult.isValid) {
      errors.twitter = twitterResult.error
    } else {
      sanitized.twitter = twitterResult.sanitizedValue
    }
  }

  // Validate website
  if (data.website !== undefined) {
    const urlResult = validateUrl(data.website)
    if (!urlResult.isValid) {
      errors.website = urlResult.error
    } else {
      sanitized.website = urlResult.sanitizedValue
    }
  }

  // Validate GitHub
  if (data.github !== undefined) {
    const githubResult = validateGithub(data.github)
    if (!githubResult.isValid) {
      errors.github = githubResult.error
    } else {
      sanitized.github = githubResult.sanitizedValue
    }
  }

  // Validate phone
  if (data.phone !== undefined) {
    const phoneResult = validatePhone(data.phone)
    if (!phoneResult.isValid) {
      errors.phone = phoneResult.error
    } else {
      sanitized.phone = phoneResult.sanitizedValue
    }
  }

  // Sanitize text fields
  if (data.description !== undefined) {
    sanitized.description = sanitizeText(data.description)
  }
  if (data.discord !== undefined) {
    sanitized.discord = sanitizeText(data.discord)
  }
  if (data.avatar !== undefined) {
    sanitized.avatar = data.avatar.trim()
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized,
  }
}
