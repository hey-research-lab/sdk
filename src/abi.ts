/**
 * Minimal ABI helpers — just enough to build the fixed-shape calls Resu needs,
 * with no dependency on viem/ethers. The protocol's reads and writes are all
 * simple static types (uint, address, small structs and arrays), so hand
 * encoding is a few lines and keeps the SDK weightless.
 */

/** A hex address or 0x-string, lowercased without the prefix, 32-byte padded. */
export const word = (v: bigint | number | string): string => {
	if (typeof v === "string") return v.toLowerCase().replace(/^0x/, "").padStart(64, "0");
	return BigInt(v).toString(16).padStart(64, "0");
};

/** selector + each argument as one 32-byte word. Static args only. */
export const encode = (selector: string, ...args: (bigint | number | string)[]): string =>
	selector + args.map(word).join("");

/** Encode a dynamic uint256[]: offset, length, then the elements. */
export const encodeUintArray = (selector: string, values: bigint[]): string =>
	selector + word(32) + word(values.length) + values.map(word).join("");

/** Split a return blob into 32-byte words as bigints. */
export const decodeWords = (hex: string): bigint[] => {
	const body = hex.replace(/^0x/, "");
	const out: bigint[] = [];
	for (let i = 0; i + 64 <= body.length; i += 64) out.push(BigInt("0x" + body.slice(i, i + 64)));
	return out;
};

/** Read an address out of a return word (last 20 bytes). */
export const decodeAddress = (hex: string): string => {
	const body = hex.replace(/^0x/, "").slice(0, 64);
	return "0x" + body.slice(24);
};

/** Function selectors, shared with the deployed contracts. */
export const SIG = {
	// --- OracleVault ---
	nav: "0xc1590cd7", // nav()
	values: "0x971217b7", // values()
	sharePriceTier: "0x61a9da23", // sharePrice(uint8)
	pricePerAsset: "0x183d32db", // pricePerAsset()
	totalShares: "0x13f2dad0", // totalShares(uint256)
	claims: "0xa888c2cd", // claims(uint256)
	tickets: "0xdae7a13c", // tickets(address,uint256)
	trancheTokens: "0xf9497eed", // trancheTokens(uint256)
	deposit: "0xf4d4c9d7", // deposit(uint8,uint256)
	requestWithdrawal: "0xa9ac4ddb", // requestWithdrawal(uint8,uint256)
	claim: "0x95d4063f", // claim(uint8)
	// --- ERC20 ---
	balanceOf: "0x70a08231", // balanceOf(address)
	allowance: "0xdd62ed3e", // allowance(address,address)
	approve: "0x095ea7b3", // approve(address,uint256)
	totalSupply: "0x18160ddd", // totalSupply()
	// --- Basket / IndexBasket ---
	basketSharePrice: "0x87269729", // sharePrice()
	basketTotalValueUsd: "0x7f05a730", // totalValueUsd()
	basketDeposit: "0xb6b55f25", // deposit(uint256)
	indexDeposit: "0x598b8e71", // deposit(uint256[])
	basketRedeem: "0xdb006a75", // redeem(uint256)
} as const;

export const MAX_UINT = (1n << 256n) - 1n;

// --- amount formatting -----------------------------------------------------

/** Parse a human decimal string into base units. Returns null if malformed. */
export function parseUnits(value: string, decimals: number): bigint | null {
	const v = value.trim();
	if (!/^\d*\.?\d*$/.test(v) || v === "" || v === ".") return null;
	const [whole, frac = ""] = v.split(".");
	if (frac.length > decimals) return null;
	return BigInt((whole || "0") + frac.padEnd(decimals, "0"));
}

/** Format base units as a human decimal string, trimming trailing zeros. */
export function formatUnits(value: bigint, decimals: number): string {
	const neg = value < 0n;
	const s = (neg ? -value : value).toString().padStart(decimals + 1, "0");
	const whole = s.slice(0, s.length - decimals);
	const frac = s.slice(s.length - decimals).replace(/0+$/, "");
	return (neg ? "-" : "") + (frac ? `${whole}.${frac}` : whole);
}
