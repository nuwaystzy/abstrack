import { NextResponse } from "next/server";
import {
  buildBlockiesDataUri,
  fetchAlchemyTokenBalances,
  fetchCoinGeckoTokenImages,
  fetchDexTokenProfiles,
  fetchEthUsdPrice,
  fetchPortalWalletTokens,
  fetchPortalTokenMetadata,
  fetchNativeBalanceWei,
  fetchTokenPricesUsd,
  resolveTrustWalletIcon,
  fetchWalletTokenTxs,
  invalidWalletResponse,
  isValidWalletAddress,
  missingApiKeyResponse,
  toNumFromRaw,
  weiToEth,
} from "../_lib/chain";

const API_KEY = process.env.ETHERSCAN_API_KEY;
const SPAM_TOKEN_CONTRACTS = new Set([
  "0xc63e78dcb71bbd4cb86d05be2c5fb871e6781eed", // SN3
]);

export async function GET(request) {
  if (!API_KEY) return missingApiKeyResponse();

  const { searchParams } = new URL(request.url);
  const wallet = String(searchParams.get("wallet") || "").trim();
  if (!isValidWalletAddress(wallet)) return invalidWalletResponse();

  try {
    const walletLower = wallet.toLowerCase();
    const [tokenTxs, alchemyTokens, portalWalletTokens, ethUsd, nativeWei] = await Promise.all([
      fetchWalletTokenTxs(wallet),
      fetchAlchemyTokenBalances(wallet),
      fetchPortalWalletTokens(wallet),
      fetchEthUsdPrice(),
      fetchNativeBalanceWei(wallet),
    ]);

    const balances = new Map();
    for (const tx of tokenTxs) {
      const contract = String(tx?.contractAddress || "").toLowerCase();
      if (!contract) continue;
      const decimals = Number(tx?.tokenDecimal || 18);
      const amount = toNumFromRaw(tx?.value || "0", decimals);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const from = String(tx?.from || "").toLowerCase();
      const to = String(tx?.to || "").toLowerCase();
      const delta = to === walletLower ? amount : from === walletLower ? -amount : 0;
      if (!delta) continue;

      const existing = balances.get(contract) || {
        symbol: tx?.tokenSymbol || "TOKEN",
        name: tx?.tokenName || tx?.tokenSymbol || "Unknown Token",
        balance: 0,
        contractAddress: contract,
        decimals,
      };
      existing.balance += delta;
      balances.set(contract, existing);
    }

    const fromTxList = Array.from(balances.values())
      .filter((t) => t.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    // Merge in Alchemy balances so portfolio can include tokens with no recent transfer rows.
    const mergedMap = new Map(fromTxList.map((t) => [String(t.contractAddress).toLowerCase(), t]));
    for (const t of alchemyTokens) {
      const key = String(t.contractAddress || "").toLowerCase();
      if (!key) continue;
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        if (Number(t.balance || 0) > Number(existing.balance || 0)) existing.balance = Number(t.balance || 0);
        if (!existing.symbol && t.symbol) existing.symbol = t.symbol;
        if (!existing.name && t.name) existing.name = t.name;
        if (t.logo) existing.icon = t.logo;
      } else {
        mergedMap.set(key, {
          symbol: t.symbol || "TOKEN",
          name: t.name || t.symbol || "Unknown Token",
          balance: Number(t.balance || 0),
          contractAddress: key,
          decimals: Number(t.decimals || 18),
          icon: t.logo || null,
        });
      }
    }

    for (const t of portalWalletTokens) {
      const key = String(t.contractAddress || "").toLowerCase();
      if (!key) continue;
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        if (Number(t.balance || 0) > Number(existing.balance || 0)) existing.balance = Number(t.balance || 0);
        if ((!existing.symbol || existing.symbol === "TOKEN") && t.symbol) existing.symbol = t.symbol;
        if ((!existing.name || existing.name === "Unknown Token") && t.name) existing.name = t.name;
        if (!existing.icon && t.image) existing.icon = t.image;
        if (!existing.portalPriceUsd && Number(t.priceUsd || 0) > 0) existing.portalPriceUsd = Number(t.priceUsd || 0);
        if (!existing.portalValueUsd && Number(t.valueUsd || 0) > 0) existing.portalValueUsd = Number(t.valueUsd || 0);
      } else {
        mergedMap.set(key, {
          symbol: t.symbol || "TOKEN",
          name: t.name || t.symbol || "Unknown Token",
          balance: Number(t.balance || 0),
          contractAddress: key,
          decimals: Number(t.decimals || 18),
          icon: t.image || null,
          portalPriceUsd: Number(t.priceUsd || 0),
          portalValueUsd: Number(t.valueUsd || 0),
        });
      }
    }

    const tokenList = Array.from(mergedMap.values())
      .filter((t) => Number(t.balance || 0) > 0)
      .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));

    const contracts = tokenList.map((t) => t.contractAddress);
    const [prices, dexProfiles, coingeckoMeta, portalMeta] = await Promise.all([
      fetchTokenPricesUsd(contracts),
      fetchDexTokenProfiles(contracts),
      fetchCoinGeckoTokenImages(contracts),
      fetchPortalTokenMetadata(contracts),
    ]);

    const trustIcons = {};
    for (const c of contracts) {
      trustIcons[c] = await resolveTrustWalletIcon(c);
    }

    const ethLikeSymbols = new Set(["ETH", "WETH", "ABSETH", "STETH", "RETH"]);

    const enriched = tokenList
      .map((t) => {
        const dexMeta = dexProfiles[t.contractAddress] || {};
        const cgMeta = coingeckoMeta[t.contractAddress] || {};
        const pMeta = portalMeta[t.contractAddress] || {};
        const rawSymbol = String(pMeta.symbol || t.symbol || cgMeta.symbol || "").toUpperCase() || "TOKEN";
        let priceUsd = Number(prices[t.contractAddress] || t.portalPriceUsd || 0);
        if (priceUsd <= 0 && ethUsd > 0 && rawSymbol.includes("ETH")) {
          priceUsd = ethUsd;
        }
        let valueUsd = t.balance * priceUsd;
        if (valueUsd <= 0 && Number(t.portalValueUsd || 0) > 0) {
          valueUsd = Number(t.portalValueUsd || 0);
        }
        const icon =
          t.icon ||
          pMeta.image ||
          cgMeta.image ||
          dexMeta.icon ||
          trustIcons[t.contractAddress] ||
          buildBlockiesDataUri(t.contractAddress);
        const iconSource = t.icon
          ? "portal-wallet"
          : pMeta.image
          ? "portal"
          : cgMeta.image
            ? "coingecko"
          : dexMeta.icon
            ? "dexscreener"
            : trustIcons[t.contractAddress]
              ? "trustwallet"
              : t.icon
                ? "alchemy"
                : "identicon";
        const priceConfidence =
          priceUsd > 0
            ? (priceUsd >= 1 ? "high" : priceUsd >= 0.01 ? "medium" : "low")
            : "unknown";
        return {
          symbol: rawSymbol,
          name: pMeta.name || t.name || cgMeta.name || dexMeta.name || t.symbol || "Unknown Token",
          balance: t.balance,
          priceUsd,
          valueUsd,
          priceConfidence,
          contractAddress: t.contractAddress,
          icon,
          iconSource,
        };
      })
      // Hide spam + tiny dust. Keep legit low-price tokens if portfolio value is meaningful.
      .filter((t) => !SPAM_TOKEN_CONTRACTS.has(String(t.contractAddress || "").toLowerCase()))
      .filter((t) => {
        const valueUsd = Number(t.valueUsd || 0);
        if (valueUsd >= 1) return true;
        if (ethLikeSymbols.has(String(t.symbol || "").toUpperCase()) && Number(t.balance || 0) > 0) return true;
        return false;
      });

    const nativeBalance = weiToEth(nativeWei);
    const wethPriceUsd =
      Number(
        enriched.find((t) => String(t.symbol || "").toUpperCase() === "WETH")?.priceUsd || 0
      ) || 0;
    const effectiveEthUsd = ethUsd > 0 ? ethUsd : wethPriceUsd;
    const nativeValueUsd = nativeBalance * effectiveEthUsd;
    const wethIcon =
      enriched.find((t) => String(t.symbol || "").toUpperCase() === "WETH")?.icon ||
      null;
    if (nativeBalance > 0) {
      enriched.unshift({
        symbol: "ETH",
        name: "Ether",
        balance: nativeBalance,
        priceUsd: effectiveEthUsd,
        valueUsd: nativeValueUsd,
        contractAddress: "native",
        icon: wethIcon || "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
      });
    }

    const totalUsd = enriched.reduce((sum, t) => sum + t.valueUsd, 0);
    return NextResponse.json({
      wallet,
      totalUsd,
      count: enriched.length,
      tokens: enriched,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to fetch tokens." }, { status: 500 });
  }
}
