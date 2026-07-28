import type { ChartConfig } from '@dashfy/ui'
import {
  ChartContainer,
  cn,
  useMode,
  Widget,
  WidgetBody,
  WidgetError,
  WidgetErrorBoundary,
  WidgetHeader,
  WidgetLoader,
} from '@dashfy/ui'
import { format } from '@dashfy/utils'
import type { LivelinePoint } from 'liveline'
import { Liveline } from 'liveline'
import { ArrowDownIcon, ArrowUpIcon, RadioIcon } from 'lucide-react'
import * as React from 'react'

import { PYTH_CRYPTO_FEEDS } from '@/lib/pyth-feeds'
import { subscribeToPrice, unsubscribeFromPrice } from '@/lib/pythEngine'
import { isPythErrorStatus } from '@/lib/pythStatus'
import { getPythFeedDisplayPair, resolvePythFeedId } from '@/lib/resolveFeed'

const CHART_WINDOW_SECS = 300
const MAX_CHART_POINTS = 500

const DEFAULT_FEED = PYTH_CRYPTO_FEEDS.BTC_USD

const CHART_WINDOW_OPTIONS = [
  { label: '1m', secs: 60 },
  { label: '5m', secs: 300 },
  { label: '15m', secs: 900 },
]

export interface PriceLiveProps {
  /**
   * Custom widget title
   * @default 'Price Live'
   */
  title?: string
  /**
   * Custom widget subject. When omitted, a label is derived from `feedId`
   * (e.g. `crypto.BTC_USD` → `BTC/USD`).
   */
  subject?: string
  /**
   * Locale for price formatting
   * @default 'en-US'
   */
  locale?: string
  /**
   * Pyth feed ID from config. Supports:
   * - Base58 PublicKey: "GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU"
   * - Category.key: "crypto.BTC_USD", "equities.US_AAPL_USD"
   * - Key only (defaults to crypto): "BTC_USD"
   * @default crypto.BTC_USD
   */
  feedId?: string
  /**
   * Show real-time Liveline chart below the price
   * @default true
   */
  showChart?: boolean
  /**
   * Show trend arrow next to the price
   * @default true
   */
  showTrend?: boolean
  /**
   * Whether to show time window buttons
   * @default true
   */
  showWindows?: boolean
}

/**
 * Displays the live price of a Pyth feed.
 *
 * @example
 * ```json
 * {
 *   "extension": "market-live",
 *   "widget": "PriceLive",
 *   "feedId": "crypto.BTC_USD"
 * }
 * ```
 *
 * @example
 * ```yaml
 * extension: market-live
 * widget: PriceLive
 * feedId: crypto.BTC_USD
 * ```
 *
 * @example
 * ```tsx
 * <PriceLive feedId="crypto.BTC_USD" />
 * ```
 */
export const PriceLive = ({
  title = 'Price Live',
  subject,
  locale = 'en-US',
  feedId,
  showChart = true,
  showTrend = true,
  showWindows = true,
}: PriceLiveProps) => {
  const { mode } = useMode()

  const feedPublicKey = React.useMemo(() => {
    if (feedId) {
      return resolvePythFeedId(feedId)
    }

    return DEFAULT_FEED
  }, [feedId])

  const headerSubject = subject ?? getPythFeedDisplayPair(feedId)

  const [price, setPrice] = React.useState<number>(0)
  const [status, setStatus] = React.useState<string>('Connecting')
  const [trend, setTrend] = React.useState<'up' | 'down' | null>(null)
  const [chartDataPoints, setChartDataPoints] = React.useState<LivelinePoint[]>([])

  const prevPriceRef = React.useRef<number>(0)
  const showChartRef = React.useRef(showChart)

  showChartRef.current = showChart

  React.useEffect(() => {
    const handlePriceUpdate = (newPrice: number, newStatus: string) => {
      React.startTransition(() => {
        setTrend(newPrice > prevPriceRef.current ? 'up' : 'down')
        prevPriceRef.current = newPrice
        setPrice(newPrice)
        setStatus(newStatus)

        if (showChartRef.current && newStatus === 'Live') {
          setChartDataPoints((prev) => {
            const timestamp = Date.now() / 1000
            const cutoff = timestamp - CHART_WINDOW_SECS
            const next = [...prev, { time: timestamp, value: newPrice }]
              .filter((point) => point.time > cutoff)
              .slice(-MAX_CHART_POINTS)
            return next
          })
        }
      })
    }

    subscribeToPrice(feedPublicKey, handlePriceUpdate)

    return () => {
      unsubscribeFromPrice(feedPublicKey, handlePriceUpdate)
    }
  }, [feedPublicKey])

  const formattedPrice = React.useMemo(() => format(price, '0.00', { locale }), [locale, price])

  if (isPythErrorStatus(status)) {
    return (
      <Widget>
        <WidgetHeader icon={<RadioIcon />} subject={headerSubject} title={title} />
        <WidgetBody>
          <WidgetError error="Failed to load price data" />
        </WidgetBody>
      </Widget>
    )
  }

  if (status !== 'Live') {
    return (
      <Widget>
        <WidgetHeader icon={<RadioIcon />} subject={headerSubject} title={title} />
        <WidgetBody>
          <WidgetLoader />
        </WidgetBody>
      </Widget>
    )
  }

  return (
    <Widget>
      <WidgetHeader icon={<RadioIcon />} subject={headerSubject} title={title} />
      <WidgetBody scrollable>
        <WidgetErrorBoundary resetKeys={[feedPublicKey]}>
          <div
            className={cn('flex h-full w-full flex-col gap-4', {
              'items-center justify-center': !showChart,
            })}
          >
            <div className="text-center">
              <div
                className="flex items-center justify-center text-4xl font-bold tracking-tighter"
                style={{ fontSize: '2.25rem' }}
              >
                <span className="tabular-nums">${formattedPrice}</span>
                {showTrend && (
                  <>
                    {trend === 'up' && <ArrowUpIcon className="text-success ml-2 h-8 w-8" />}
                    {trend === 'down' && <ArrowDownIcon className="text-error ml-2 h-8 w-8" />}
                  </>
                )}
              </div>
            </div>

            {showChart && (
              <ChartContainer
                className="h-full w-full shrink-0"
                config={{} satisfies ChartConfig}
                style={{ height: showWindows ? 'calc(100% - 102px)' : 'calc(100% - 70px)' }}
              >
                <Liveline
                  data={chartDataPoints}
                  formatValue={(value) => format(value, '0.00', { locale })}
                  loading={chartDataPoints.length === 0}
                  theme={mode}
                  value={price}
                  windows={showWindows ? CHART_WINDOW_OPTIONS : undefined}
                  exaggerate
                />
              </ChartContainer>
            )}
          </div>
        </WidgetErrorBoundary>
      </WidgetBody>
    </Widget>
  )
}
