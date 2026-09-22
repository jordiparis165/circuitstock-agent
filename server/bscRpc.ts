import { config } from "./env";
import { quoteTokens } from "./tokenRegistry";

type RpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
};

const defaultSpender = "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5";

function padAddress(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function hexToBigInt(value?: string): bigint {
  if (!value || value === "0x") return 0n;
  return BigInt(value);
}

function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  const trimmed = fraction.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return `${negative ? "-" : ""}${whole.toString()}${trimmed ? `.${trimmed}` : ""}`;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(config.bscRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const payload = (await response.json()) as RpcResponse<T>;
  if (payload.error) throw new Error(payload.error.message);
  return payload.result as T;
}

async function ethCall(to: string, data: string): Promise<bigint> {
  const result = await rpc<string>("eth_call", [{ to, data }, "latest"]);
  return hexToBigInt(result);
}

export async function walletReadiness(address: string, spender = defaultSpender) {
  const usdc = quoteTokens.usdc.address;
  const [chainId, blockHex, bnbHex, usdcCode, usdcBalance, usdcAllowance] = await Promise.all([
    rpc<string>("eth_chainId", []),
    rpc<string>("eth_blockNumber", []),
    rpc<string>("eth_getBalance", [address, "latest"]),
    rpc<string>("eth_getCode", [usdc, "latest"]),
    ethCall(usdc, `0x70a08231${padAddress(address)}`),
    ethCall(usdc, `0xdd62ed3e${padAddress(address)}${padAddress(spender)}`)
  ]);

  const bnb = hexToBigInt(bnbHex);
  const blockNumber = Number(hexToBigInt(blockHex));
  const hasGas = bnb > 0n;
  const hasUsdc = usdcBalance > 0n;
  const hasAllowance = usdcAllowance > 0n;

  return {
    ok: true,
    chainId,
    chain: chainId === "0x38" ? "BSC mainnet" : "unexpected",
    blockNumber,
    wallet: address,
    spender,
    checks: {
      bscMainnet: chainId === "0x38",
      usdcContractCode: usdcCode !== "0x",
      hasGas,
      hasUsdc,
      hasAllowance,
      noBroadcast: true
    },
    balances: {
      bnbWei: bnb.toString(),
      bnb: formatUnits(bnb, 18),
      usdcWei: usdcBalance.toString(),
      usdc: formatUnits(usdcBalance, quoteTokens.usdc.decimals),
      usdcAllowanceWei: usdcAllowance.toString(),
      usdcAllowance: formatUnits(usdcAllowance, quoteTokens.usdc.decimals)
    },
    nextRequiredAction: !hasGas
      ? "Fund wallet with a small amount of BNB for gas."
      : !hasUsdc
        ? "Fund wallet with USDC before buying tokenized stocks."
        : !hasAllowance
          ? "Sign USDC approval before swap simulation can pass."
          : "Wallet has gas, USDC and allowance. Prepare execution and simulate again."
  };
}
