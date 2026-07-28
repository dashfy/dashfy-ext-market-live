import { describe, expect, it } from 'vitest'

import { isPythErrorStatus, PYTH_ERROR_STATUSES } from './pythStatus'

describe('PYTH_ERROR_STATUSES', () => {
  it('lists known error-like Pyth status strings', () => {
    expect(PYTH_ERROR_STATUSES).toEqual(['Unknown', 'Halted', 'Ignored', 'Auction'])
  })
})

describe('isPythErrorStatus', () => {
  it.each(PYTH_ERROR_STATUSES)('returns true for %s', (status) => {
    expect(isPythErrorStatus(status)).toBe(true)
  })

  it('returns false for Live', () => {
    expect(isPythErrorStatus('Live')).toBe(false)
  })

  it('returns false for Trading', () => {
    expect(isPythErrorStatus('Trading')).toBe(false)
  })

  it('returns false for arbitrary strings', () => {
    expect(isPythErrorStatus('Connecting')).toBe(false)
    expect(isPythErrorStatus('')).toBe(false)
  })
})
