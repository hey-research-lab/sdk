import { ResuClient } from "./rpc.js";
import { SIG, encode, decodeWords, MAX_UINT } from "./abi.js";
import { CHAINS, type ChainId } from "./chains.js";
import type { TxRequest } from "./vault.js";

/**
 * Zap: start from USDC instead of a pool's underlying asset. A zap is a market
 * trade — the swap is routed through the LI.FI API (no key needed), which
 * returns ready calldata and a minimum-received after slippage. The contracts
 * never swap; you deposit what the swap actually returns.
 *
 * Flow: quoteZap() -> approve USDC to quote.approvalAddress (if needed) ->
 * send quote.tx -> read the underlying actually received -> deposit it.
 */

export const USDC: Partial<Record<ChainId, { address: string; decimals: number }>> = {
	base: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
	arbitrum: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
};

export type ZapQuote = {
	/** Expected underlying out (in the buy token's decimals). */
	buyAmount: bigint;
	/** Guaranteed minimum out after slippage. */
	minBuyAmount: bigint;
	/** The swap transaction to send. */
	tx: TxRequest;
	/** The USDC spender (LI.FI router) to approve. */
	approvalAddress: string;
};

type LifiResponse = {
	estimate?: { toAmount?: string; toAmountMin?: string; approvalAddress?: string };
	transactionRequest?: { to?: string; data?: string; value?: string };
};

export type ZapOptions = { fetch?: typeof fetch; integrator?: string };

/**
 * Quote USDC -> `buyToken` for `sellAmount` USDC (base units), for `taker`.
 * Returns null when LI.FI has no route for the pair/size.
 */
export async function quoteZap(
	chain: ChainId,
	buyToken: string,
	sellAmount: bigint,
	taker: string,
	opts: ZapOptions = {},
): Promise<ZapQuote | null> {
	const usdc = USDC[chain];
	if (!usdc) throw new Error(`USDC not configured on ${chain}`);
	const fetchFn = opts.fetch ?? globalThis.fetch;
	if (!fetchFn) throw new Error("No fetch available; pass one via opts.fetch");

	const id = String(CHAINS[chain].chainId);
	const params = new URLSearchParams({
		fromChain: id,
		toChain: id,
		fromToken: usdc.address,
		toToken: buyToken,
		fromAmount: sellAmount.toString(),
		fromAddress: taker,
		integrator: opts.integrator ?? "resu-sdk",
	});
	const res = await fetchFn(`https://li.quest/v1/quote?${params}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`LI.FI ${res.status}`);
	const j = (await res.json()) as LifiResponse;
	const t = j.transactionRequest;
	if (!t?.to || !t.data || !j.estimate?.approvalAddress) return null;
	return {
		buyAmount: BigInt(j.estimate.toAmount ?? "0"),
		minBuyAmount: BigInt(j.estimate.toAmountMin ?? "0"),
		tx: { to: t.to, data: t.data, value: t.value ?? "0x0" },
		approvalAddress: j.estimate.approvalAddress,
	};
}

/** The owner's USDC balance on a chain. */
export async function readUsdcBalance(client: ResuClient, chain: ChainId, owner: string): Promise<bigint> {
	const usdc = USDC[chain];
	if (!usdc) throw new Error(`USDC not configured on ${chain}`);
	const hex = await client.call(chain, usdc.address, encode(SIG.balanceOf, owner));
	return decodeWords(hex)[0] ?? 0n;
}

/** How much USDC `spender` (the LI.FI router) may pull from the owner. */
export async function readUsdcAllowance(
	client: ResuClient,
	chain: ChainId,
	owner: string,
	spender: string,
): Promise<bigint> {
	const usdc = USDC[chain];
	if (!usdc) throw new Error(`USDC not configured on ${chain}`);
	const hex = await client.call(chain, usdc.address, encode(SIG.allowance, owner, spender));
	return decodeWords(hex)[0] ?? 0n;
}

/** Approve the LI.FI router to pull USDC. */
export function approveUsdc(chain: ChainId, spender: string, amount: bigint = MAX_UINT): TxRequest {
	const usdc = USDC[chain];
	if (!usdc) throw new Error(`USDC not configured on ${chain}`);
	return { to: usdc.address, data: encode(SIG.approve, spender, amount), value: "0x0" };
}

/** Read an ERC20 balance — e.g. the underlying actually received after a swap. */
export async function readTokenBalance(
	client: ResuClient,
	chain: ChainId,
	token: string,
	owner: string,
): Promise<bigint> {
	const hex = await client.call(chain, token, encode(SIG.balanceOf, owner));
	return decodeWords(hex)[0] ?? 0n;
}
