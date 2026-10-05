"use client";

import { usePractice } from "@/components/providers/PracticeProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";

/**
 * What stands between a visitor and a practice action: connect a wallet,
 * then sign one free message. Renders null once the account is ready.
 */
export function PracticeGate({ compact = false, why = "to take practice positions" }: { compact?: boolean; why?: string }) {
  const { status, signIn, error, refresh } = usePractice();
  const { open } = useWalletModal();
  if (status === "ready") return null;
  const box = compact ? "" : "panel p-5";
  let title = "";
  let text = "";
  let action: React.ReactNode = null;
  if (status === "disconnected") {
    title = "Connect a wallet";
    text = `Connect any EVM wallet ${why}. Connecting only shares your address.`;
    action = (
      <button type="button" onClick={open} className="btn btn-ink h-11 w-full text-[15px]" data-testid="gate-connect">
        Connect wallet
      </button>
    );
  } else if (status === "not_configured") {
    title = "Practice opens soon";
    text = "Practice storage is not configured on this site yet. Prices and rounds above are live; entries open once storage is set up.";
  } else if (status === "offline") {
    title = "Could not reach the server";
    text = "Check your connection and try again.";
    action = (
      <button type="button" onClick={() => refresh()} className="btn btn-ghost h-11 w-full">
        Retry
      </button>
    );
  } else {
    const busy = status === "signing" || status === "checking";
    title = status === "checking" ? "Checking your account…" : "Sign in with your wallet";
    text = "One free signature proves the address is yours. It sends no transaction. New accounts start with 1 practice ETH (pETH).";
    action = (
      <button type="button" onClick={() => signIn()} disabled={busy} className="btn btn-accent h-11 w-full text-[15px]" data-testid="gate-sign">
        {status === "signing" ? "Confirm in wallet…" : status === "checking" ? "Checking…" : "Sign in · free"}
      </button>
    );
  }
  return (
    <div className={box} data-testid="practice-gate">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{text}</p>
      {action ? <div className="mt-3">{action}</div> : null}
      {error && status === "signed_out" ? <p className="mt-2 text-[12.5px] text-down">{error}</p> : null}
    </div>
  );
}
