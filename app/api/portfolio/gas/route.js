import { NextResponse } from "next/server";
import {
  fetchWalletTxs,
  inRange,
  invalidWalletResponse,
  isValidWalletAddress,
  missingApiKeyResponse,
  timeframeBreakdownFromEthRows,
} from "../_lib/chain";

const API_KEY = process.env.ETHERSCAN_API_KEY;
const ANALYTICS_RANGE = "7d";

function successful(tx) {
  if (typeof tx?.txreceipt_status !== "undefined") return tx.txreceipt_status === "1";
  if (typeof tx?.isError !== "undefined") return tx.isError === "0";
  return true;
}

export async function GET(request) {
  if (!API_KEY) return missingApiKeyResponse();

  const { searchParams } = new URL(request.url);
  const wallet = String(searchParams.get("wallet") || "").trim();
  const range = ANALYTICS_RANGE;
  if (!isValidWalletAddress(wallet)) return invalidWalletResponse();

  try {
    const walletLower = wallet.toLowerCase();
    const txs = await fetchWalletTxs(wallet, { maxPages: 6, pageSize: 100 });
    const rows = txs
      .filter((tx) => String(tx?.from || "").toLowerCase() === walletLower)
      .filter(successful)
      .map((tx) => {
        const gasUsed = Number(tx?.gasUsed || tx?.gas || 0);
        const gasPrice = Number(tx?.gasPrice || 0);
        const valueEth = (gasUsed * gasPrice) / 1e18;
        return { timeStamp: Number(tx?.timeStamp || 0), valueEth: Number.isFinite(valueEth) ? valueEth : 0 };
      })
      .filter((r) => r.valueEth > 0);

    const breakdown = timeframeBreakdownFromEthRows(rows);
    const valueEth = breakdown[range] ?? breakdown["7d"];

    return NextResponse.json({
      wallet,
      range,
      valueEth,
      breakdown,
      points: rows
        .filter((r) => inRange(r.timeStamp, range))
        .slice(0, 30)
        .reverse()
        .map((r) => ({ t: r.timeStamp, v: r.valueEth })),
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to fetch gas analytics." }, { status: 500 });
  }
}
