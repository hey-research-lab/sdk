# @resu/sdk

Zero-dependency TypeScript SDK for the [Resu protocol](../resu-docs) — risk-graded
(tranched) vaults on EVM chains. Read pool state over any RPC and build unsigned
transactions you sign with **whatever wallet library you already use** (viem,
ethers, web3, or raw JSON-RPC).

- **No dependencies.** Reads go over `fetch` + Multicall3; writes are plain
  `{ to, data, value }` objects.
- **Never signs, never holds keys.** The SDK builds calldata; you sign and send.
- **Covers** the vaults (deposit / withdraw / claim), one-click profiles, index
  baskets, and USDC zaps (via LI.FI, no API key).

```bash
npm install @resu/sdk
```

## Quick start

```ts
import { ResuClient, getPool, readVault, readPosition, approve, deposit, formatUnits } from "@resu/sdk";

const resu = new ResuClient(); // default public RPCs; override per chain below
const pool = getPool("base-nvda");

// Read live state (one RPC round-trip via Multicall3).
const state = await readVault(resu, pool);
console.log("NAV $", formatUnits(state.nav, 18));

// Build transactions — sign & send them with your own wallet library.
const approveTx = approve(pool);                       // approve the vault to pull NVDAc
const depositTx = deposit(pool, "senior", 10_000_000n); // 0.1 NVDAc (8 decimals) into Senior
// e.g. with viem:  await walletClient.sendTransaction(depositTx)
// e.g. with ethers: await signer.sendTransaction(depositTx)
```

Custom RPCs (recommended for rate limits / archives):

```ts
const resu = new ResuClient({
  rpc: {
    base: "https://base-mainnet.your-provider.com/KEY",
    arbitrum: "https://arbitrum.drpc.org",
  },
});
```

In Node < 18, pass a `fetch` implementation: `new ResuClient({ fetch })`.

## Concepts

A **pool** splits one asset into three **tiers** that differ only in loss order:

| Tier | Loses | Yield |
|---|---|---|
| `junior` | first | highest / leveraged |
| `middle` | second | middle |
| `senior` | last, protected | lowest, predictable |

Tier index is fixed: `0` Junior, `1` Middle, `2` Senior.

## Vaults

```ts
import { ResuClient, getPool, readVault, readPosition, sharePrice,
         approve, deposit, requestWithdrawal, claim } from "@resu/sdk";

const resu = new ResuClient();
const pool = getPool("base-nvda");

const state = await readVault(resu, pool);
sharePrice(state, "senior"); // wad USD per 1e18 Senior shares

const pos = await readPosition(resu, pool, "0xYourAddress");
pos.shares;  // [junior, middle, senior]
pos.tickets; // pending exit tickets per tier: { shares, unlockAt }

// Transaction builders (pure):
approve(pool);                         // max approval of the asset to the vault
deposit(pool, "junior", 1_000_000n);   // deposit into a tier
requestWithdrawal(pool, "junior", shares); // start the exit window
claim(pool, "junior");                 // claim a matured ticket
```

A withdrawal matures after a fixed delay; value is computed when the money is
**paid**, not when requested.

## One-click profiles

A fixed blend of the three tiers of one asset, as a single token. Deposit one
asset; redemption returns the tier tokens **in kind** (pro-rata).

```ts
import { PROFILES, getProfile, readProfile, approveProfile, depositProfile, redeemProfile } from "@resu/sdk";

const p = getProfile("base-nvda-balanced"); // blend [20, 30, 50] (jr/ml/sr)
await readProfile(resu, p);                  // { sharePrice, totalValueUsd, totalSupply }

approveProfile(p);                 // approve the asset to the basket
depositProfile(p, 10_000_000n);    // one asset in, one token out
redeemProfile(p, shares);          // burn shares, receive tier tokens in kind
```

## Index baskets

One tier spread across several assets (e.g. Senior over MSFT + NVDA). Deposit is
**per leg** — one amount per asset, zero to skip a leg.

```ts
import { getIndex, readIndex, approveIndexLeg, depositIndex, redeemIndex } from "@resu/sdk";

const x = getIndex("base-shield"); // rSHLD: Senior across [MSFT, NVDA]
await readIndex(resu, x);

approveIndexLeg(x, 0);                      // approve MSFT (leg 0)
approveIndexLeg(x, 1);                      // approve NVDA (leg 1)
depositIndex(x, [5_000_000n, 5_000_000n]);  // amounts aligned to x.legs
redeemIndex(x, shares);                     // in kind
```

## Zap — paying with USDC

The pool asset is rarely USDC. A zap swaps USDC into the underlying via LI.FI
(no API key), then you deposit what the swap **actually returned**.

```ts
import { quoteZap, readUsdcAllowance, approveUsdc, readTokenBalance, depositProfile, getProfile } from "@resu/sdk";

const p = getProfile("base-nvda-balanced");
const taker = "0xYourAddress";

// 1. Quote 100 USDC -> NVDAc
const q = await quoteZap("base", p.asset, 100_000_000n, taker);
if (!q) throw new Error("no route"); // thin liquidity / unsupported size
// q.buyAmount, q.minBuyAmount (after slippage), q.tx, q.approvalAddress

// 2. Approve USDC to the LI.FI router if needed
if ((await readUsdcAllowance(resu, "base", taker, q.approvalAddress)) < 100_000_000n) {
  // send approveUsdc("base", q.approvalAddress)
}

// 3. Send q.tx (the swap). Then read what you received and deposit it:
const received = await readTokenBalance(resu, "base", p.asset, taker);
const depositTx = depositProfile(p, received); // deposit the real balance, not the quote
```

A zap is a market trade: on thin books a large zap moves the price — the
minimum-received figure is your protection. The vault itself never swaps.

## Registries

- `POOLS`, `getPool(id)`, `poolsOfChain(chain)`
- `PROFILES`, `getProfile(id)`
- `INDEXES`, `getIndex(id)`
- `CHAINS`, `USDC`

Addresses are the current mainnet deployment; the canonical list lives in each
contract repo's `deployments/` folder and in the frontend config.

## Notes

- All amounts are `bigint` in base units. Use `parseUnits` / `formatUnits` to
  convert to and from human strings.
- `readVault` throws with the revert reason when a coupon pool's `nav()` is stale
  (the market is closed) — catch it and surface that state.
- Non-EVM pools (Solana, TON) are out of scope for this SDK.

## License

MIT
