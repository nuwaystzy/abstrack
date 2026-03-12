function normalizeErc1155Balance(raw) {
  if (raw == null) return 0;
  if (typeof raw === "string" && raw.startsWith("0x")) {
    try {
      const v = Number(BigInt(raw));
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  }
  const n = Number(raw || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function computeCollectionValue({ count = 0, floorPrice = 0 }) {
  const c = Number(count || 0);
  const f = Number(floorPrice || 0);
  if (!Number.isFinite(c) || !Number.isFinite(f) || c <= 0 || f <= 0) return 0;
  return c * f;
}

function pickBestDexPair(pairs = []) {
  const prioritizedQuotes = new Set(["WETH", "ETH", "USDC", "USDC.E", "USDT", "DAI"]);
  const usable = pairs
    .filter((p) => String(p?.chainId || "").toLowerCase() === "abstract")
    .map((p) => ({
      priceUsd: Number(p?.priceUsd || 0),
      liquidityUsd: Number(p?.liquidity?.usd || 0),
      vol24h: Number(p?.volume?.h24 || 0),
      quotePriority: prioritizedQuotes.has(String(p?.quoteToken?.symbol || "").toUpperCase()) ? 1 : 0,
    }))
    .filter((p) => Number.isFinite(p.priceUsd) && p.priceUsd > 0);
  usable.sort((a, b) => {
    if (b.quotePriority !== a.quotePriority) return b.quotePriority - a.quotePriority;
    if (b.liquidityUsd !== a.liquidityUsd) return b.liquidityUsd - a.liquidityUsd;
    return b.vol24h - a.vol24h;
  });
  return usable[0] || null;
}

module.exports = {
  normalizeErc1155Balance,
  computeCollectionValue,
  pickBestDexPair,
};

