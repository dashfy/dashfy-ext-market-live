import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => {
      const keys = Object.keys(store)
      return keys[index] ?? null
    },
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver for Recharts. The ChartContainer from @getdashfy/ui sizes itself
// from the observed entry, and jsdom has no layout engine, so an observer that never
// reports a size leaves charts at 0x0 and Recharts logs "The width(0) and height(0) of
// chart should be greater than 0". Report a fixed size so charts render as in a browser.
const OBSERVED_WIDTH = 800
const OBSERVED_HEIGHT = 400

const observedRect: DOMRectReadOnly = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: OBSERVED_WIDTH,
  bottom: OBSERVED_HEIGHT,
  width: OBSERVED_WIDTH,
  height: OBSERVED_HEIGHT,
  toJSON: () => ({}),
}

class ResizeObserverMock implements ResizeObserver {
  unobserve = vi.fn()

  disconnect = vi.fn()

  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element) {
    this.callback([{ target, contentRect: observedRect } as ResizeObserverEntry], this)
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
})

afterEach(() => {
  cleanup()
})
