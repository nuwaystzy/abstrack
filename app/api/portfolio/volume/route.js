import { NextResponse } from "next/server";
import {
  fetchEthUsdPrice,
  fetchWalletTxs,
  inRange,
  invalidWalletResponse,
  isValidWalletAddress,
  missingApiKeyResponse,
  timeframeBreakdownFromEthRows,
  weiToEth,
} from "../_lib/chain";

const API_KEY = process.env.ETHERSCAN_API_KEY;
const ANALYTICS_RANGE = "7d";

export async function GET(request) {
  if (!API_KEY) return missingApiKeyResponse();

  const { searchParams } = new URL(request.url);
  const wallet = String(searchParams.get("wallet") || "").trim();
  const range = ANALYTICS_RANGE;
  if (!isValidWalletAddress(wallet)) return invalidWalletResponse();

  try {
    const walletLower = wallet.toLowerCase();
    const [txs, ethUsd] = await Promise.all([
      fetchWalletTxs(wallet, { maxPages: 6, pageSize: 100 }),
      fetchEthUsdPrice(),
    ]);

    const rows = txs
      .map((tx) => {
        const from = String(tx?.from || "").toLowerCase();
        const to = String(tx?.to || "").toLowerCase();
        const touchesWallet = from === walletLower || to === walletLower;
        if (!touchesWallet) return null;
        const valueEth = weiToEth(tx?.value || 0);
        if (!valueEth || valueEth <= 0) return null;
        return { timeStamp: Number(tx?.timeStamp || 0), valueEth };
      })
      .filter(Boolean);

    const breakdownEth = timeframeBreakdownFromEthRows(rows);
    const breakdownUsd = {
      "24h": breakdownEth["24h"] * ethUsd,
      "7d": breakdownEth["7d"] * ethUsd,
      "30d": breakdownEth["30d"] * ethUsd,
      all: breakdownEth.all * ethUsd,
    };
    const valueUsd = breakdownUsd[range] ?? breakdownUsd["7d"];

    return NextResponse.json({
      wallet,
      range,
      valueUsd,
      ethUsd,
      breakdownUsd,
      points: rows
        .filter((r) => inRange(r.timeStamp, range))
        .slice(0, 30)
        .reverse()
        .map((r) => ({ t: r.timeStamp, vUsd: r.valueEth * ethUsd })),
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to fetch volume analytics." }, { status: 500 });
  }
}
