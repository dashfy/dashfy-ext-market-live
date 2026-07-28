import { PythConnection } from '@pythnetwork/client'
import type { PublicKey } from '@solana/web3.js'
import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PYTH_CRYPTO_FEEDS } from '@/lib/pyth-feeds'

interface PythInstance {
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  onPriceChangeVerbose: ReturnType<typeof vi.fn>
  lastHandler?: (product: unknown, priceAccount: MockPriceAccount) => void
}

interface MockPriceAccount {
  key: PublicKey
  accountInfo: {
    data: {
      price: number | null
      confidence: number | null
      status: number
    }
  }
}

const pythInstances = vi.hoisted(() => [] as PythInstance[])

vi.mock('@pythnetwork/client', () => {
  const PriceStatus = {
    0: 'Trading',
    1: 'Unknown',
    2: 'Halted',
    3: 'Auction',
    4: 'Ignored',
  }

  return {
    getPythClusterApiUrl: vi.fn(() => 'https://mock-rpc.example'),
    getPythProgramKeyForCluster: vi.fn(() => ({})),
    PriceStatus,
    PythConnection: vi.fn(
      (_conn: unknown, _prog: unknown, _commitment: string, feedIds: PublicKey[]) => {
        void feedIds
        const inst: PythInstance = {
          start: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn(),
          onPriceChangeVerbose: vi.fn(
            (cb: (product: unknown, priceAccount: MockPriceAccount) => void) => {
              inst.lastHandler = cb
            },
          ),
        }
        pythInstances.push(inst)
        return inst
      },
    ),
  }
})

async function loadPythEngine() {
  return import('./pythEngine')
}

beforeEach(() => {
  pythInstances.length = 0
  vi.resetModules()
  vi.clearAllMocks()
})

function makePriceAccount(
  key: PublicKey,
  data: { price: number | null; confidence: number | null; status: number },
): MockPriceAccount {
  return {
    key,
    accountInfo: {
      data: {
        price: data.price,
        confidence: data.confidence,
        status: data.status,
      },
    },
  }
}

/** Price notifications are deferred with queueMicrotask so tests must flush. */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
}

describe('pythEngine', () => {
  const btc = PYTH_CRYPTO_FEEDS.BTC_USD
  const eth = PYTH_CRYPTO_FEEDS.ETH_USD

  it('subscribes, starts PythConnection, and invokes callbacks with Live when price data is present', async () => {
    const { subscribeToPrice, getPythConnection } = await loadPythEngine()
    const cb = vi.fn()

    subscribeToPrice(btc, cb)

    await waitFor(() => {
      expect(pythInstances.length).toBe(1)
      expect(pythInstances[0]?.start).toHaveBeenCalled()
    })

    expect(getPythConnection()).not.toBeNull()

    const instance = pythInstances[0]
    expect(instance).toBeDefined()
    if (!instance) {
      return
    }

    const handler = instance.lastHandler
    expect(handler).toBeDefined()

    handler?.(null, makePriceAccount(btc, { price: 50_000, confidence: 25, status: 0 }))

    await flushMicrotasks()

    expect(cb).toHaveBeenCalledWith(50_000, 'Live')
  })

  it('invokes callbacks with a Pyth status string when price or confidence is missing', async () => {
    const { subscribeToPrice } = await loadPythEngine()
    const cb = vi.fn()

    subscribeToPrice(btc, cb)

    await waitFor(() => {
      expect(pythInstances[0]?.lastHandler).toBeDefined()
    })

    const inst0 = pythInstances[0]
    expect(inst0).toBeDefined()
    if (!inst0) {
      return
    }

    inst0.lastHandler?.(null, makePriceAccount(btc, { price: null, confidence: null, status: 1 }))

    await flushMicrotasks()

    expect(cb).toHaveBeenCalledWith(0, 'Unknown')
  })

  it('notifies multiple callbacks on the same feed', async () => {
    const { subscribeToPrice } = await loadPythEngine()
    const a = vi.fn()
    const b = vi.fn()

    subscribeToPrice(btc, a)
    subscribeToPrice(btc, b)

    await waitFor(() => {
      expect(pythInstances[0]?.lastHandler).toBeDefined()
    })

    const inst0 = pythInstances[0]
    expect(inst0).toBeDefined()
    if (!inst0) {
      return
    }

    inst0.lastHandler?.(null, makePriceAccount(btc, { price: 99, confidence: 1, status: 0 }))

    await flushMicrotasks()

    expect(a).toHaveBeenCalledWith(99, 'Live')
    expect(b).toHaveBeenCalledWith(99, 'Live')
  })

  it('rebuilds connection when feed set changes (stops previous connection)', async () => {
    const { subscribeToPrice } = await loadPythEngine()

    subscribeToPrice(btc, vi.fn())

    await waitFor(() => {
      expect(pythInstances.length).toBe(1)
    })

    const first = pythInstances[0]
    expect(first).toBeDefined()
    if (!first) {
      return
    }

    subscribeToPrice(eth, vi.fn())

    await waitFor(() => {
      expect(pythInstances.length).toBe(2)
    })

    expect(first.stop).toHaveBeenCalled()
  })

  it('does not create a new connection when subscribing twice to the same feed without changing the set', async () => {
    const { subscribeToPrice } = await loadPythEngine()

    subscribeToPrice(btc, vi.fn())
    subscribeToPrice(btc, vi.fn())

    await waitFor(() => {
      expect(pythInstances[0]?.start).toHaveBeenCalled()
    })

    expect(vi.mocked(PythConnection)).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes and stops the connection when the last callback is removed', async () => {
    const { subscribeToPrice, unsubscribeFromPrice } = await loadPythEngine()
    const callback = vi.fn()

    subscribeToPrice(btc, callback)

    await waitFor(() => {
      expect(pythInstances[0]?.start).toHaveBeenCalled()
    })

    const active = pythInstances[0]
    expect(active).toBeDefined()
    if (!active) {
      return
    }

    unsubscribeFromPrice(btc, callback)

    await waitFor(() => {
      expect(active.stop).toHaveBeenCalled()
    })
  })

  it('passes all subscribed feed public keys into PythConnection', async () => {
    const { subscribeToPrice } = await loadPythEngine()

    subscribeToPrice(btc, vi.fn())
    subscribeToPrice(eth, vi.fn())

    await waitFor(() => {
      expect(vi.mocked(PythConnection)).toHaveBeenCalled()
    })

    const lastCall = vi.mocked(PythConnection).mock.calls.at(-1)
    const feedIds = lastCall?.[3]

    expect(feedIds?.map((k) => k.toBase58()).sort()).toEqual(
      [btc.toBase58(), eth.toBase58()].sort(),
    )
  })

  it('does not spin microtasks while a slow start() is pending', async () => {
    let resolveStart: () => void = () => {
      // overridden when slowStart is invoked
    }
    const slowStart = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve
        }),
    )

    vi.mocked(PythConnection).mockImplementationOnce(() => {
      const inst: PythInstance = {
        start: slowStart,
        stop: vi.fn(),
        onPriceChangeVerbose: vi.fn(
          (cb: (product: unknown, priceAccount: MockPriceAccount) => void) => {
            inst.lastHandler = cb
          },
        ),
      }

      pythInstances.push(inst)

      return inst as unknown as PythConnection
    })

    const { subscribeToPrice, unsubscribeFromPrice } = await loadPythEngine()

    subscribeToPrice(btc, vi.fn())

    await waitFor(() => {
      expect(slowStart).toHaveBeenCalled()
    })

    // Slow start() is pending. Churn subscribers; with the buggy spin loop, the
    // microtask queue would never yield and the setTimeout below could not fire.
    for (let i = 0; i < 100; i += 1) {
      const cb = vi.fn()
      subscribeToPrice(eth, cb)
      unsubscribeFromPrice(eth, cb)
    }

    const tickFired = await new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 0)
    })

    expect(tickFired).toBe(true)

    resolveStart()
  })
})
