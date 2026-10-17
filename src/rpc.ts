import { CHAINS, type ChainId } from "./chains.js";
import { word } from "./abi.js";

/**
 * The client: a thin JSON-RPC reader over `fetch`, plus Multicall3 batching so
 * a full pool read is one network round-trip. It never signs anything — writes
 * are built as plain `{ to, data, value }` objects elsewhere, which you send
 * with whatever wallet library you already use.
 */

export type Call = { to: string; data: string };
export type CallResult = { success: boolean; data: string };

/** Multicall3 — the same canonical address on every supported chain. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const SIG_AGGREGATE3 = "0x82ad56cb"; // aggregate3((address,bool,bytes)[])
const ERROR_STRING = "08c379a0"; // Error(string)

export type ResuClientOptions = {
	/** Override the default RPC per chain. */
	rpc?: Partial<Record<ChainId, string>>;
	/** Supply your own fetch (e.g. in Node < 18). Defaults to global fetch. */
	fetch?: typeof fetch;
};

export class ResuClient {
	private readonly rpcUrls: Record<ChainId, string>;
	private readonly fetchFn: typeof fetch;
	private id = 1;

	constructor(opts: ResuClientOptions = {}) {
		this.fetchFn = opts.fetch ?? globalThis.fetch;
		if (!this.fetchFn) throw new Error("No fetch available; pass one via options.fetch");
		this.rpcUrls = Object.fromEntries(
			(Object.keys(CHAINS) as ChainId[]).map((c) => [c, opts.rpc?.[c] ?? CHAINS[c].rpc]),
		) as Record<ChainId, string>;
	}

	rpcUrl(chain: ChainId): string {
		const url = this.rpcUrls[chain];
		if (!url) throw new Error(`No RPC configured for ${chain}`);
		return url;
	}

	/** Raw eth_call, returning the result hex. */
	async call(chain: ChainId, to: string, data: string): Promise<string> {
		const res = await this.fetchFn(this.rpcUrl(chain), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: this.id++,
				method: "eth_call",
				params: [{ to, data }, "latest"],
			}),
		});
		if (!res.ok) throw new Error(`RPC ${res.status} on ${chain}`);
		const json = (await res.json()) as { result?: string; error?: { message: string } };
		if (json.error) throw new Error(json.error.message);
		return json.result ?? "0x";
	}

	/** Batch several calls into one request via Multicall3. */
	async multicall(chain: ChainId, calls: Call[]): Promise<CallResult[]> {
		const hex = await this.call(chain, MULTICALL3, encodeAggregate3(calls));
		if (!hex || hex === "0x") throw new Error(`No Multicall3 on ${chain}`);
		return decodeAggregate3(hex);
	}
}

/** Decode an Error(string) revert, or null if it is not one. */
export function revertReason(data: string): string | null {
	const body = data.replace(/^0x/, "");
	if (!body.startsWith(ERROR_STRING)) return null;
	const tail = body.slice(ERROR_STRING.length);
	const len = Number(BigInt("0x" + tail.slice(64, 128)));
	const chars = tail.slice(128, 128 + len * 2).match(/../g) ?? [];
	return new TextDecoder().decode(Uint8Array.from(chars.map((h) => parseInt(h, 16))));
}

function encodeAggregate3(calls: Call[]): string {
	const structs = calls.map((c) => {
		const b = c.data.replace(/^0x/, "");
		const len = b.length / 2;
		const padded = b.padEnd(Math.ceil(len / 32) * 64, "0");
		return word(c.to) + word(1) + word(0x60) + word(len) + padded;
	});
	let cursor = calls.length * 32;
	const heads = structs.map((st) => {
		const head = word(cursor);
		cursor += st.length / 2;
		return head;
	});
	return SIG_AGGREGATE3 + word(0x20) + word(calls.length) + heads.join("") + structs.join("");
}

function decodeAggregate3(hex: string): CallResult[] {
	const body = hex.replace(/^0x/, "");
	const slot = (i: number) => BigInt("0x" + body.slice(i * 64, i * 64 + 64));
	const arr = Number(slot(0)) / 32;
	const n = Number(slot(arr));
	const base = arr + 1;
	const out: CallResult[] = [];
	for (let i = 0; i < n; i++) {
		const st = base + Number(slot(base + i)) / 32;
		const bytes = st + Number(slot(st + 1)) / 32;
		const len = Number(slot(bytes));
		out.push({
			success: slot(st) === 1n,
			data: "0x" + body.slice((bytes + 1) * 64, (bytes + 1) * 64 + len * 2),
		});
	}
	return out;
}
