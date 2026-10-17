import { ResuClient } from "./rpc.js";
import { SIG, encode, encodeUintArray, decodeWords, word, MAX_UINT } from "./abi.js";
import type { ChainId } from "./chains.js";
import type { Tier } from "./pools.js";
import type { TxRequest } from "./vault.js";

const tx = (to: string, data: string): TxRequest => ({ to, data, value: "0x0" });

/**
 * Baskets are convenience wrappers over the vaults, each handing back a single
 * token. A one-click PROFILE holds a fixed blend of the three tiers of one
 * asset; an INDEX holds one tier across several assets. Both deposit the real
 * asset(s) and redeem IN KIND (a pro-rata slice of the tier tokens held).
 */

export type Profile = {
	id: string;
	kind: "profile";
	chain: ChainId;
	address: string;
	label: string;
	/** The underlying asset a depositor brings in. */
	asset: string;
	assetSymbol: string;
	assetDecimals: number;
	/** Blend shown to the user: [Junior, Middle, Senior] in percent. */
	blend: [number, number, number];
};

export type IndexLeg = {
	asset: string;
	assetSymbol: string;
	assetDecimals: number;
	tier: Tier;
};

export type Index = {
	id: string;
	kind: "index";
	chain: ChainId;
	address: string;
	/** The index share symbol, e.g. "rSHLD". */
	symbol: string;
	label: string;
	legs: IndexLeg[];
};

/** Deployed one-click profiles. */
export const PROFILES: Profile[] = [
	profile("base-nvda-conservative", "base", "0x2Af7f66C3F00111A51F7B50161a66fF4242d9357", "Conservative · NVDA", "0xb20000000000000000000078ee7ce2fE4908108C", "NVDA", 8, [10, 20, 70]),
	profile("base-nvda-balanced", "base", "0x7cfcc8fc421D54b1Af2D224C14e929521f63B6A6", "Balanced · NVDA", "0xb20000000000000000000078ee7ce2fE4908108C", "NVDA", 8, [20, 30, 50]),
	profile("base-nvda-aggressive", "base", "0xfFF07484455d76af25Af163F3388Fea0b9E00e44", "Aggressive · NVDA", "0xb20000000000000000000078ee7ce2fE4908108C", "NVDA", 8, [50, 30, 20]),
	profile("base-msft-conservative", "base", "0xF316FF86000eae8808cEF565b24db1fdC2b70E33", "Conservative · MSFT", "0xB200000000000000000000Ab99cFa739E253872B", "MSFT", 8, [10, 20, 70]),
	profile("base-msft-balanced", "base", "0xDc34F79b53f3b2b270A6208C35400435CE7cde43", "Balanced · MSFT", "0xB200000000000000000000Ab99cFa739E253872B", "MSFT", 8, [20, 30, 50]),
	profile("base-msft-aggressive", "base", "0x22744563380F77EbCB4941626c16165f0446A5D5", "Aggressive · MSFT", "0xB200000000000000000000Ab99cFa739E253872B", "MSFT", 8, [50, 30, 20]),
];

/** Deployed index baskets. */
export const INDEXES: Index[] = [
	{
		id: "base-shield",
		kind: "index",
		chain: "base",
		address: "0x5BFfd03ab2EFf2905b846697A18e7173Af1d3aA7",
		symbol: "rSHLD",
		label: "Shield Index · MSFT + NVDA",
		legs: [
			{ asset: "0xB200000000000000000000Ab99cFa739E253872B", assetSymbol: "MSFT", assetDecimals: 8, tier: "senior" },
			{ asset: "0xb20000000000000000000078ee7ce2fE4908108C", assetSymbol: "NVDA", assetDecimals: 8, tier: "senior" },
		],
	},
];

function profile(
	id: string,
	chain: ChainId,
	address: string,
	label: string,
	asset: string,
	assetSymbol: string,
	assetDecimals: number,
	blend: [number, number, number],
): Profile {
	return { id, kind: "profile", chain, address, label, asset, assetSymbol, assetDecimals, blend };
}

export const getProfile = (id: string): Profile => {
	const p = PROFILES.find((x) => x.id === id);
	if (!p) throw new Error(`Unknown profile: ${id}`);
	return p;
};
export const getIndex = (id: string): Index => {
	const x = INDEXES.find((i) => i.id === id);
	if (!x) throw new Error(`Unknown index: ${id}`);
	return x;
};

// --- reads -----------------------------------------------------------------

export type BasketState = {
	/** Wad-USD value of one 1e18 basket shares. */
	sharePrice: bigint;
	/** Total wad-USD value the basket holds. */
	totalValueUsd: bigint;
	totalSupply: bigint;
};

async function readBasketState(client: ResuClient, chain: ChainId, address: string): Promise<BasketState> {
	const res = await client.multicall(chain, [
		{ to: address, data: SIG.basketSharePrice },
		{ to: address, data: SIG.basketTotalValueUsd },
		{ to: address, data: SIG.totalSupply },
	]);
	const n = (i: number) => decodeWords(res[i]!.data)[0] ?? 0n;
	return { sharePrice: n(0), totalValueUsd: n(1), totalSupply: n(2) };
}

export const readProfile = (client: ResuClient, p: Profile): Promise<BasketState> =>
	readBasketState(client, p.chain, p.address);
export const readIndex = (client: ResuClient, x: Index): Promise<BasketState> =>
	readBasketState(client, x.chain, x.address);

/** A holder's basket shares (18 decimals). */
export async function readBasketShares(
	client: ResuClient,
	chain: ChainId,
	address: string,
	owner: string,
): Promise<bigint> {
	const hex = await client.call(chain, address, encode(SIG.balanceOf, owner));
	return decodeWords(hex)[0] ?? 0n;
}

// --- transaction builders --------------------------------------------------

// Profiles: one asset in, one token out.

export function approveProfile(p: Profile, amount: bigint = MAX_UINT): TxRequest {
	return tx(p.asset, encode(SIG.approve, p.address, amount));
}
export function depositProfile(p: Profile, amount: bigint): TxRequest {
	return tx(p.address, SIG.basketDeposit + word(amount));
}
export function redeemProfile(p: Profile, shares: bigint): TxRequest {
	return tx(p.address, SIG.basketRedeem + word(shares));
}

// Indexes: one amount per leg (zero to skip a leg).

export function approveIndexLeg(x: Index, legIndex: number, amount: bigint = MAX_UINT): TxRequest {
	const leg = x.legs[legIndex];
	if (!leg) throw new Error(`No leg ${legIndex} on index ${x.id}`);
	return tx(leg.asset, encode(SIG.approve, x.address, amount));
}
export function depositIndex(x: Index, amounts: bigint[]): TxRequest {
	if (amounts.length !== x.legs.length) throw new Error("amounts length must match legs");
	return tx(x.address, encodeUintArray(SIG.indexDeposit, amounts));
}
export function redeemIndex(x: Index, shares: bigint): TxRequest {
	return tx(x.address, SIG.basketRedeem + word(shares));
}
