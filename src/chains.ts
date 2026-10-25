/** The EVM chains Resu runs on, with their numeric id and a default RPC. */
export type ChainId = "base" | "arbitrum" | "robinhood" | "hyperevm" | "monad";

export type ChainInfo = {
	id: ChainId;
	chainId: number;
	/** A public default RPC. Override per client for rate limits or archives. */
	rpc: string;
};

export const CHAINS: Record<ChainId, ChainInfo> = {
	base: { id: "base", chainId: 8453, rpc: "https://mainnet.base.org" },
	arbitrum: { id: "arbitrum", chainId: 42161, rpc: "https://arbitrum.drpc.org" },
	robinhood: { id: "robinhood", chainId: 4663, rpc: "https://rpc.mainnet.chain.robinhood.com" },
	hyperevm: { id: "hyperevm", chainId: 999, rpc: "https://rpc.hyperliquid.xyz/evm" },
	monad: { id: "monad", chainId: 143, rpc: "https://rpc.monad.xyz" },
};

export const isChainId = (x: string): x is ChainId => x in CHAINS;
