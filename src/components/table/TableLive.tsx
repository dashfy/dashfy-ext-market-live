import {
  generateReactKey,
  Widget,
  WidgetBody,
  WidgetErrorBoundary,
  WidgetHeader,
  WidgetLoader,
  WidgetTable,
  WidgetTableCell,
  WidgetTableHeadCell,
} from '@dashfy/ui'
import { format } from '@dashfy/utils'
import { ArrowDownIcon, ArrowUpIcon, RadioIcon } from 'lucide-react'
import * as React from 'react'

import { subscribeToPrice, unsubscribeFromPrice } from '@/lib/pythEngine'
import { getPythFeedDisplayPair, resolvePythFeedId } from '@/lib/resolveFeed'

export interface TableLiveFeed {
  /** Pyth feed ID: "crypto.BTC_USD", "equities.US_AAPL_USD", or key "BTC_USD" */
  id: string
  /** Optional display label */
  label?: string
}

const DEFAULT_FEEDS: TableLiveFeed[] = [
  { id: 'crypto.BTC_USD', label: 'Bitcoin' },
  { id: 'crypto.ETH_USD', label: 'Ethereum' },
  { id: 'crypto.SOL_USD', label: 'Solana' },
  { id: 'commodities.XAU_USD', label: 'Gold' },
  { id: 'commodities.XAG_USD', label: 'Silver' },
  { id: 'equities.US_AAPL_USD', label: 'Apple' },
  { id: 'equities.US_GOOG_USD', label: 'Google' },
  { id: 'equities.US_MSFT_USD', label: 'Microsoft' },
  { id: 'equities.US_AMZN_USD', label: 'Amazon' },
  { id: 'equities.US_META_USD', label: 'Meta' },
  { id: 'equities.US_TSLA_USD', label: 'Tesla' },
  { id: 'equities.US_NVDA_USD', label: 'NVIDIA' },
]

export interface TableLiveProps {
  /**
   * Custom widget title
   * @default 'Markets Live'
   */
  title?: string
  /**
   * Custom widget subject
   */
  subject?: string
  /**
   * Locale for price formatting
   * @default 'en-US'
   */
  locale?: string
  /**
   * List of Pyth feeds to display. Each feed shows Symbol, Price, and Trend.
   * @default BTC, ETH, SOL
   */
  feeds?: TableLiveFeed[]
  /**
   * Show trend arrow in the Price column
   * @default true
   */
  showTrend?: boolean
}

interface FeedState {
  price: number
  status: string
  trend: 'up' | 'down' | null
}

/**
 * Displays a table of live prices for a list of Pyth feeds.
 *
 * @example
 * ```json
 * {
 *   "extension": "market-live",
 *   "widget": "TableLive",
 *   "feeds": ["crypto.BTC_USD", "crypto.ETH_USD", "crypto.SOL_USD"]
 * }
 * ```
 *
 * @example
 * ```yaml
 * extension: market-live
 * widget: TableLive
 * feeds:
 *   - id: crypto.BTC_USD
 *     label: Bitcoin
 *   - id: crypto.ETH_USD
 *     label: Ethereum
 *   - id: crypto.SOL_USD
 *     label: Solana
 * ```
 *
 * @example
 * ```tsx
 * <TableLive feeds={[{ id: 'crypto.BTC_USD', label: 'Bitcoin' }, { id: 'crypto.ETH_USD', label: 'Ethereum' }, { id: 'crypto.SOL_USD', label: 'Solana' }]} />
 * ```
 */
export const TableLive = ({
  title = 'Markets Live',
  subject,
  locale = 'en-US',
  feeds = DEFAULT_FEEDS,
  showTrend = true,
}: TableLiveProps) => {
  const [feedStates, setFeedStates] = React.useState<Record<string, FeedState>>({})
  const prevPricesRef = React.useRef<Record<string, number>>({})
  const hasReceivedAnyUpdate = Object.keys(feedStates).length > 0

  const feedIdsKey = React.useMemo(() => feeds.map((feed) => feed.id).join(','), [feeds])
  const feedsRef = React.useRef(feeds)
  feedsRef.current = feeds

  React.useEffect(() => {
    const currentFeeds = feedsRef.current

    if (currentFeeds.length === 0) {
      return
    }

    const unsubscribeCallbacks: (() => void)[] = []

    for (const feed of currentFeeds) {
      let key: ReturnType<typeof resolvePythFeedId>

      try {
        key = resolvePythFeedId(feed.id)
      } catch {
        setFeedStates((prev) => ({
          ...prev,
          [feed.id]: {
            price: 0,
            status: 'Unknown',
            trend: null,
          },
        }))

        continue
      }

      const handleUpdate = (newPrice: number, newStatus: string) => {
        React.startTransition(() => {
          const prev = prevPricesRef.current[feed.id] ?? 0
          const trend = newPrice > prev ? 'up' : newPrice < prev ? 'down' : null
          prevPricesRef.current[feed.id] = newPrice
          setFeedStates((prevStates) => ({
            ...prevStates,
            [feed.id]: {
              price: newPrice,
              status: newStatus,
              trend: newStatus === 'Live' ? trend : null,
            },
          }))
        })
      }

      subscribeToPrice(key, handleUpdate)
      unsubscribeCallbacks.push(() => unsubscribeFromPrice(key, handleUpdate))
    }

    return () => {
      unsubscribeCallbacks.forEach((unsubscribeCallback) => unsubscribeCallback())
    }
  }, [feedIdsKey])

  // Show loader only until at least one feed has reported (so we see partial data)
  if (!hasReceivedAnyUpdate && feeds.length > 0) {
    return (
      <Widget>
        <WidgetHeader icon={<RadioIcon />} subject={subject} title={title} />
        <WidgetBody>
          <WidgetLoader />
        </WidgetBody>
      </Widget>
    )
  }

  return (
    <Widget>
      <WidgetHeader icon={<RadioIcon />} subject={subject} title={title} />
      <WidgetBody disablePadding scrollable>
        <WidgetErrorBoundary resetKeys={[feedIdsKey]}>
          <WidgetTable>
            <thead>
              <tr>
                <WidgetTableHeadCell>Symbol</WidgetTableHeadCell>
                <WidgetTableHeadCell align="right">Price</WidgetTableHeadCell>
                {showTrend && <WidgetTableHeadCell align="center">Trend</WidgetTableHeadCell>}
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => {
                const state = feedStates[feed.id]
                const label = feed.label ?? getPythFeedDisplayPair(feed.id) ?? feed.id
                const price = state?.price ?? 0
                const status = state?.status ?? 'Connecting'
                const trend = state?.trend

                return (
                  <tr key={generateReactKey('feed', feed.id)}>
                    <WidgetTableCell className="font-medium">{label}</WidgetTableCell>
                    <WidgetTableCell align="right">
                      {status === 'Live' ? (
                        <span className="tabular-nums">${format(price, '0.00', { locale })}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </WidgetTableCell>
                    {showTrend && (
                      <WidgetTableCell align="center">
                        {trend === 'up' && <ArrowUpIcon className="text-success mx-auto h-4 w-4" />}
                        {trend === 'down' && (
                          <ArrowDownIcon className="text-error mx-auto h-4 w-4" />
                        )}
                        {!trend && <span className="text-muted-foreground">—</span>}
                      </WidgetTableCell>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </WidgetTable>
        </WidgetErrorBoundary>
      </WidgetBody>
    </Widget>
  )
}
