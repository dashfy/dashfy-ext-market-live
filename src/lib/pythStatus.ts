/**
 * Centralized Pyth price status handling.
 * Status strings come from PriceStatus enum: Unknown, Trading, Halted, Auction, Ignored.
 * "Live" is used internally when price/confidence are available.
 */

/** Pyth statuses that indicate the price is unreliable or failed (show error UI). */
export const PYTH_ERROR_STATUSES: readonly string[] = [
  'Unknown',
  'Halted',
  'Ignored',
  'Auction',
] as const

/**
 * Returns true if the status indicates an error state.
 *
 * @param status - the Pyth price status to check
 * @returns whether the status means the price is unreliable
 * @example
 * ```ts
 * isPythErrorStatus('Halted')
 * // => true
 *
 * isPythErrorStatus('Live')
 * // => false
 * ```
 */
export function isPythErrorStatus(status: string): boolean {
  return PYTH_ERROR_STATUSES.includes(status)
}
