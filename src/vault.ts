import { ResuClient, revertReason, type CallResult } from "./rpc.js";
import { SIG, encode, decodeWords, MAX_UINT } from "./abi.js";
import { tierIndex, type Pool, type Tier } from "./pools.js";

/** An unsigned transaction request. Send it with your own wallet library. */
export type TxRequest = { to: string; data: string; value: string };
const tx = (to: string, data: string): TxRequest => ({ to, data, value: "0x0" });

export type VaultState = {
	/** Total pool value, in wad USD (1e18). */
	nav: bigint;
	/** Each tier's current value [Junior, Middle, Senior], wad USD. */
	values: [bigint, bigint, bigint];
	/** Each tier's outstanding shares [Junior, Middle, Senior]. */
	totalShares: [bigint, bigint, bigint];
};

export type Ticket = { shares: bigint; unlockAt: number };

export type Position = {
	/** The owner's balance of the pool's underlying asset. */
	assetBalance: bigint;
	/** How much the owner has approved the vault to pull. */
	allowance: bigint;
	/** The owner's tier shares [Junior, Middle, Senior]. */
	shares: [bigint, bigint, bigint];
	/** Pending exit tickets per tier [Junior, Middle, Senior]. */
	tickets: [Ticket, Ticket, Ticket];
};

const take = (res: CallResult[], i: number): bigint[] => {
	const r = res[i];
	if (!r) throw new Error(`Missing result ${i}`);
	if (!r.success) throw new Error(revertReason(r.data) ?? "call reverted");
	return decodeWords(r.data);
};

/**
 * Read a pool's live state in one request.
 *
 * On a coupon pool over a stock, `nav()` reverts with "stale price" while the
 * market is closed — that is a state, not a bug, and it surfaces here as a
 * thrown error carrying the reason.
 */
export async function readVault(client: ResuClient, pool: Pool): Promise<VaultState> {
	const res = await client.multicall(pool.chain, [
		{ to: pool.vault, data: SIG.nav },
		{ to: pool.vault, data: SIG.values },
		...[0, 1, 2].map((i) => ({ to: pool.vault, data: encode(SIG.totalShares, i) })),
	]);
	const [nav] = take(res, 0);
	const vals = take(res, 1);
	return {
		nav: nav ?? 0n,
		values: [vals[0] ?? 0n, vals[1] ?? 0n, vals[2] ?? 0n],
		totalShares: [take(res, 2)[0] ?? 0n, take(res, 3)[0] ?? 0n, take(res, 4)[0] ?? 0n],
	};
}

/** Read a wallet's position in a pool in one request. */
export async function readPosition(client: ResuClient, pool: Pool, owner: string): Promise<Position> {
	const res = await client.multicall(pool.chain, [
		{ to: pool.asset, data: encode(SIG.balanceOf, owner) },
		{ to: pool.asset, data: encode(SIG.allowance, owner, pool.vault) },
		...[0, 1, 2].flatMap((i) => [
			{ to: pool.trancheTokens[i]!, data: encode(SIG.balanceOf, owner) },
			{ to: pool.vault, data: encode(SIG.tickets, owner, i) },
		]),
	]);
	const shares: bigint[] = [];
	const tickets: Ticket[] = [];
	for (const i of [0, 1, 2]) {
		shares.push(take(res, 2 + i * 2)[0] ?? 0n);
		const t = take(res, 3 + i * 2);
		tickets.push({ shares: t[0] ?? 0n, unlockAt: Number(t[1] ?? 0n) });
	}
	return {
		assetBalance: take(res, 0)[0] ?? 0n,
		allowance: take(res, 1)[0] ?? 0n,
		shares: shares as [bigint, bigint, bigint],
		tickets: tickets as [Ticket, Ticket, Ticket],
	};
}

/** Wad-USD value of one 1e18 shares of a tier. 1.0 when the tier is empty. */
export function sharePrice(state: VaultState, tier: Tier): bigint {
	const i = tierIndex(tier);
	const supply = state.totalShares[i]!;
	if (supply === 0n) return 10n ** 18n;
	return (state.values[i]! * 10n ** 18n) / supply;
}

// --- transaction builders (pure; sign and send yourself) -------------------

/** Approve the vault to pull the pool's asset. Defaults to max approval. */
export function approve(pool: Pool, amount: bigint = MAX_UINT): TxRequest {
	return tx(pool.asset, encode(SIG.approve, pool.vault, amount));
}

/** Deposit `amount` of the asset into a tier. Requires allowance first. */
export function deposit(pool: Pool, tier: Tier, amount: bigint): TxRequest {
	return tx(pool.vault, encode(SIG.deposit, tierIndex(tier), amount));
}

/** Request to withdraw `shares` of a tier. Matures after the exit window. */
export function requestWithdrawal(pool: Pool, tier: Tier, shares: bigint): TxRequest {
	return tx(pool.vault, encode(SIG.requestWithdrawal, tierIndex(tier), shares));
}

/** Claim a matured withdrawal ticket for a tier. */
export function claim(pool: Pool, tier: Tier): TxRequest {
	return tx(pool.vault, encode(SIG.claim, tierIndex(tier)));
}
