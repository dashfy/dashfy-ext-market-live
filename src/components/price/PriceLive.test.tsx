import type * as DashfyUi from '@getdashfy/ui'
import { render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { subscribeToPrice, unsubscribeFromPrice } from '@/lib/pythEngine'

import { PriceLive } from './PriceLive'

vi.mock('@/lib/pythEngine', () => ({
  subscribeToPrice: vi.fn(),
  unsubscribeFromPrice: vi.fn(),
}))

vi.mock('@getdashfy/ui', async () => {
  const actual = await vi.importActual<typeof DashfyUi>('@getdashfy/ui')
  return {
    ...actual,
    ChartContainer: ({
      children,
      ...rest
    }: React.ComponentProps<typeof DashfyUi.ChartContainer>) => (
      <div data-testid="chart-container" {...rest}>
        {children}
      </div>
    ),
  }
})

vi.mock('liveline', () => ({
  Liveline: () => <div data-testid="liveline-chart" />,
}))

describe('PriceLive', () => {
  beforeEach(() => {
    vi.mocked(subscribeToPrice).mockImplementation((_key, cb) => {
      cb(50_000, 'Live')
    })
    vi.mocked(unsubscribeFromPrice).mockClear()
    vi.mocked(subscribeToPrice).mockClear()
  })

  it('shows loader until the feed reports Live', () => {
    vi.mocked(subscribeToPrice).mockImplementation(() => undefined)

    render(<PriceLive />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText(/\$50/)).not.toBeInTheDocument()
  })

  it('renders formatted price and chart after Live update', async () => {
    render(<PriceLive />)

    await waitFor(() => {
      expect(screen.getByText(/\$50[,.]000\.00/)).toBeInTheDocument()
    })
    expect(screen.getByTestId('liveline-chart')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('calls unsubscribe when unmounted', async () => {
    const { unmount } = render(<PriceLive />)

    await waitFor(() => {
      expect(screen.getByText(/\$50[,.]000\.00/)).toBeInTheDocument()
    })

    unmount()

    expect(unsubscribeFromPrice).toHaveBeenCalled()
  })

  it('shows error UI when status is an error status', async () => {
    vi.mocked(subscribeToPrice).mockImplementation((_key, cb) => {
      cb(0, 'Unknown')
    })

    render(<PriceLive />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load price data')).toBeInTheDocument()
    })
  })

  it('uses custom title and subject', async () => {
    render(<PriceLive subject="ETH/USD" title="Spot" />)

    await waitFor(() => {
      expect(screen.getByText('Spot')).toBeInTheDocument()
    })
    expect(screen.getByText('ETH/USD')).toBeInTheDocument()
  })

  it('derives header subject from feedId when subject is omitted', async () => {
    render(<PriceLive feedId="crypto.ETH_USD" />)

    await waitFor(() => {
      expect(screen.getByText('ETH/USD')).toBeInTheDocument()
    })
  })

  it('hides chart when showChart is false', async () => {
    render(<PriceLive showChart={false} />)

    await waitFor(() => {
      expect(screen.getByText(/\$50[,.]000\.00/)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('liveline-chart')).not.toBeInTheDocument()
  })

  it('hides trend icons when showTrend is false', async () => {
    render(<PriceLive showTrend={false} />)

    await waitFor(() => {
      expect(screen.getByText(/\$50[,.]000\.00/)).toBeInTheDocument()
    })

    expect(document.querySelector('.lucide-arrow-up')).toBeNull()
    expect(document.querySelector('.lucide-arrow-down')).toBeNull()
  })
})
