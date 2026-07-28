import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { subscribeToPrice, unsubscribeFromPrice } from '@/lib/pythEngine'

import { TableLive } from './TableLive'

vi.mock('@/lib/pythEngine', () => ({
  subscribeToPrice: vi.fn(),
  unsubscribeFromPrice: vi.fn(),
}))

const oneFeed = [{ id: 'crypto.BTC_USD', label: 'Bitcoin' }] as const

describe('TableLive', () => {
  beforeEach(() => {
    vi.mocked(subscribeToPrice).mockImplementation((_key, cb) => {
      cb(42_000, 'Live')
    })
    vi.mocked(unsubscribeFromPrice).mockClear()
    vi.mocked(subscribeToPrice).mockClear()
  })

  it('shows loader until at least one feed reports', () => {
    vi.mocked(subscribeToPrice).mockImplementation(() => undefined)

    render(<TableLive feeds={[...oneFeed]} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders symbol, formatted price, and trend after Live update', async () => {
    render(<TableLive feeds={[...oneFeed]} />)

    await waitFor(() => {
      expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    })

    expect(screen.getByText(/\$42[,.]000\.00/)).toBeInTheDocument()
    expect(screen.getByText('Trend')).toBeInTheDocument()
  })

  it('calls unsubscribe for each subscribed feed on unmount', async () => {
    const { unmount } = render(<TableLive feeds={[...oneFeed]} />)

    await waitFor(() => {
      expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    })

    unmount()

    expect(unsubscribeFromPrice).toHaveBeenCalled()
  })

  it('derives symbol from feed id when label is omitted', async () => {
    render(<TableLive feeds={[{ id: 'crypto.SOL_USD' }]} />)

    await waitFor(() => {
      expect(screen.getByText('SOL/USD')).toBeInTheDocument()
    })
  })

  it('shows a dash for price when feed id cannot be resolved', async () => {
    render(<TableLive feeds={[{ id: 'notacategory.BTC_USD' }]} />)

    await waitFor(() => {
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
  })

  it('omits trend column when showTrend is false', async () => {
    render(<TableLive feeds={[...oneFeed]} showTrend={false} />)

    await waitFor(() => {
      expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    })

    expect(screen.queryByText('Trend')).not.toBeInTheDocument()
  })

  it('renders table without loader when feeds list is empty', () => {
    render(<TableLive feeds={[]} />)

    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.getByText('Markets Live')).toBeInTheDocument()
    expect(screen.getByText('Symbol')).toBeInTheDocument()
  })

  it('uses custom title', async () => {
    render(<TableLive feeds={[...oneFeed]} title="Watchlist" />)

    await waitFor(() => {
      expect(screen.getByText('Watchlist')).toBeInTheDocument()
    })
  })
})
