# Alpaca Bridge – Production Upgrade Plan

This document turns the repo review into a concrete, staged upgrade plan to bring Alpaca Bridge (Massa, ASC‑driven lending with RWA‑NFT collateral) to production readiness. It groups changes into workstreams with scope, design notes, acceptance criteria, tests, and an execution timeline.

## Goals

- Close safety gaps in borrowing, repayment, liquidation, and auction flows.
- Make price/credit inputs reliable and governable (Oracle and PD/LGD→LTV model).
- Harden ASC automation, governance control, and on‑chain parameterization.
- Improve frontend correctness, performance, and UX for critical flows.
- Raise test coverage, add observability, and prepare repeatable deployments.

## Progress Log

- 2025-09-30 Phase 1 (P0 core safety + auctions)
  - [x] A1 Borrow LTV validation implemented in `assembly/contracts/LendingPool.ts` (borrow): computes max borrow from Vault PD/LGD/valuation and rejects over‑LTV.
  - [x] A2 Partial repayments implemented in `assembly/contracts/LendingPool.ts` (repay): interest‑first, principal next; position remains active until fully repaid; exact payoff closes and refunds overage.
  - [x] A3 Available liquidity checks for borrow in `assembly/contracts/LendingPool.ts`: rejects when `deposits < borrows + amount`.
  - [x] B1 Escrowed bidding in `assembly/contracts/LiquidationEngine.ts` (bid): uses `transferredCoins()` as bid amount; refunds previous highest bidder on outbid.
  - [x] B2 Finalization moves real coins to pool in `assembly/contracts/LiquidationEngine.ts` (finalizeAuction): sends coins with message to LendingPool; `assembly/contracts/LendingPool.ts` (closePositionFromLiquidation) verifies `transferredCoins()` and credits liquidity.
  - [x] B3 Vault governance setter for liquidation engine in `assembly/contracts/CollateralVault.ts` and governance bridge `setLiquidationEngineInVault` in `assembly/contracts/Governance.ts`.
  - [x] D1 Governance ASC control (stop): added `stopLendingPoolAccrual` and `stopRiskManagerEvaluation` in `assembly/contracts/Governance.ts`.
  - [x] Build validation: `npm run build` succeeds for all contracts.

Next up (Phase 2 P0 finishers):
- [x] C1 Oracle hardening: removed randomness in `autonomousUpdate`; added provider‑only `updateNFTProfile` for explicit updates; kept allowlist controls.
- [x] C2 Staleness windows: `RiskManager` checks `Oracle.NFT_UPDATE_*` and skips stale valuations; configurable window via governance.
- [x] D2 Parameter unification: governance‑set params added and wired
  - LendingPool: base rate, slope, min borrow, accrual interval setters and usage
  - RiskManager: liquidation threshold, evaluation interval, oracle staleness window setters and usage
  - LiquidationEngine: liquidation penalty setter and usage; threshold unified by reading RiskManager param
- [x] Governance bridges for all above setters
- [x] Build validation: `npm run build` succeeds

Phase 3 P0 frontend
- [x] Bid precision fix and coin‑based bidding in UI
- [x] Pre‑borrow validation using `RiskManager.calculateLTV`
- [x] Frontend build passes
- [x] Wallet NFT list reads live valuation from Oracle (and Vault for deposited) to reflect on‑chain volatility

## Current Gaps (Summary)

- Missing on‑chain LTV validation in `borrow` (risk of over‑borrowing).
- Repayment requires full payoff; no partial repayments supported.
- Auction bidding does not escrow funds; winning bids may be unfunded; finalization repays debt without moving coins.
- Liquidation engine is whitelisted in Vault by key but has no governance setter.
- Liquidation/risk thresholds inconsistent across modules; constants are duplicated.
- Cross‑contract state reads rely on raw storage keys (brittle coupling).
- ASC start/stop governance bridges are referenced by tooling but not implemented.
- Oracle has random autonomous updates (demo mode) and string‑based provider list.
- Unit precision inconsistencies in the frontend (1e6 vs 1e9); inefficient reads (blind scans); limited responsive UX.

Code pointers (for quick reference):
- Lending: `assembly/contracts/LendingPool.ts`
- Risk: `assembly/contracts/RiskManager.ts`
- Liquidation: `assembly/contracts/LiquidationEngine.ts`
- Vault: `assembly/contracts/CollateralVault.ts`
- Oracle: `assembly/contracts/Oracle.ts`
- Frontend: `front-end/src/components/*`, `front-end/src/hooks/*`
- Tooling: `scripts/interact.ts`, `scripts/deploy.ts`
- Constants: `assembly/utils/Constants.ts`

---

## Workstream A — Core Lending Safety (P0)

1) Borrow LTV validation
- Design: In `borrow(tokenId, amount)`, call `RiskManager.calculateLTV(tokenId, amount)`. If it returns `BASIS_POINTS` or `currentLTV > max`, reject. Ensure Vault has the NFT as collateral and ownership by caller.
- Acceptance:
  - Borrow reverts when requested amount exceeds on‑chain LTV limit.
  - Borrow succeeds within limit and updates totals/position.
  - Events include borrower, tokenId, amount, computed LTV.
- Tests:
  - Unit: over‑borrow reverts; borderline succeed; event contents.
  - Property: increasing `amount` monotonically increases computed LTV.

2) Partial repayments
- Design: Allow `repay(positionId)` with any positive `transferredCoins()`. Settle interest first, then principal; keep position active when residual principal > 0. Permit exact payoff and refund any excess.
- Acceptance:
  - Repaying < totalDebt reduces debt and keeps position active.
  - Repaying ≥ totalDebt closes position, removes from active set, and refunds overage.
- Tests: repay 25%/80%/100% flows; accrued interest ordering.

3) Available liquidity checks
- Design: Prevent withdrawals and new borrows when insufficient pool liquidity is available (track “cash” vs “total deposits”). Document the liquidity accounting model; align with Massa coin transfer semantics.
- Acceptance: Withdraw/borrow reverts if pool cannot cover coins to transfer.
- Tests: constrained liquidity scenarios.

4) Parameterize economic knobs
- Design: Move liquidation threshold, penalties, base rate/slope, min borrow, reserve factor, evaluation/accrual intervals into governance‑set storage (with sane defaults in Constants).
- Acceptance: Owner can update parameters; updates reflected by subsequent operations.
- Tests: parameter change propagates to rate/LTV logic.

---

## Workstream B — Liquidation and Auction Funds (P0)

1) Escrowed bidding
- Design: `bid(auctionId)` must use `transferredCoins()` as bid amount. Require `bid > max(currentHighest, startingPrice)`. Escrow coins in contract storage. Refund the previous highest bidder atomically upon outbid.
- Acceptance:
  - Outbid path refunds prior highest bidder.
  - No bids → no coins locked.
  - Events: bidder, amount, previousBidder refund, auctionId.
- Tests: outbids, equal bid rejections, refund delivery.

2) Finalization with real repayment
- Design: On `finalizeAuction(auctionId)` after end time:
  - Use escrowed winning bid coins to repay LendingPool. Prefer direct coin transfer to the pool address or `sendMessage` carrying coins; the pool verifies `transferredCoins()` and closes the position.
  - Transfer NFT ownership from Vault to winner via whitelisted call.
  - Distribute surplus per protocol (e.g., protocol fee + borrower refund) with real coin transfers.
- Acceptance: LendingPool total borrows decrease by principal; pool balance increases; Vault ownership changes; events emitted.
- Tests: with/without surplus; with no bids (flow to treasury or relist policy).

3) Vault whitelist & setters
- Design: Add governance bridge function to set `LIQUIDATION_ENGINE` inside Vault (and Risk/Lending where relevant). Enforce that only the configured liquidation engine may call `transferOwnership`.
- Acceptance: Governance can rotate the engine; unauthorized calls revert.
- Tests: rotation and unauthorized attempts.

4) Threshold consistency
- Design: Unify liquidation thresholds across RiskManager and LiquidationEngine via a single parameter (e.g., `LIQUIDATION_THRESHOLD_BPS`) stored in governance.
- Acceptance: Single source of truth; both modules consult the same value.
- Tests: changing the threshold alters both evaluation and trigger behavior.

---

## Workstream C — Oracle & Valuation (P0→P1)

1) Disable demo randomness in production
- Design: Make `autonomousUpdate` optional and disabled for mainnet deploy. Only allow authorized providers to set or update NFT profiles. Remove random drift from production builds.
- Acceptance: No random changes when disabled; only governed updates.
- Tests: provider add/remove; update calls only succeed from authorized addresses.

2) Provider registry hardening
- Design: Replace comma‑joined string with a mapping/set (or equivalent deterministic list) and explicit add/remove events. Add pagination read if needed.
- Acceptance: Adds/removes idempotent; fast membership checks; events present.
- Tests: membership edge cases; duplicate add/remove; iteration stability.

3) Single truth source for collateral data
- Design: Vault and RiskManager read prices/PD/LGD exclusively from Oracle getters; RWA_NFT keeps metadata only. Vault refresh hooks continue to sync from Oracle for deposited NFTs.
- Acceptance: No raw cross‑contract key reads; consistent values across modules.
- Tests: Oracle update propagates to Vault refresh and Risk calc.

4) Freshness and staleness
- Design: Oracle stores `lastUpdate` per token. Risk evaluation and liquidation should ignore data older than a configurable staleness window.
- Acceptance: Out‑of‑date prices cannot trigger liquidation; events warn.
- Tests: stale data paths; window reconfiguration.

---

## Workstream D — ASC Automation & Governance Bridges (P0)

1) Governance start/stop bridges
- Design: Implement in Governance:
  - `startLendingPoolAccrual()` → `sendMessage(LendingPool, 'startAccrual', …)`
  - `stopLendingPoolAccrual()` → `LendingPool.stopAccrual`
  - `startRiskManagerEvaluation()` → `RiskManager.startEvaluation`
  - `stopRiskManagerEvaluation()` → `RiskManager.stopEvaluation`
  - `setLiquidationEngineInVault(address)` → forward setter to Vault
- Acceptance: `scripts/interact.ts` commands succeed; ASC start/stop reflects in on‑chain flags and events.
- Tests: start/stop idempotency; unauthorized callers revert.

2) ASC scheduling consistency
- Design: Standardize `sendMessage` gas/validity computation (utility method or shared constants). Use consistent intervals from governance‑set parameters.
- Acceptance: All periodic tasks reschedule reliably; gas usage capped.
- Tests: long‑run simulation (slots), missed slot recovery, no duplicate work.

---

## Workstream E — Frontend Correctness & UX (P0→P1)

1) Unit precision and amounts
- Design: Ensure all amounts use 1e9 nanoMAS. Replace manual multipliers with `massa-web3` helpers (e.g., `Mas.fromString`) or shared util. Fix LiquidationPanel bid conversion.
- Acceptance: Bids/deposits/borrows/repayments match on‑chain units 1:1.
- Tests: UI → chain round‑trip amount tests; e2e on buildnet.

2) Pre‑borrow validation
- Design: On borrow forms, call `RiskManager.calculateLTV(tokenId, amount)` client‑side to show max borrow and health factor. Block submission if it would exceed LTV.
- Acceptance: Users cannot send invalid borrows; clear error/tooltip.
- Tests: UI validation matrix vs on‑chain results.

3) Efficient reads and responsiveness
- Design: Prefer `getActivePositions`, `getPositionCount`, and batch NFT getters over blind scanning. Add responsive breakpoints (single‑column on small screens), skeleton loaders, and consistent pending/retry toasts.
- Acceptance: Lower RPC load, smooth UX on mobile, consistent pending state.
- Tests: Rendering under slow RPC; mobile viewport checks.

4) Transaction UX
- Design: Unified operation waiting, retries, and error messages; show operation IDs and link to explorer (if available). Provide MAX buttons and health bars consistently.
- Acceptance: Fewer user errors; higher success rate.
- Tests: UX smoke tests; error path checks.

---

## Workstream F — Tests, Security & Quality (P0→P1)

1) Unit & integration tests
- Add tests for: LTV borrow guards, partial repayments, escrowed bids with refunds, finalization coin flows, staleness windows, governance start/stop.

2) Property & fuzz tests
- Interest accrual monotonicity; no negative balances; conserved coins across liquidation.

3) Static analysis & reviews
- AssemblyScript/WASM safety checks; reentrancy posture (effects‑before‑interactions; external calls last); structured code review and external audit slot.

4) Load and soak
- Run buildnet e2e (ASC long‑running), measure gas, storage growth, and event volume.

---

## Workstream G — Observability & Ops (P1→P2)

1) Events & metrics
- Add parameterized events to all critical paths (borrow, repay, accrue, evaluate, liquidate, bid, finalize, oracle update). Build simple indexer/ETL and Grafana dashboards.

2) Deployment & rollback
- Harden `scripts/deploy.ts` for staged networks, idempotency, and rollback on failure. Validate `addresses.json`; auto‑sync to `front-end/public/addresses.json`.

3) Config & secrets
- Document `.env` for buildnet/testnet/mainnet; secure key handling; rotating governance ownership (multisig when available).

---

## Backward Compatibility & Migration

- Position storage is currently colon‑delimited strings and active sets are comma‑separated. For v1 production, keep format but add versioned keys (`POSITION_V1_…`) to allow future migration.
- When introducing structural changes (e.g., escrow maps), scope them to new prefixes and write one‑off migration scripts if the buildnet data should be preserved.
- Use governance `pause()` during any breaking migration, validate invariants, then `unpause()`.

---

## Deliverables & Acceptance

P0 (must‑have before mainnet):
- Lending: LTV guard, partial repay, liquidity checks, unified parameters.
- Liquidation: escrowed bids, real repayment flow, Vault setter, threshold unification.
- Oracle: no random updates; authorized update path only; Vault/Risk read Oracle only.
- Governance: ASC bridges implemented; consistent ASC scheduling.
- Frontend: 1e9 precision; pre‑borrow validation; fixed bid units.
- Tests: unit/integration for above; buildnet e2e scenario passes.

P1 (first month post‑launch):
- Structured storage (mappings), richer events, efficient reads, responsive UI polish, property tests, dashboards, hardened deploy.

P2 (ongoing):
- PD/LGD→LTV parameterization by asset type; multi‑source price aggregation; advanced liquidation strategies (relist, Dutch); canary environments.

---

## Execution Timeline (indicative)

- Week 1–2 (P0):
  - Implement borrow LTV guard, partial repay, liquidity checks.
  - Implement escrowed bids + finalize coin flow; add Vault engine setter; unify thresholds.
  - Disable Oracle randomness; enforce provider auth; Governance ASC bridges.
  - Frontend precision fixes and pre‑borrow validation; minimal UX polish.
  - Extend tests; run buildnet e2e and soak ASC for 48h.

- Week 3–4 (P1):
  - Storage structuring and event enrichment; efficient reads; responsive layout.
  - Property/fuzz tests; observability pipelines; deployment hardening.

- Week 5+ (P2):
  - Risk model parameterization; oracle aggregation; advanced liquidation options; canary pipeline.

---

## Implementation Notes (by file)

- `assembly/contracts/LendingPool.ts`
  - Add LTV check via `RiskManager.calculateLTV` in `borrow`.
  - Rework `repay` to support partial payments; interest first.
  - Tighten liquidity checks; standardize events.

- `assembly/contracts/RiskManager.ts`
  - Single liquidation threshold param; add freshness check against `Oracle.NFT_UPDATE_*`.

- `assembly/contracts/LiquidationEngine.ts`
  - `bid` uses `transferredCoins()`; escrow and prior‑bidder refund.
  - `finalizeAuction` moves coins to LendingPool and calls Vault transfer; surplus split.

- `assembly/contracts/CollateralVault.ts`
  - Add governance bridge setter for `LIQUIDATION_ENGINE`; enforce caller.
  - Prefer RWA_NFT `ownerOf` read over raw key when feasible.

- `assembly/contracts/Oracle.ts`
  - Remove random updates in production; harden authorized provider set; add `lastUpdate` windows.

- `assembly/contracts/Governance.ts`
  - Add start/stop bridges and vault/engine setter forwards; parameter set/get for thresholds and intervals.

- Frontend (React)
  - Fix bid precision (1e9); use `Mas.fromString` helpers.
  - Pre‑borrow `calculateLTV` call; block invalid requests.
  - Prefer active sets and counters over blind scans; improve mobile UX.

- Scripts
  - Align `scripts/interact.ts` with new governance methods; validate addresses; better errors.

---

## Risks & Mitigations

- Logic bugs in money‑moving paths → expand tests, effects‑before‑interactions, staged releases on buildnet, pause switch ready.
- Oracle manipulation → multi‑provider approvals (future), TWAPs, staleness guards, on‑chain allowlist.
- ASC scheduling drift → uniform scheduler, generous gas, health checks in `checkStatus` script.

---

## Open Questions

- Should liquidation use English or Dutch auctions for thin liquidity assets?
- Reserve factor and fee splits: governance‑set, per‑market, or global?
- Do we need multisig governance and timelocks pre‑mainnet?

---

## Next Actions

1) Approve Workstream A/B P0 scope.
2) Implement contract changes behind a feature flag and run unit tests.
3) Update scripts and frontend; run buildnet e2e and a 48h ASC soak.
4) Freeze parameters, run external audit, and prepare mainnet deploy.
