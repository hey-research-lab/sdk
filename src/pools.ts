import type { ChainId } from "./chains.js";

/** Tier order is fixed everywhere: 0 Junior, 1 Middle, 2 Senior. */
export type Tier = "junior" | "middle" | "senior";
export const TIERS: Tier[] = ["junior", "middle", "senior"];
export const tierIndex = (t: Tier): number => TIERS.indexOf(t);

export type EconomicModel = "coupon" | "fee";

export type Pool = {
	/** Stable id, e.g. "base-nvda". */
	id: string;
	chain: ChainId;
	/** The underlying asset symbol, e.g. "NVDA", "WETH". */
	symbol: string;
	model: EconomicModel;
	vault: string;
	asset: string;
	assetDecimals: number;
	/** Tier share tokens, Junior -> Middle -> Senior. */
	trancheTokens: [string, string, string];
};

/**
 * The deployed EVM pools. Addresses are the current mainnet deployment; the
 * canonical list lives in each contract repo's deployments folder. Non-EVM
 * pools (Solana, TON) are not covered by this SDK.
 */
export const POOLS: Pool[] = [
	{
		id: "base-msft",
		chain: "base",
		symbol: "MSFT",
		model: "coupon",
		vault: "0x80669f196620597AC5740416CB85754761Ccb786",
		asset: "0xB200000000000000000000Ab99cFa739E253872B",
		assetDecimals: 8,
		trancheTokens: [
			"0xa639fB9C115E0C7f71119137e69080B6472526F9",
			"0x162507d813030eB5845e349787a8F040f1cc2F63",
			"0xE078943a7C021b5d9ADCD94F2bC3A52C8fa26FE6",
		],
	},
	{
		id: "base-nvda",
		chain: "base",
		symbol: "NVDA",
		model: "coupon",
		vault: "0xb555F9D5eF631868cF070Fe3466765E26502693A",
		asset: "0xb20000000000000000000078ee7ce2fE4908108C",
		assetDecimals: 8,
		trancheTokens: [
			"0xb445c52873e0dd11fa9a0571A8Ba2aE96FDf17b7",
			"0x9de2b4325A0ADE2AFb399F73D7e3C4DC5142E660",
			"0x21df86a36e3Cbe48f39B228C17696D0e6F872563",
		],
	},
	{
		id: "arbitrum-weth",
		chain: "arbitrum",
		symbol: "WETH",
		model: "coupon",
		vault: "0x8a8CB825f4CCd2e93604e828f62C3ce3f5C8F464",
		asset: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
		assetDecimals: 18,
		trancheTokens: [
			"0xb996a0D4Fe810f6Fc863533b49B4581fC5348B49",
			"0xb555F9D5eF631868cF070Fe3466765E26502693A",
			"0xb445c52873e0dd11fa9a0571A8Ba2aE96FDf17b7",
		],
	},
	{
		id: "monad-aprmon",
		chain: "monad",
		symbol: "aprMON",
		model: "coupon",
		vault: "0x804E56c448A14611ECAC4cf07a222878820e3876",
		asset: "0x0c65A0BC65a5D819235B71F554D210D3F80E0852",
		assetDecimals: 18,
		trancheTokens: [
			"0x5285F357Eb16E6fd40ba73fCA4F37776A3A5d129",
			"0x8a8CB825f4CCd2e93604e828f62C3ce3f5C8F464",
			"0xb996a0D4Fe810f6Fc863533b49B4581fC5348B49",
		],
	},
];

export function getPool(id: string): Pool {
	const p = POOLS.find((x) => x.id === id);
	if (!p) throw new Error(`Unknown pool: ${id}`);
	return p;
}

export function poolsOfChain(chain: ChainId): Pool[] {
	return POOLS.filter((p) => p.chain === chain);
}
