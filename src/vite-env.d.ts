/// <reference types="vite/client" />

interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
}

interface Window {
  ethereum?: EthereumProvider;
}
