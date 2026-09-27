import { CheckCircle2 } from "lucide-react";
import { useShell } from "../lib/shell";

export function WalletPage() {
  const { walletAddress, walletReadiness, connectWallet, refreshWalletReadiness } = useShell();

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Wallet Skills</p>
        <h1>Skill-ready wallet actions</h1>
        <p className="lede">Skills the agent can call on your behalf. They never broadcast &mdash; the wallet or you must explicitly sign any final action.</p>
      </div>

      <section className="stackList">
        <div>
          <strong>scan_tokenized_stock_spreads</strong>
          <span>Calls <code>/api/agent/recommend/compact</code> with risk, platform, tabs and max trade size.</span>
        </div>
        <div>
          <strong>prepare_rebalance</strong>
          <span>Calls <code>/api/execution/prepare</code> and returns quote, approval, gas, simulation and no-broadcast checklist.</span>
        </div>
        <div>
          <strong>Safety boundary</strong>
          <span>The skill never broadcasts. You must explicitly handle any final signature.</span>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>On-chain wallet readiness</h2>
            <p className="hint">Checks BSC mainnet, latest block, BNB gas, USDC balance and USDC allowance directly through RPC. No transaction is sent.</p>
          </div>
        </div>
        {!walletAddress ? (
          <button onClick={connectWallet}>Connect wallet to check readiness</button>
        ) : (
          <button onClick={refreshWalletReadiness}>Check connected wallet</button>
        )}
        {walletReadiness && (
          <>
            <div className="statRow">
              <div>
                <span>Chain</span>
                <strong>{walletReadiness.chain}</strong>
              </div>
              <div>
                <span>Block</span>
                <strong>{walletReadiness.blockNumber}</strong>
              </div>
              <div>
                <span>BNB gas</span>
                <strong>{walletReadiness.balances.bnb}</strong>
              </div>
              <div>
                <span>USDC</span>
                <strong>{walletReadiness.balances.usdc}</strong>
              </div>
            </div>
            <div className="checklist">
              {[
                ["BSC mainnet", walletReadiness.checks.bscMainnet],
                ["USDC contract", walletReadiness.checks.usdcContractCode],
                ["Has gas", walletReadiness.checks.hasGas],
                ["Has USDC", walletReadiness.checks.hasUsdc],
                ["USDC allowance", walletReadiness.checks.hasAllowance],
                ["No broadcast", walletReadiness.checks.noBroadcast]
              ].map(([label, done]) => (
                <span className={done ? "done" : ""} key={String(label)}>
                  <CheckCircle2 size={14} />
                  {label}
                </span>
              ))}
            </div>
            <p className="statusLine">
              <strong>{walletReadiness.nextRequiredAction}</strong>
              <span>Allowance: {walletReadiness.balances.usdcAllowance} USDC</span>
            </p>
          </>
        )}
      </section>
    </>
  );
}
