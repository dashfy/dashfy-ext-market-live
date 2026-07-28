/**
 * Pyth Engine - Singleton connection manager for Pyth price feeds.
 *
 * All widgets share a single Solana RPC connection and PythConnection,
 * reducing WebSocket usage when multiple price widgets are rendered.
 * Connection updates are debounced so rapid subscriptions (e.g. TableLive
 * with many feeds) trigger a single connection rebuild instead of N rebuilds.
 *
 * @example
 * ```tsx
 * // In a widget component (reuses shared connection):
 * import { subscribeToPrice, unsubscribeFromPrice, PYTH_CRYPTO_FEEDS, PYTH_EQUITIES_FEEDS } from '@getdashfy/ext-market-live'
 *
 * function MyPriceWidget() {
 *   const [price, setPrice] = useState(0)
 *   const feedId = PYTH_CRYPTO_FEEDS.BTC_USD  // or PYTH_EQUITIES_FEEDS.US_AAPL_USD
 *
 *   useEffect(() => {
 *     const handleUpdate = (newPrice: number, newStatus: string) => setPrice(newPrice)
 *     subscribeToPrice(feedId, handleUpdate)
 *     return () => unsubscribeFromPrice(feedId, handleUpdate)
 *   }, [])
 *
 *   return <div>${price}</div>
 * }
 * ```
 */

import type { PythCluster } from '@pythnetwork/client'
import {
  getPythClusterApiUrl,
  getPythProgramKeyForCluster,
  PriceStatus,
  PythConnection,
} from '@pythnetwork/client'
import type { PublicKey } from '@solana/web3.js'
import { Connection } from '@solana/web3.js'

export type PriceUpdateCallback = (price: number, status: string) => void

interface SubscriberEntry {
  callbacks: Set<PriceUpdateCallback>
  publicKey: PublicKey
  key: string
}

const PYTHNET_CLUSTER: PythCluster = 'pythnet'
const subscribers = new Map<string, SubscriberEntry>()
let connection: Connection | null = null
let pythConnection: PythConnection | null = null
let currentFeedIds: PublicKey[] = []
let connectionUpdateScheduled = false
let connectionUpdateRunning = false
let pendingUpdate = false

/**
 * Returns the singleton Solana connection.
 */
function getConnection(): Connection {
  connection ??= new Connection(getPythClusterApiUrl(PYTHNET_CLUSTER))
  return connection
}

/**
 * Creates a new Pyth connection for the given feed IDs.
 *
 * @param feedIds - The feed IDs to subscribe to
 * @returns A new Pyth connection
 * @throws If the connection fails to start
 */
function createPythConnection(feedIds: PublicKey[]): PythConnection {
  const conn = getConnection()
  const pythProgramKey = getPythProgramKeyForCluster(PYTHNET_CLUSTER)
  const pyth = new PythConnection(conn, pythProgramKey, 'confirmed', feedIds)

  pyth.onPriceChangeVerbose((_productAccount, priceAccount) => {
    const feedKey = priceAccount.key.toBase58()
    const subscriber = subscribers.get(feedKey)

    if (!subscriber) {
      return
    }

    const priceData = priceAccount.accountInfo.data
    const rawPrice = priceData.price
    const rawConfidence = priceData.confidence
    const rawStatus = priceData.status

    // Defer React updates so the WebSocket handler returns immediately and the browser
    // can process input (dashboard nav, etc.) between bursts of price ticks.
    queueMicrotask(() => {
      const sub = subscribers.get(feedKey)

      if (!sub) {
        return
      }

      if (rawPrice != null && rawConfidence != null) {
        sub.callbacks.forEach((cb) => cb(rawPrice, 'Live'))
      } else {
        const status = String(PriceStatus[rawStatus] ?? 'Unknown')
        sub.callbacks.forEach((cb) => cb(0, status))
      }
    })
  })

  return pyth
}

/**
 * Rebuilds the Pyth connection with all currently subscribed feeds.
 * Called once per "batch" of subscriptions (debounced).
 *
 * @throws If the connection fails to start
 */
async function ensureConnectionSync(): Promise<void> {
  const feedIds = Array.from(subscribers.values(), (subscriber) => subscriber.publicKey)

  if (feedIds.length === 0) {
    if (pythConnection) {
      void pythConnection.stop()
      pythConnection = null
      currentFeedIds = []
    }

    return
  }

  const newKeys = new Set(Array.from(subscribers.values(), (subscriber) => subscriber.key))
  const currentKeys = new Set(currentFeedIds.map((feedId) => feedId.toBase58()))
  const idsMatch =
    newKeys.size === currentKeys.size && [...newKeys].every((key) => currentKeys.has(key))

  if (idsMatch) {
    return
  }

  if (pythConnection) {
    void pythConnection.stop()
    pythConnection = null
  }

  currentFeedIds = feedIds
  pythConnection = createPythConnection(feedIds)

  try {
    await pythConnection.start()
  } catch {
    pythConnection = null
    currentFeedIds = []
    throw new Error(
      'PythEngine: failed to start connection. Network or WebSocket error. Error propagates to caller.',
    )
  }
}

/**
 * Schedules a connection update to run after the current sync work.
 *
 * Multiple subscriptions in the same tick trigger only one rebuild. While a
 * rebuild is running (e.g. awaiting `pythConnection.start()` over the network),
 * additional calls just set `pendingUpdate` so the runner re-checks once the
 * awaited work completes. This avoids a self-rescheduling microtask spin that
 * would starve tasks/I/O/paint/input until the network resolves and freeze the
 * UI on dashboard navigation while Market Prices is still loading.
 */
function scheduleConnectionUpdate(): void {
  pendingUpdate = true

  if (connectionUpdateRunning || connectionUpdateScheduled) {
    return
  }

  connectionUpdateScheduled = true

  queueMicrotask(() => {
    void runScheduledConnectionUpdate()
  })
}

/**
 * Runs the scheduled connection update.
 *
 * @returns A promise that resolves when the connection update is complete
 */
async function runScheduledConnectionUpdate(): Promise<void> {
  connectionUpdateScheduled = false

  if (connectionUpdateRunning) {
    return
  }

  connectionUpdateRunning = true

  try {
    while (pendingUpdate) {
      pendingUpdate = false
      await ensureConnectionSync()
    }
  } finally {
    connectionUpdateRunning = false
  }
}

/**
 * Returns the singleton Pyth connection, or `null` before the first subscription
 * has established one.
 *
 * @returns the shared `PythConnection`, or `null` when no feed is subscribed
 * @example
 * ```ts
 * const connection = getPythConnection()
 * if (connection) {
 *   await connection.stop()
 * }
 * ```
 */
export function getPythConnection(): PythConnection | null {
  return pythConnection
}

/**
 * Subscribe to price updates for a feed.
 * The callback receives (price, status) on each update.
 * Connection rebuild is debounced—safe to call many times in a loop.
 *
 * @param feedPublicKey - The public key of the feed to subscribe to
 * @param callback - The callback to receive the price updates
 */
export function subscribeToPrice(feedPublicKey: PublicKey, callback: PriceUpdateCallback): void {
  const key = feedPublicKey.toBase58()
  let subscriber = subscribers.get(key)

  if (!subscriber) {
    subscriber = {
      callbacks: new Set(),
      publicKey: feedPublicKey,
      key,
    }

    subscribers.set(key, subscriber)
  }

  subscriber.callbacks.add(callback)
  scheduleConnectionUpdate()
}

/**
 * Unsubscribe a callback from price updates for a feed.
 *
 * @param feedPublicKey - The public key of the feed to unsubscribe from
 * @param callback - The callback to unsubscribe from the price updates
 */
export function unsubscribeFromPrice(
  feedPublicKey: PublicKey,
  callback: PriceUpdateCallback,
): void {
  const key = feedPublicKey.toBase58()
  const subscriber = subscribers.get(key)

  if (!subscriber) {
    return
  }

  subscriber.callbacks.delete(callback)

  if (subscriber.callbacks.size === 0) {
    subscribers.delete(key)
  }

  // If no subscribers remain, eagerly tear down the in-flight connection so a
  // slow `start()` does not keep the WebSocket alive after the user navigates
  // away. The scheduled update below still reconciles state.
  if (subscribers.size === 0 && pythConnection) {
    void pythConnection.stop()
    pythConnection = null
    currentFeedIds = []
  }

  scheduleConnectionUpdate()
}
