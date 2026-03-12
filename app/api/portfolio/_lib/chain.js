import { NextResponse } from "next/server";

const ABSTRACT_CHAIN_ID = 2741;
const API_KEY = process.env.ETHERSCAN_API_KEY;

const TX_CACHE = new Map();
const TOKEN_TX_CACHE = new Map();
const NFT_TX_CACHE = new Map();
const PRICE_CACHE = new Map();
const DEX_PROFILE_CACHE = new Map();
const CG_META_CACHE = new Map();
const TRUST_ICON_CACHE = new Map();
const PORTAL_TOKEN_META_CACHE = new Map();
const INFLIGHT = new Map();
const ETH_PRICE_KEY = "eth-usd";
const DEX_SCREENER_BASE = "https://api.dexscreener.com/latest/dex/tokens";
const DEX_TOKEN_PROFILES_BASE = "https://api.dexscreener.com/token-profiles/latest/v1";
const ALCHEMY_RPC_URL =
  process.env.ALCHEMY_ABSTRACT_RPC_URL ||
  (process.env.ALCHEMY_API_KEY
    ? `https://abstract-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    : "");

const CACHE_TTL_MS = 60 * 1000;
const PRICE_TTL_MS = 5 * 60 * 1000;
const DEX_PROFILE_TTL_MS = 30 * 60 * 1000;
const META_TTL_MS = 30 * 60 * 1000;
const PAGE_DELAY_MS = 260;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs() {
  return Date.now();
}

export function invalidWalletResponse() {
  return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
}

export function missingApiKeyResponse() {
  return NextResponse.json(
    { error: "Server misconfiguration: ETHERSCAN_API_KEY is missing." },
    { status: 500 }
  );
}

export function isValidWalletAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function fetchEtherscan(params) {
  const qs = new URLSearchParams({
    chainid: String(ABSTRACT_CHAIN_ID),
    ...params,
    apikey: API_KEY || "",
  });
  const url = `https://api.etherscan.io/v2/api?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.result)) {
    if (data?.status === "0" && /No transactions found/i.test(String(data?.result || ""))) return [];
    throw new Error(String(data?.result || "Invalid Etherscan response"));
  }
  return data.result;
}

function isRateLimitErr(err) {
  const msg = String(err?.message || err || "");
  return /rate limit|max calls per sec|429|too many/i.test(msg);
}

async function fetchEtherscanWithRetry(params, attempts = 4) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fetchEtherscan(params);
    } catch (err) {
      lastErr = err;
      if (!isRateLimitErr(err) && i >= 2) break;
      await sleep(PAGE_DELAY_MS * i);
    }
  }
  throw lastErr || new Error("Failed to fetch Etherscan");
}

async function fetchPagedList({ action, wallet, pageSize = 100, maxPages = 20 }) {
  let all = [];
  for (let page = 1; page <= maxPages; page++) {
    const pageItems = await fetchEtherscanWithRetry({
      module: "account",
      action,
      address: wallet,
      page: String(page),
      offset: String(pageSize),
      sort: "desc",
    });
    if (!pageItems.length) break;
    all = all.concat(pageItems);
    if (pageItems.length < pageSize) break;
    await sleep(PAGE_DELAY_MS);
  }
  return all;
}

function getCached(cache, key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (nowMs() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(cache, key, value) {
  cache.set(key, { at: nowMs(), value });
}

export async function fetchWalletTxs(wallet, options = {}) {
  const pageSize = Math.max(20, Math.min(100, Number(options?.pageSize || 100)));
  const maxPages = Math.max(1, Math.min(30, Number(options?.maxPages || 15)));
  const key = wallet.toLowerCase();
  const scopedKey = `${key}:${pageSize}:${maxPages}`;
  const cached = getCached(TX_CACHE, scopedKey);
  if (cached) return cached;
  const inflightKey = `txs:${scopedKey}`;
  if (INFLIGHT.has(inflightKey)) return INFLIGHT.get(inflightKey);
  const promise = fetchPagedList({ action: "txlist", wallet, pageSize, maxPages })
    .then((txs) => {
      setCached(TX_CACHE, scopedKey, txs);
      INFLIGHT.delete(inflightKey);
      return txs;
    })
    .catch((err) => {
      INFLIGHT.delete(inflightKey);
      throw err;
    });
  INFLIGHT.set(inflightKey, promise);
  const txs = await promise;
  return txs;
}

export async function fetchWalletTokenTxs(wallet) {
  const key = wallet.toLowerCase();
  const cached = getCached(TOKEN_TX_CACHE, key);
  if (cached) return cached;
  const inflightKey = `tokentx:${key}`;
  if (INFLIGHT.has(inflightKey)) return INFLIGHT.get(inflightKey);
  const promise = fetchPagedList({ action: "tokentx", wallet, pageSize: 100, maxPages: 12 })
    .then((txs) => {
      setCached(TOKEN_TX_CACHE, key, txs);
      INFLIGHT.delete(inflightKey);
      return txs;
    })
    .catch((err) => {
      INFLIGHT.delete(inflightKey);
      throw err;
    });
  INFLIGHT.set(inflightKey, promise);
  const txs = await promise;
  return txs;
}

export async function fetchWalletNftTxs(wallet) {
  const key = wallet.toLowerCase();
  const cached = getCached(NFT_TX_CACHE, key);
  if (cached) return cached;
  const inflightKey = `nfttx:${key}`;
  if (INFLIGHT.has(inflightKey)) return INFLIGHT.get(inflightKey);
  const promise = fetchPagedList({ action: "tokennfttx", wallet, pageSize: 100, maxPages: 12 })
    .then((txs) => {
      setCached(NFT_TX_CACHE, key, txs);
      INFLIGHT.delete(inflightKey);
      return txs;
    })
    .catch((err) => {
      INFLIGHT.delete(inflightKey);
      throw err;
    });
  INFLIGHT.set(inflightKey, promise);
  const txs = await promise;
  return txs;
}

export async function fetchNativeBalanceWei(wallet) {
  const qs = new URLSearchParams({
    chainid: String(ABSTRACT_CHAIN_ID),
    module: "account",
    action: "balance",
    address: wallet,
    tag: "latest",
    apikey: API_KEY || "",
  });
  const url = `https://api.etherscan.io/v2/api?${qs.toString()}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      if (data?.status === "1" || data?.message === "OK") {
        return String(data?.result || "0");
      }
    }
  } catch {
    // fallback below
  }

  // Fallback: Alchemy RPC native balance
  try {
    const result = await alchemyRpc("eth_getBalance", [wallet, "latest"]);
    if (typeof result === "string" && result.startsWith("0x")) {
      return result;
    }
  } catch {
    // ignore
  }
  return "0";
}

export function weiToEth(wei) {
  const raw = String(wei || "0");
  try {
    const n = raw.startsWith("0x") ? BigInt(raw) : BigInt(raw);
    if (n <= 0n) return 0;
    const intPart = n / 1000000000000000000n;
    const fracPart = n % 1000000000000000000n;
    const frac = Number(fracPart) / 1e18;
    return Number(intPart) + frac;
  } catch {
    const n = Number(raw || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n / 1e18;
  }
}

export function unixNowSec() {
  return Math.floor(Date.now() / 1000);
}

export function inRange(ts, range) {
  if (range === "all") return true;
  const now = unixNowSec();
  const delta = now - Number(ts || 0);
  if (range === "24h") return delta <= 86400;
  if (range === "7d") return delta <= 86400 * 7;
  if (range === "30d") return delta <= 86400 * 30;
  return true;
}

export function toNumFromRaw(raw, decimals) {
  const v = Number(raw || 0);
  const d = Number(decimals || 0);
  if (!Number.isFinite(v)) return 0;
  if (!Number.isFinite(d) || d <= 0) return v;
  return v / Math.pow(10, d);
}

export async function fetchEthUsdPrice() {
  const cached = PRICE_CACHE.get(ETH_PRICE_KEY);
  if (cached && nowMs() - cached.at < PRICE_TTL_MS) return cached.value;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("price fetch failed");
    const data = await res.json();
    const value = Number(data?.ethereum?.usd || 0);
    PRICE_CACHE.set(ETH_PRICE_KEY, { at: nowMs(), value: Number.isFinite(value) ? value : 0 });
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export async function fetchTokenPricesUsd(contracts) {
  const prices = {};
  const normalized = Array.from(
    new Set((contracts || []).map((c) => String(c || "").toLowerCase()).filter(Boolean))
  );
  if (!normalized.length) return prices;

  const uncached = [];
  for (const addr of normalized) {
    const hit = PRICE_CACHE.get(addr);
    if (hit && nowMs() - hit.at < PRICE_TTL_MS) {
      prices[addr] = hit.value;
    } else {
      uncached.push(addr);
    }
  }

  if (uncached.length) {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/token_price/abstract?contract_addresses=${uncached.join(",")}&vs_currencies=usd`,
        { cache: "no-store", headers: { Accept: "application/json" } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const addr of uncached) {
          const p = Number(data?.[addr]?.usd || 0);
          const value = Number.isFinite(p) ? p : 0;
          prices[addr] = value;
          PRICE_CACHE.set(addr, { at: nowMs(), value });
        }
      } else {
        for (const addr of uncached) prices[addr] = 0;
      }
    } catch {
      for (const addr of uncached) prices[addr] = 0;
    }
  }

  // Dexscreener sanity/fallback:
  // - Prefer Abstract pairs only.
  // - Prioritize liquid quote pairs (WETH/ETH/USDC/USDC.e).
  // - If CoinGecko deviates too far from liquid on-chain price, trust Dex (often faster on Abstract).
  const prioritizedQuotes = new Set(["WETH", "ETH", "USDC", "USDC.E", "USDT", "DAI"]);
  for (let i = 0; i < normalized.length; i++) {
    const addr = normalized[i];
    try {
      const res = await fetch(`${DEX_SCREENER_BASE}/${addr}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      const abstractPairs = pairs.filter((p) => String(p?.chainId || "").toLowerCase() === "abstract");
      const usablePairs = abstractPairs
        .map((p) => {
          const priceUsd = Number(p?.priceUsd || 0);
          const liquidityUsd = Number(p?.liquidity?.usd || 0);
          const vol24h = Number(p?.volume?.h24 || 0);
          const quoteSymbol = String(p?.quoteToken?.symbol || "").toUpperCase();
          return {
            priceUsd,
            liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : 0,
            vol24h: Number.isFinite(vol24h) ? vol24h : 0,
            quotePriority: prioritizedQuotes.has(quoteSymbol) ? 1 : 0,
          };
        })
        .filter((p) => Number.isFinite(p.priceUsd) && p.priceUsd > 0);

      if (!usablePairs.length) continue;
      usablePairs.sort((a, b) => {
        if (b.quotePriority !== a.quotePriority) return b.quotePriority - a.quotePriority;
        if (b.liquidityUsd !== a.liquidityUsd) return b.liquidityUsd - a.liquidityUsd;
        return b.vol24h - a.vol24h;
      });
      const dexPrice = usablePairs[0]?.priceUsd || 0;
      if (!Number.isFinite(dexPrice) || dexPrice <= 0) continue;

      const cgPrice = Number(prices[addr] || 0);
      const useDex =
        !cgPrice ||
        (cgPrice > 0 &&
          (dexPrice / cgPrice > 8 || cgPrice / dexPrice > 8) &&
          usablePairs[0].liquidityUsd >= 5000);

      if (useDex) {
        prices[addr] = dexPrice;
        PRICE_CACHE.set(addr, { at: nowMs(), value: dexPrice });
      }
    } catch {
      // ignore per-token dex fallback errors
    }
    if ((i + 1) % 8 === 0) await sleep(180);
  }

  return prices;
}

export async function fetchDexTokenProfiles(contracts) {
  const out = {};
  const normalized = Array.from(
    new Set((contracts || []).map((c) => String(c || "").toLowerCase()).filter(Boolean))
  );
  if (!normalized.length) return out;

  for (const addr of normalized) {
    const hit = DEX_PROFILE_CACHE.get(addr);
    if (hit && nowMs() - hit.at < DEX_PROFILE_TTL_MS) {
      out[addr] = hit.value;
    }
  }

  const missing = normalized.filter((addr) => !out[addr]);
  for (let i = 0; i < missing.length; i++) {
    const addr = missing[i];
    try {
      const url = `${DEX_TOKEN_PROFILES_BASE}?chainId=abstract&tokenAddress=${addr}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      const exact =
        list.find((p) => String(p?.tokenAddress || "").toLowerCase() === addr) ||
        list[0] ||
        null;
      if (!exact) continue;
      const value = {
        icon: exact?.icon || null,
        name: exact?.header || exact?.description || null,
      };
      DEX_PROFILE_CACHE.set(addr, { at: nowMs(), value });
      out[addr] = value;
    } catch {
      // ignore profile errors
    }
    if ((i + 1) % 10 === 0) await sleep(120);
  }
  return out;
}

export async function fetchCoinGeckoTokenImages(contracts) {
  const out = {};
  const normalized = Array.from(
    new Set((contracts || []).map((c) => String(c || "").toLowerCase()).filter(Boolean))
  );
  if (!normalized.length) return out;

  const missing = [];
  for (const addr of normalized) {
    const hit = CG_META_CACHE.get(addr);
    if (hit && nowMs() - hit.at < META_TTL_MS) out[addr] = hit.value;
    else missing.push(addr);
  }

  for (let i = 0; i < missing.length; i++) {
    const addr = missing[i];
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/abstract/contract/${addr}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const value = {
        image: data?.image?.small || data?.image?.thumb || data?.image?.large || null,
        name: data?.name || null,
        symbol: data?.symbol ? String(data.symbol).toUpperCase() : null,
      };
      CG_META_CACHE.set(addr, { at: nowMs(), value });
      out[addr] = value;
    } catch {
      // ignore
    }
    await sleep(120);
  }
  return out;
}

function getPortalHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0",
  };
}

function extractPortalTokenAddress(token) {
  return String(
    token?.address ||
      token?.contractAddress ||
      token?.tokenAddress ||
      token?.contract ||
      ""
  ).toLowerCase();
}

export async function fetchPortalTokenMetadata(contracts) {
  const out = {};
  const normalized = Array.from(
    new Set((contracts || []).map((c) => String(c || "").toLowerCase()).filter(Boolean))
  );
  if (!normalized.length) return out;

  const missing = [];
  for (const addr of normalized) {
    const hit = PORTAL_TOKEN_META_CACHE.get(addr);
    if (hit && nowMs() - hit.at < META_TTL_MS) out[addr] = hit.value;
    else missing.push(addr);
  }

  for (let i = 0; i < missing.length; i++) {
    const addr = missing[i];
    try {
      const res = await fetch(
        `https://backend.portal.abs.xyz/api/search/global?query=${encodeURIComponent(addr)}`,
        { cache: "no-store", headers: getPortalHeaders() }
      );
      if (!res.ok) {
        PORTAL_TOKEN_META_CACHE.set(addr, { at: nowMs(), value: null });
        continue;
      }
      const data = await res.json().catch(() => ({}));
      const tokens = Array.isArray(data?.results?.tokens) ? data.results.tokens : [];
      const exact =
        tokens.find((t) => extractPortalTokenAddress(t) === addr) ||
        tokens.find((t) => extractPortalTokenAddress(t).startsWith(addr.slice(0, 10))) ||
        null;

      const value = exact
        ? {
            image: exact?.image || exact?.icon || null,
            name: exact?.name || null,
            symbol: exact?.symbol ? String(exact.symbol).toUpperCase() : null,
          }
        : null;
      PORTAL_TOKEN_META_CACHE.set(addr, { at: nowMs(), value });
      if (value) out[addr] = value;
    } catch {
      PORTAL_TOKEN_META_CACHE.set(addr, { at: nowMs(), value: null });
    }
    await sleep(120);
  }
  return out;
}

function quickHash(seed) {
  let h = 2166136261;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildBlockiesDataUri(seed) {
  const hash = quickHash(seed);
  const hue = hash % 360;
  const bgHue = (hue + 180) % 360;
  const fg = `hsl(${hue} 72% 60%)`;
  const bg = `hsl(${bgHue} 30% 14%)`;
  const grid = [];
  let x = hash;
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 4; c++) {
      x = (x * 1664525 + 1013904223) >>> 0;
      row.push((x & 1) === 1);
    }
    grid.push([...row, ...row.slice().reverse()]);
  }
  const cell = 8;
  let rects = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (grid[r][c]) rects += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${fg}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${bg}"/>${rects}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function resolveTrustWalletIcon(address) {
  const key = String(address || "").toLowerCase();
  if (!key) return null;
  const hit = TRUST_ICON_CACHE.get(key);
  if (hit && nowMs() - hit.at < META_TTL_MS) return hit.value;
  const candidates = [
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${address}/logo.png`,
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${key}/logo.png`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (res.ok) {
        TRUST_ICON_CACHE.set(key, { at: nowMs(), value: url });
        return url;
      }
    } catch {
      // ignore
    }
  }
  TRUST_ICON_CACHE.set(key, { at: nowMs(), value: null });
  return null;
}

async function alchemyRpc(method, params) {
  if (!ALCHEMY_RPC_URL) return null;
  const res = await fetch(ALCHEMY_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  if (data?.error) return null;
  return data?.result ?? null;
}

export async function alchemyRpcCall(method, params) {
  return alchemyRpc(method, params);
}

export async function fetchAlchemyTokenBalances(wallet) {
  if (!ALCHEMY_RPC_URL) return [];
  const list = [];
  let pageKey = null;
  for (let i = 0; i < 20; i++) {
    const params = pageKey
      ? [wallet, "erc20", { pageKey }]
      : [wallet, "erc20"];
    const balances = await alchemyRpc("alchemy_getTokenBalances", params);
    const page = Array.isArray(balances?.tokenBalances) ? balances.tokenBalances : [];
    list.push(...page);
    pageKey = balances?.pageKey || null;
    if (!pageKey) break;
    await sleep(80);
  }
  const out = [];
  function fromHexWithDecimals(rawHex, decimals) {
    try {
      const raw = BigInt(String(rawHex || "0"));
      if (raw <= 0n) return 0;
      const d = BigInt(Math.max(0, Number(decimals || 18)));
      const base = 10n ** d;
      const intPart = raw / base;
      const fracPart = raw % base;
      const fracScale = 1_000_000n; // 6 decimals precision is enough for UI value
      const frac = Number((fracPart * fracScale) / base) / Number(fracScale);
      return Number(intPart) + frac;
    } catch {
      return 0;
    }
  }
  for (const item of list) {
    const contract = String(item?.contractAddress || "").toLowerCase();
    const raw = String(item?.tokenBalance || "0");
    if (!contract || !raw || raw === "0x0" || raw === "0") continue;
    const meta = await alchemyRpc("alchemy_getTokenMetadata", [contract]);
    const decimals = Number(meta?.decimals ?? 18);
    const symbol = meta?.symbol || "TOKEN";
    const name = meta?.name || symbol;
    const logo = meta?.logo || null;
    const balance = fromHexWithDecimals(raw, decimals);
    if (balance > 0) {
      out.push({
        contractAddress: contract,
        symbol,
        name,
        decimals,
        balance,
        logo,
      });
    }
    if (out.length % 12 === 0) await sleep(120);
  }
  return out;
}

export async function fetchAlchemyOwnedNfts(wallet, maxPages = 25) {
  if (!ALCHEMY_RPC_URL) return [];
  const out = [];
  let pageKey = null;

  async function fetchPage(owner, cursor) {
    const optionCandidates = [
      { withMetadata: true, excludeFilters: ["SPAM"], pageKey: cursor, pageSize: 100 },
      { withMetadata: true, pageKey: cursor, pageSize: 100 },
      { pageKey: cursor, pageSize: 100 },
      cursor ? { pageKey: cursor } : {},
    ];
    const methodCandidates = ["alchemy_getNFTsForOwner", "alchemy_getNftsForOwner"];

    for (const method of methodCandidates) {
      for (const opts of optionCandidates) {
        const cleaned = Object.fromEntries(
          Object.entries(opts).filter(([, v]) => v !== undefined && v !== null && v !== "")
        );
        const params = Object.keys(cleaned).length ? [owner, cleaned] : [owner];
        const result = await alchemyRpc(method, params);
        if (!result) continue;
        const nfts = Array.isArray(result?.ownedNfts)
          ? result.ownedNfts
          : Array.isArray(result?.nfts)
            ? result.nfts
            : [];
        if (nfts.length || result?.pageKey) {
          return { nfts, pageKey: result?.pageKey || null };
        }
      }
    }
    return { nfts: [], pageKey: null };
  }

  for (let i = 0; i < maxPages; i++) {
    const result = await fetchPage(wallet, pageKey);
    const nfts = Array.isArray(result?.nfts) ? result.nfts : [];
    out.push(...nfts);
    pageKey = result?.pageKey || null;
    if (!pageKey) break;
    await sleep(100);
  }
  return out;
}

export function timeframeBreakdownFromEthRows(rows) {
  const ranges = ["24h", "7d", "30d", "all"];
  const out = { "24h": 0, "7d": 0, "30d": 0, all: 0 };
  for (const row of rows) {
    for (const range of ranges) {
      if (inRange(row.timeStamp, range)) out[range] += row.valueEth;
    }
  }
  return out;
}
