import { NextResponse } from "next/server";
import {
  buildBlockiesDataUri,
  fetchAlchemyOwnedNfts,
  fetchEthUsdPrice,
  invalidWalletResponse,
  isValidWalletAddress,
  missingApiKeyResponse,
} from "../_lib/chain";

const API_KEY = process.env.ETHERSCAN_API_KEY;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
const OPENSEA_BASE = "https://api.opensea.io";
const OPENSEA_CHAIN = "abstract";
const RESERVOIR_BASE = "https://api.reservoir.tools";

const COLLECTION_META_CACHE = new Map();
const COLLECTION_STATS_CACHE = new Map();
const COLLECTION_OFFER_CACHE = new Map();
const RESERVOIR_CACHE = new Map();
const NFT_TTL_MS = 30 * 60 * 1000;
const OFFER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function osHeaders() {
  return {
    Accept: "application/json",
    "x-api-key": OPENSEA_API_KEY || "",
  };
}

function toNum(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function pickPositive(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function inferOfferQuantity(offer) {
  // Some APIs return bundle/collection offer totals; normalize to unit price.
  const q = pickPositive(
    offer?.quantity,
    offer?.price?.quantity,
    offer?.protocol_data?.parameters?.quantity,
    offer?.asset?.quantity,
    offer?.criteria?.quantity
  );
  return q > 1 ? q : 1;
}

function parseTokenBalance(item) {
  const tokenType = String(item?.tokenType || item?.id?.tokenMetadata?.tokenType || "").toUpperCase();
  const rawBalance = item?.balance;
  if (tokenType.includes("1155")) {
    if (typeof rawBalance === "string" && rawBalance.startsWith("0x")) {
      try {
        const v = Number(BigInt(rawBalance));
        return Number.isFinite(v) && v > 0 ? v : 0;
      } catch {
        return 0;
      }
    }
    const v = Number(rawBalance || 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  return 1;
}

function extractContractAddress(nft) {
  return String(
    nft?.contract?.address ||
      nft?.contractAddress ||
      nft?.address ||
      ""
  ).toLowerCase();
}

function floorUsdFromStats(stats, ethUsd) {
  const s = stats || {};
  const direct = toNum(
    s?.total?.floor_price_usd ??
      s?.floor_price_usd ??
      s?.total?.floor_price?.usd ??
      s?.floor_price?.usd
  );
  if (direct > 0) return direct;
  const floorEth = toNum(s?.total?.floor_price ?? s?.floor_price);
  if (floorEth > 0 && ethUsd > 0) return floorEth * ethUsd;

  // fallback to last sale signal if floor missing
  const lastSaleUsd = toNum(
    s?.total?.last_sale_price_usd ??
      s?.last_sale_price_usd ??
      s?.total?.last_sale?.usd ??
      s?.last_sale?.usd
  );
  if (lastSaleUsd > 0) return lastSaleUsd;

  const lastSaleEth = toNum(s?.total?.last_sale_price ?? s?.last_sale_price);
  if (lastSaleEth > 0 && ethUsd > 0) return lastSaleEth * ethUsd;
  return 0;
}

function parseOfferUsd(offer, ethUsd) {
  const qty = inferOfferQuantity(offer);
  const direct = toNum(
    offer?.price?.usd ??
      offer?.current_price?.usd ??
      0
  );
  if (direct > 0) return direct / qty;

  const rawValue = toNum(offer?.price?.value ?? offer?.current_price ?? offer?.base_price ?? 0);
  if (!rawValue) return 0;
  const decimals = toNum(offer?.price?.currency?.decimals ?? offer?.payment_token?.decimals ?? 18);
  const symbol = String(
    offer?.price?.currency?.symbol ??
      offer?.payment_token?.symbol ??
      ""
  ).toUpperCase();
  const normalized = decimals > 0 ? rawValue / Math.pow(10, decimals) : rawValue;
  if (!normalized) return 0;
  if (symbol === "USDC" || symbol === "USDT" || symbol === "DAI") return normalized / qty;
  if (symbol === "ETH" || symbol === "WETH" || !symbol) return ethUsd > 0 ? (normalized * ethUsd) / qty : 0;
  return 0;
}

function isFreshOffer(offer) {
  const tsRaw = offer?.created_date || offer?.createdAt || offer?.created_at || offer?.timestamp || null;
  if (!tsRaw) return true; // keep if source doesn't provide timestamp
  const ts = new Date(tsRaw).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return Date.now() - ts <= OFFER_MAX_AGE_MS;
}

async function fetchOpenSeaCollectionByContract(contractAddress) {
  if (!OPENSEA_API_KEY || !contractAddress) return null;
  const key = String(contractAddress).toLowerCase();
  const hit = COLLECTION_META_CACHE.get(key);
  if (hit && Date.now() - hit.at < NFT_TTL_MS) return hit.value;

  const urls = [
    `${OPENSEA_BASE}/api/v2/chain/${OPENSEA_CHAIN}/collections/${contractAddress}`,
    `${OPENSEA_BASE}/api/v2/chain/${OPENSEA_CHAIN}/contract/${contractAddress}`,
    `${OPENSEA_BASE}/api/v2/chain/${OPENSEA_CHAIN}/contract/${contractAddress}/nfts?limit=1`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: osHeaders(), cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const base = data?.contract || data || {};
      const firstNft = Array.isArray(data?.nfts) ? data.nfts[0] : null;
      const value = {
        slug:
          data?.collection ||
          base?.collection ||
          base?.collection_slug ||
          base?.openSeaMetadata?.collectionSlug ||
          firstNft?.collection ||
          null,
        name:
          base?.name ||
          base?.collection_name ||
          base?.openSeaMetadata?.collectionName ||
          firstNft?.collection ||
          null,
        image:
          data?.image_url ||
          base?.image_url ||
          base?.image ||
          base?.openSeaMetadata?.imageUrl ||
          firstNft?.collection_image_url ||
          firstNft?.image_url ||
          null,
        floorPriceUsd:
          toNum(
            data?.stats?.total?.floor_price_usd ??
            data?.stats?.floor_price_usd ??
            data?.stats?.total?.floor_price?.usd ??
            data?.stats?.floor_price?.usd
          ) || 0,
      };
      COLLECTION_META_CACHE.set(key, { at: Date.now(), value });
      return value;
    } catch {
      // continue
    }
  }
  COLLECTION_META_CACHE.set(key, { at: Date.now(), value: null });
  return null;
}

async function fetchReservoirCollection(contractAddress) {
  if (!contractAddress) return null;
  const key = String(contractAddress).toLowerCase();
  const hit = RESERVOIR_CACHE.get(key);
  if (hit && Date.now() - hit.at < NFT_TTL_MS) return hit.value;
  try {
    const res = await fetch(
      `${RESERVOIR_BASE}/collections/v7?contract=${encodeURIComponent(contractAddress)}&limit=1`,
      { cache: "no-store", headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const c = Array.isArray(data?.collections) ? data.collections[0] : null;
    if (!c) return null;
    const topBidUsd = pickPositive(
      c?.topBid?.price?.amount?.usd,
      c?.topBid?.price?.netAmount?.usd,
      c?.topBid?.price?.gross?.amount?.usd,
      c?.topBid?.price?.amount?.native && c?.topBid?.price?.currency?.symbol === "USD"
        ? c?.topBid?.price?.amount?.native
        : 0
    );
    const value = {
      name: c?.name || null,
      image: c?.image || null,
      floorPriceUsd: toNum(c?.floorAsk?.price?.amount?.usd),
      topOfferUsd: toNum(topBidUsd),
    };
    RESERVOIR_CACHE.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

async function fetchOpenSeaNftsByAccount(wallet, limit = 50, cursor = "") {
  if (!OPENSEA_API_KEY) return { nfts: [], next: null };
  const qs = new URLSearchParams();
  qs.set("limit", String(Math.max(1, Math.min(50, Number(limit || 50)))));
  if (cursor) qs.set("next", cursor);
  const url = `${OPENSEA_BASE}/api/v2/chain/${OPENSEA_CHAIN}/account/${wallet}/nfts?${qs.toString()}`;
  const res = await fetch(url, { headers: osHeaders(), cache: "no-store" });
  if (!res.ok) return { nfts: [], next: null };
  const data = await res.json().catch(() => ({}));
  return {
    nfts: Array.isArray(data?.nfts) ? data.nfts : [],
    next: data?.next || null,
  };
}

async function fetchOwnershipFallbackFromOpenSea(wallet, maxPages = 8) {
  const groups = new Map();
  let cursor = "";
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchOpenSeaNftsByAccount(wallet, 50, cursor);
    if (!Array.isArray(page.nfts) || page.nfts.length === 0) break;
    for (const nft of page.nfts) {
      const contract = String(
        nft?.contract ||
          nft?.contract_address ||
          nft?.address ||
          nft?.contractAddress ||
          ""
      ).toLowerCase();
      if (!contract) continue;
      const key = contract;
      const current = groups.get(key) || {
        contractAddress: key,
        name: nft?.collection || nft?.contract?.name || "Unknown Collection",
        slug: nft?.collection || null,
        icon: nft?.collection_image_url || nft?.image_url || null,
        count: 0,
        tokenSamples: [],
      };
      current.count += 1;
      if (current.tokenSamples.length < 8) current.tokenSamples.push(nft);
      groups.set(key, current);
    }
    cursor = page.next || "";
    if (!cursor) break;
  }
  return groups;
}

async function fetchWalletCollectionImageMap(wallet, maxPages = 5) {
  const out = new Map();
  if (!OPENSEA_API_KEY) return out;
  let cursor = "";
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchOpenSeaNftsByAccount(wallet, 50, cursor);
    if (!Array.isArray(page.nfts) || page.nfts.length === 0) break;
    for (const nft of page.nfts) {
      const contract = String(
        nft?.contract ||
          nft?.contract_address ||
          nft?.address ||
          nft?.contractAddress ||
          ""
      ).toLowerCase();
      if (!contract || out.has(contract)) continue;
      const image =
        nft?.collection_image_url ||
        nft?.image_url ||
        nft?.image?.thumbnailUrl ||
        nft?.image?.cachedUrl ||
        null;
      if (image) out.set(contract, image);
    }
    cursor = page.next || "";
    if (!cursor) break;
  }
  return out;
}

async function fetchCollectionStats(slug) {
  if (!OPENSEA_API_KEY || !slug) return null;
  const key = String(slug).toLowerCase();
  const hit = COLLECTION_STATS_CACHE.get(key);
  if (hit && Date.now() - hit.at < NFT_TTL_MS) return hit.value;
  try {
    const res = await fetch(`${OPENSEA_BASE}/api/v2/collections/${encodeURIComponent(slug)}/stats`, {
      headers: osHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    COLLECTION_STATS_CACHE.set(key, { at: Date.now(), value: data });
    return data;
  } catch {
    return null;
  }
}

async function fetchCollectionTopOfferUsd(slug, ethUsd) {
  if (!OPENSEA_API_KEY || !slug) return 0;
  const key = String(slug).toLowerCase();
  const hit = COLLECTION_OFFER_CACHE.get(key);
  if (hit && Date.now() - hit.at < NFT_TTL_MS) return hit.value;

  const urls = [
    `${OPENSEA_BASE}/api/v2/offers/collection/${encodeURIComponent(slug)}/best`,
    `${OPENSEA_BASE}/api/v2/offers/collection/${encodeURIComponent(slug)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: osHeaders(), cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      // Some "best" endpoints return single offer object
      const direct = parseOfferUsd(data?.offer || data, ethUsd);
      if (direct > 0 && isFreshOffer(data?.offer || data)) {
        COLLECTION_OFFER_CACHE.set(key, { at: Date.now(), value: direct });
        return direct;
      }
      const list = Array.isArray(data?.offers)
        ? data.offers
        : Array.isArray(data?.orders)
          ? data.orders
          : Array.isArray(data)
            ? data
            : [];
      for (const offer of list) {
        if (!isFreshOffer(offer)) continue;
        const usd = parseOfferUsd(offer, ethUsd);
        if (usd > 0) {
          COLLECTION_OFFER_CACHE.set(key, { at: Date.now(), value: usd });
          return usd;
        }
      }
    } catch {
      // continue
    }
  }

  COLLECTION_OFFER_CACHE.set(key, { at: Date.now(), value: 0 });
  return 0;
}

function topOfferUsdFromStats(stats, ethUsd) {
  const s = stats || {};
  const usd = toNum(
    s?.total?.top_offer?.usd ??
      s?.top_offer?.usd ??
      s?.total?.top_offer_usd ??
      s?.top_offer_usd ??
      s?.total?.best_offer?.usd ??
      s?.best_offer?.usd
  );
  if (usd > 0) return usd;
  const rawEth = toNum(
    s?.total?.top_offer ??
      s?.top_offer ??
      s?.total?.top_offer_eth ??
      s?.top_offer_eth ??
      s?.total?.best_offer ??
      s?.best_offer
  );
  return rawEth > 0 && ethUsd > 0 ? rawEth * ethUsd : 0;
}

function pickSaneTopOffer(openSeaOfferUsd, reservoirOfferUsd, statsOfferUsd, floorPriceUsd) {
  const candidates = [toNum(openSeaOfferUsd), toNum(reservoirOfferUsd), toNum(statsOfferUsd)].filter((v) => v > 0);
  if (!candidates.length) return 0;
  if (!(floorPriceUsd > 0)) return Math.min(...candidates);

  // Top offer should generally be at/below floor; tolerate premium for market drift.
  const sane = candidates.filter((v) => v <= floorPriceUsd * 2.5);
  if (sane.length) return Math.max(...sane);
  // If all candidates are outliers, do not trust them.
  return 0;
}

async function buildCollections(wallet) {
  const [ownedNfts, ethUsd, walletImageMap, openSeaOwnership] = await Promise.all([
    fetchAlchemyOwnedNfts(wallet),
    fetchEthUsdPrice(),
    fetchWalletCollectionImageMap(wallet, 6),
    fetchOwnershipFallbackFromOpenSea(wallet, 12),
  ]);

  const groups = new Map();
  for (const nft of ownedNfts) {
    const contract = extractContractAddress(nft);
    if (!contract) continue;
    const spam = nft?.spamInfo?.isSpam === true;
    if (spam) continue;
    const count = parseTokenBalance(nft);
    if (!count || count <= 0) continue;

    const contractMeta = nft?.contract || {};
    const osMeta = contractMeta?.openSeaMetadata || {};
    const current = groups.get(contract) || {
      contractAddress: contract,
      name: contractMeta?.name || osMeta?.collectionName || "Unknown Collection",
      slug: osMeta?.collectionSlug || null,
      icon: osMeta?.imageUrl || nft?.image?.thumbnailUrl || nft?.image?.cachedUrl || null,
      count: 0,
      tokenSamples: [],
    };
    current.count += count;
    if (current.tokenSamples.length < 8) current.tokenSamples.push(nft);
    groups.set(contract, current);
  }

  // Hybrid pipeline:
  // Always merge OpenSea ownership so collections missed by Alchemy still appear.
  // Keep Alchemy as priority source for balances/counts when available.
  for (const [contract, osGroup] of openSeaOwnership.entries()) {
    const existing = groups.get(contract);
    if (!existing) {
      groups.set(contract, osGroup);
      continue;
    }

    // Merge metadata gaps only.
    if ((!existing.name || existing.name === "Unknown Collection") && osGroup?.name) {
      existing.name = osGroup.name;
    }
    if (!existing.slug && osGroup?.slug) {
      existing.slug = osGroup.slug;
    }
    if (!existing.icon && osGroup?.icon) {
      existing.icon = osGroup.icon;
    }

    // Keep Alchemy count, but enrich samples for better icon/item coverage.
    const existingSamples = Array.isArray(existing.tokenSamples) ? existing.tokenSamples : [];
    const osSamples = Array.isArray(osGroup?.tokenSamples) ? osGroup.tokenSamples : [];
    const seen = new Set(
      existingSamples.map((n) => String(n?.tokenId || n?.identifier || n?.id?.tokenId || n?.token_id || ""))
    );
    for (const sample of osSamples) {
      if (existingSamples.length >= 8) break;
      const sid = String(sample?.tokenId || sample?.identifier || sample?.id?.tokenId || sample?.token_id || "");
      if (sid && seen.has(sid)) continue;
      existingSamples.push(sample);
      if (sid) seen.add(sid);
    }
    existing.tokenSamples = existingSamples;
    groups.set(contract, existing);
  }

  const collections = Array.from(groups.values());
  for (let i = 0; i < collections.length; i++) {
    const c = collections[i];
    const [fromContractApi, reservoirMeta] = await Promise.all([
      fetchOpenSeaCollectionByContract(c.contractAddress),
      fetchReservoirCollection(c.contractAddress),
    ]);
    const slug = c.slug || fromContractApi?.slug || null;
    const name = c.name || fromContractApi?.name || reservoirMeta?.name || "Unknown Collection";
    const icon =
      walletImageMap.get(c.contractAddress) ||
      c.icon ||
      fromContractApi?.image ||
      reservoirMeta?.image ||
      c.tokenSamples?.[0]?.image?.thumbnailUrl ||
      c.tokenSamples?.[0]?.image?.cachedUrl ||
      buildBlockiesDataUri(c.contractAddress);
    const stats = await fetchCollectionStats(slug);
    const floorPrice =
      toNum(reservoirMeta?.floorPriceUsd) ||
      floorUsdFromStats(stats, ethUsd) ||
      toNum(fromContractApi?.floorPriceUsd);
    const topOffer = await fetchCollectionTopOfferUsd(slug, ethUsd);
    const statsOffer = topOfferUsdFromStats(stats, ethUsd);
    const safeFloor = floorPrice > 0 ? floorPrice : 0;
    const safeOffer = pickSaneTopOffer(
      topOffer,
      toNum(reservoirMeta?.topOfferUsd),
      statsOffer,
      safeFloor
    );
    const totalValue = safeOffer > 0 ? c.count * safeOffer : 0;
    c.slug = slug;
    c.name = name;
    c.icon = icon;
    c.floorPrice = safeFloor;
    c.topOffer = safeOffer;
    c.totalValue = totalValue > 0 ? totalValue : 0;
    c.sampleAssets = (Array.isArray(c.tokenSamples) ? c.tokenSamples : []).slice(0, 8).map((n) => {
      const tokenId = String(
        n?.tokenId || n?.identifier || n?.id?.tokenId || n?.token_id || ""
      );
      const image =
        n?.image?.thumbnailUrl ||
        n?.image?.cachedUrl ||
        n?.image?.originalUrl ||
        n?.image_url ||
        null;
      return {
        tokenId: tokenId || null,
        image,
        count: parseTokenBalance(n) || 1,
        assetUrl:
          tokenId && c.contractAddress
            ? `https://opensea.io/assets/abstract/${c.contractAddress}/${tokenId}`
            : (slug ? `https://opensea.io/collection/${slug}` : null),
      };
    });
    await new Promise((r) => setTimeout(r, 60));
  }

  // official UI usually sorts by portfolio value desc.
  collections.sort((a, b) => b.totalValue - a.totalValue);
  return collections;
}

export async function GET(request) {
  if (!API_KEY) return missingApiKeyResponse();
  const { searchParams } = new URL(request.url);
  const wallet = String(searchParams.get("wallet") || "").trim();
  if (!isValidWalletAddress(wallet)) return invalidWalletResponse();

  try {
    const collections = await buildCollections(wallet);
    const totalEstimatedUsd = collections.reduce((sum, c) => sum + toNum(c.totalValue), 0);
    return NextResponse.json({
      wallet,
      source: "alchemy+opensea",
      count: collections.length,
      totalEstimatedUsd,
      nfts: collections.map((c) => ({
        contractAddress: c.contractAddress,
        collectionName: c.name,
        collectionSlug: c.slug,
        collectionImage: c.icon,
        image: c.icon,
        count: c.count,
        floorPriceUsd: c.floorPrice,
        topOfferUsd: c.topOffer,
        totalValueUsd: c.totalValue,
        // Portfolio value follows top-offer semantics (count * top offer).
        estimatedValueUsd: c.totalValue,
        assetUrl: c.slug ? `https://opensea.io/collection/${c.slug}` : null,
        samples: c.sampleAssets || [],
      })),
      hasMore: false,
      nextCursor: null,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to fetch NFTs." }, { status: 500 });
  }
}
