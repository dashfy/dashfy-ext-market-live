import { PublicKey } from '@solana/web3.js'

import {
  PYTH_COMMODITIES_FEEDS,
  PYTH_CRYPTO_FEEDS,
  PYTH_EQUITIES_FEEDS,
  PYTH_FOREX_FEEDS,
  PYTH_RATES_FEEDS,
} from './pyth-feeds'

const FEED_MAP = {
  crypto: PYTH_CRYPTO_FEEDS,
  equities: PYTH_EQUITIES_FEEDS,
  commodities: PYTH_COMMODITIES_FEEDS,
  forex: PYTH_FOREX_FEEDS,
  rates: PYTH_RATES_FEEDS,
} as Record<string, Record<string, PublicKey>>

/** Solana base58 PublicKey is typically 32-44 chars. */
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** Matches default feed when `pythFeedId` is omitted (`PYTH_CRYPTO_FEEDS.BTC_USD`). */
const DEFAULT_DISPLAY_FEED_KEY = 'BTC_USD'

/**
 * Turn a Pyth feed key (e.g. `BTC_USD`, `EUR_JPY`) into a display pair (e.g. `BTC/USD`, `EUR/JPY`).
 *
 * @param key - the Pyth feed key to format
 * @returns the formatted display pair
 * @example
 * ```ts
 * formatFeedKeyAsPair('BTC_USD')
 * // => 'BTC/USD'
 *
 * formatFeedKeyAsPair('EUR_JPY')
 * // => 'EUR/JPY'
 * ```
 */
function formatFeedKeyAsPair(key: string): string {
  return key.replaceAll('_', '/')
}

/**
 * Human-readable pair for the widget subject when config uses a named feed.
 *
 * - Omitted `pythFeedId` → default crypto pair (e.g. `BTC/USD`).
 * - `crypto.BTC_USD`, `BTC_USD`, `forex.EUR_JPY` → segments joined with `/`.
 * - Raw base58 feed address only → `undefined` (no stable label without a reverse lookup).
 *
 * @param pythFeedId - the Pyth feed identifier to get the display pair for
 * @returns the display pair
 * @example
 * ```ts
 * getPythFeedDisplayPair('crypto.BTC_USD')
 * // => 'BTC/USD'
 *
 * getPythFeedDisplayPair('BTC_USD')
 * // => 'BTC/USD'
 *
 * getPythFeedDisplayPair('forex.EUR_JPY')
 * // => 'EUR/JPY'
 *
 * getPythFeedDisplayPair('GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU')
 * // => undefined
 * ```
 */
export function getPythFeedDisplayPair(pythFeedId: string | undefined): string | undefined {
  const trimmed = pythFeedId?.trim()

  if (!trimmed) {
    return formatFeedKeyAsPair(DEFAULT_DISPLAY_FEED_KEY)
  }

  if (BASE58_REGEX.test(trimmed)) {
    return undefined
  }

  const parts = trimmed.split('.')
  const key = parts.length >= 2 ? parts[1]! : trimmed

  return formatFeedKeyAsPair(key)
}

/**
 * Resolve a feed identifier from config to a Pyth price feed PublicKey.
 *
 * Supports:
 * - Base58 PublicKey string: "GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU"
 * - Category.key: "crypto.BTC_USD", "equities.US_AAPL_USD"
 * - Key only (defaults to crypto): "BTC_USD"
 *
 * @param value - the feed identifier to resolve
 * @returns the Pyth price feed PublicKey
 * @throws if the identifier cannot be resolved
 * @example
 * ```ts
 * resolvePythFeedId('crypto.BTC_USD')
 * // => PublicKey (GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU)
 *
 * resolvePythFeedId('BTC_USD')
 * // => same feed, category defaults to crypto
 *
 * resolvePythFeedId('equities.US_AAPL_USD')
 * // => PublicKey for the Apple equity feed
 *
 * resolvePythFeedId('nope.FAKE_USD')
 * // => throws 'Unknown feed category "nope"'
 * ```
 */
export function resolvePythFeedId(value: string): PublicKey {
  const trimmed = String(value).trim()

  if (!trimmed) {
    throw new Error('pythFeedId cannot be empty')
  }

  if (BASE58_REGEX.test(trimmed)) {
    return new PublicKey(trimmed)
  }

  const parts = trimmed.split('.')
  const category = parts.length >= 2 ? parts[0]! : 'crypto'
  const key = parts.length >= 2 ? parts[1]! : trimmed
  const feeds = FEED_MAP[category.toLowerCase()]

  if (!feeds) {
    throw new Error(
      `Unknown feed category "${category}". Use: crypto, equities, commodities, forex, rates`,
    )
  }

  const feed = feeds[key]

  if (!feed) {
    throw new Error(
      `Unknown feed "${key}" in ${category}. Check PYTH_${category.toUpperCase()}_FEEDS.`,
    )
  }

  return feed
}
