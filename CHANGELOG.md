# @getdashfy/ext-market-live

## 0.2.1

### Patch Changes

- Require @getdashfy/ui ^0.3.1 and align @getdashfy/types dev dependency.

## 0.2.0

### Minor Changes

- Require @getdashfy/ui ^0.3.1 and align @getdashfy/types dev dependency.

## 0.1.1

### Patch Changes

- Update README documentation

## 0.1.0

### Initial Release

First public release of the Dashfy Market Live extension — widgets for streaming real-time asset prices from the Pyth Network oracle into a Dashfy dashboard, with no API key or server client required.

- **Price widget**: `PriceLive` with a rolling 1m/5m/15m chart and trend indicator.
- **Table widget**: `TableLive` for tracking many feeds at once.
- **Feed catalogs**: Roughly 2,900 generated Pyth feeds across crypto, equities, commodities, forex, and rates, addressable as `category.key`, bare key, or base58 address.
- **Shared connection engine**: `subscribeToPrice`/`unsubscribeFromPrice` reuse a single debounced Pythnet WebSocket across every widget.
- Full Dashfy theme (light/dark) support.
