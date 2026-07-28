import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'

import { PYTH_CRYPTO_FEEDS } from '@/lib/pyth-feeds'

import { getPythFeedDisplayPair, resolvePythFeedId } from './resolveFeed'

/** Example Pyth price feed account (base58), 32–44 chars — docstring in resolveFeed.ts */
const SAMPLE_BASE58_FEED = 'GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU'

describe('getPythFeedDisplayPair', () => {
  it('returns default BTC/USD when input is undefined or blank', () => {
    expect(getPythFeedDisplayPair(undefined)).toBe('BTC/USD')
    expect(getPythFeedDisplayPair('')).toBe('BTC/USD')
    expect(getPythFeedDisplayPair('   ')).toBe('BTC/USD')
  })

  it('returns undefined for a raw base58 feed address', () => {
    expect(getPythFeedDisplayPair(SAMPLE_BASE58_FEED)).toBeUndefined()
  })

  it('formats category.key feeds', () => {
    expect(getPythFeedDisplayPair('crypto.BTC_USD')).toBe('BTC/USD')
    expect(getPythFeedDisplayPair('forex.EUR_JPY')).toBe('EUR/JPY')
  })

  it('formats key-only ids as crypto-style pairs', () => {
    expect(getPythFeedDisplayPair('BTC_USD')).toBe('BTC/USD')
  })
})

describe('resolvePythFeedId', () => {
  const btcKey = PYTH_CRYPTO_FEEDS.BTC_USD

  it('resolves a valid base58 public key string', () => {
    const pk = resolvePythFeedId(SAMPLE_BASE58_FEED)
    expect(pk).toBeInstanceOf(PublicKey)
    expect(pk.toBase58()).toBe(SAMPLE_BASE58_FEED)
  })

  it('resolves category.key and key-only crypto feeds', () => {
    expect(resolvePythFeedId('crypto.BTC_USD').equals(btcKey)).toBe(true)
    expect(resolvePythFeedId('BTC_USD').equals(btcKey)).toBe(true)
  })

  it('throws when value is empty or whitespace', () => {
    expect(() => resolvePythFeedId('')).toThrow('pythFeedId cannot be empty')
    expect(() => resolvePythFeedId('   ')).toThrow('pythFeedId cannot be empty')
  })

  it('throws for unknown category', () => {
    expect(() => resolvePythFeedId('nope.BTC_USD')).toThrow(
      'Unknown feed category "nope". Use: crypto, equities, commodities, forex, rates',
    )
  })

  it('throws for unknown key in a valid category', () => {
    expect(() => resolvePythFeedId('crypto.NOT_A_REAL_KEY_XYZ')).toThrow(
      'Unknown feed "NOT_A_REAL_KEY_XYZ" in crypto.',
    )
  })
})
