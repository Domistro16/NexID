/**
 * Centralized Logging Utility
 *
 * Provides environment-aware logging that only outputs in development mode
 * and can be easily extended with error tracking services (Sentry, etc.)
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  enabled: boolean
  minLevel: LogLevel
  prefix: string
}

/**
 * Default configuration based on environment
 */
const defaultConfig: LoggerConfig = {
  enabled: process.env.NODE_ENV !== 'production', // Only log in development
  minLevel: LogLevel.DEBUG,
  prefix: '[NexDomains]',
}

/**
 * Level priority for filtering
 */
const levelPriority: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
}

/**
 * Logger class
 */
class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config }
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false
    return levelPriority[level] >= levelPriority[this.config.minLevel]
  }

  /**
   * Format message with prefix and timestamp
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString()
    return `${this.config.prefix
      } [${level.toUpperCase()}] ${timestamp} - ${message}`
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    console.log(this.formatMessage(LogLevel.DEBUG, message), ...args)
  }

  /**
   * Log info message
   */
  info(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.INFO)) return
    console.info(this.formatMessage(LogLevel.INFO, message), ...args)
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.WARN)) return
    console.warn(this.formatMessage(LogLevel.WARN, message), ...args)
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.ERROR)) return

    const formattedMessage = this.formatMessage(LogLevel.ERROR, message)

    if (error instanceof Error) {
      console.error(
        formattedMessage,
        {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        ...args,
      )

      // TODO: Send to error tracking service (Sentry, etc.)
      // this.sendToErrorTracking(message, error)
    } else {
      console.error(formattedMessage, error, ...args)
    }
  }

  /**
   * Log transaction-related events
   */
  transaction(action: string, data?: any): void {
    this.info(`Transaction: ${action}`, data)
  }

  /**
   * Log contract interaction
   */
  contract(method: string, data?: any): void {
    this.debug(`Contract ${method}`, data)
  }

  /**
   * Future: Send to error tracking service
   */
  // private sendToErrorTracking(message: string, error: Error): void {
  //   // Example: Sentry integration
  //   // if (import.meta.env.PROD && window.Sentry) {
  //   //   window.Sentry.captureException(error, {
  //   //     tags: { component: 'logger' },
  //   //     extra: { message },
  //   //   })
  //   // }
  // }
}

/**
 * Global logger instance
 */
export const logger = new Logger()

/**
 * Create a namespaced logger
 */
export function createLogger(prefix: string): Logger {
  return new Logger({ prefix: `[${prefix}]` })
}

/**
 * Helper functions for common logging patterns
 */
export const log = {
  /**
   * Log only in development
   */
  dev: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEV]', ...args)
    }
  },

  /**
   * Log only in production
   */
  prod: (...args: any[]) => {
    if (process.env.NODE_ENV === 'production') {
      console.log('[PROD]', ...args)
    }
  },

  /**
   * Never log (for removing logs)
   */
  noop: (..._args: any[]) => {
    // Do nothing
  },
}

/**
 * Export default logger
 */
export default logger
