/**
 * @resu/sdk — zero-dependency TypeScript SDK for the Resu protocol.
 *
 * Read pool state over any RPC and build unsigned transactions you sign with
 * whatever wallet library you already use (viem, ethers, web3, or raw). The SDK
 * never holds keys and never signs.
 */

export { ResuClient, revertReason, type ResuClientOptions, type Call, type CallResult } from "./rpc.js";
export { CHAINS, isChainId, type ChainId, type ChainInfo } from "./chains.js";
export {
	POOLS,
	TIERS,
	getPool,
	poolsOfChain,
	tierIndex,
	type Pool,
	type Tier,
	type EconomicModel,
} from "./pools.js";
export {
	readVault,
	readPosition,
	sharePrice,
	approve,
	deposit,
	requestWithdrawal,
	claim,
	type VaultState,
	type Position,
	type Ticket,
	type TxRequest,
} from "./vault.js";
export {
	PROFILES,
	INDEXES,
	getProfile,
	getIndex,
	readProfile,
	readIndex,
	readBasketShares,
	approveProfile,
	depositProfile,
	redeemProfile,
	approveIndexLeg,
	depositIndex,
	redeemIndex,
	type Profile,
	type Index,
	type IndexLeg,
	type BasketState,
} from "./baskets.js";
export {
	USDC,
	quoteZap,
	readUsdcBalance,
	readUsdcAllowance,
	readTokenBalance,
	approveUsdc,
	type ZapQuote,
	type ZapOptions,
} from "./zap.js";

export { SIG, encode, encodeUintArray, decodeWords, word, parseUnits, formatUnits, MAX_UINT } from "./abi.js";
