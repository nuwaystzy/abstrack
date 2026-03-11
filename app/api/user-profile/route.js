import { NextResponse } from "next/server";

let tiersCache = null;
let tiersCacheAt = 0;
const TIERS_TTL_MS = 5 * 60 * 1000;

const COMMUNITY_TIER_IDS = Array.from({ length: 22 }, (_, i) => i + 1);
const COMMUNITY_USERS_TTL_MS = 10 * 60 * 1000;
const COMMUNITY_WALLET_TTL_MS = 60 * 60 * 1000;
const communityTierUsersCache = new Map(); // key: `${tier}:${page}:${limit}`
const communityWalletTierCache = new Map(); // key: walletLower -> { at, tierV2 }

function normalizeAddress(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isValidWalletAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getAbsHeaders() {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0",
  };

  if (process.env.ABS_PORTAL_BEARER) {
    headers.Authorization = `Bearer ${process.env.ABS_PORTAL_BEARER}`;
  }
  if (process.env.ABS_PORTAL_COOKIE) {
    headers.Cookie = process.env.ABS_PORTAL_COOKIE;
  }

  return headers;
}

function getAbslysisHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    Origin: "https://abslysis.xyz",
    Referer: "https://abslysis.xyz/user",
  };
}

function extractAddress(user) {
  return (
    user?.address ||
    user?.wallet ||
    user?.walletAddress ||
    user?.primaryWallet?.address ||
    user?.wallets?.[0]?.address ||
    ""
  );
}

function extractXP(user) {
  const candidates = [
    user?.xp,
    user?.experience,
    user?.totalXp,
    user?.xpPoints,
    user?.points,
    user?.stats?.xp,
    user?.profile?.xp,
    user?.progress?.xp,
    user?.tierProgress?.xp,
    user?.tierProgress?.currentXp,
  ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function extractTierInfo(user) {
  const displayName =
    user?.tier?.displayName ||
    user?.currentTier?.displayName ||
    user?.tierDisplayName ||
    user?.displayTier ||
    null;

  const mainTier =
    user?.tier?.mainTier ||
    user?.currentTier?.mainTier ||
    user?.tierMain ||
    null;

  return { displayName, mainTier };
}

function extractTierV2(user) {
  const candidates = [
    user?.tierV2,
    user?.tier_v2,
    user?.tierId,
    user?.tier_id,
    user?.tier,
    user?.profile?.tierV2,
    user?.profile?.tier_v2,
    user?.profile?.tierId,
    user?.data?.tierV2,
    user?.data?.tier_v2,
    user?.data?.tierId,
    user?.user?.tierV2,
    user?.user?.tier_v2,
    user?.user?.tierId,
  ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

async function getTiersV2() {
  const now = Date.now();
  if (tiersCache && now - tiersCacheAt < TIERS_TTL_MS) return tiersCache;

  const res = await fetch("https://backend.portal.abs.xyz/api/tiers/v2", {
    headers: getAbsHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const data = await res.json();
  const list = Array.isArray(data) ? data : Array.isArray(data?.tiers) ? data.tiers : [];
  tiersCache = list;
  tiersCacheAt = now;
  return list;
}

function extractUsersFromAbslysisPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.results?.users)) return payload.results.users;
  return [];
}

async function fetchAbslysisUsersByTier(tierId, page, limit) {
  const now = Date.now();
  const cacheKey = `${tierId}:${page}:${limit}`;
  const cached = communityTierUsersCache.get(cacheKey);
  if (cached && now - cached.at < COMMUNITY_USERS_TTL_MS) {
    return cached.users;
  }

  const baseUrl = process.env.COMMUNITY_ABSLYSIS_BASE_URL || "https://abslysis.xyz";
  const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/user/fetchUsersByTier`;
  const res = await fetch(url, {
    method: "POST",
    headers: getAbslysisHeaders(),
    body: JSON.stringify({ tier: tierId, page, limit }),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const payload = await res.json();
  const users = extractUsersFromAbslysisPayload(payload);
  communityTierUsersCache.set(cacheKey, { at: now, users });
  return users;
}

async function resolveTierFromAbslysis(wallet) {
  const now = Date.now();
  const normalized = normalizeAddress(wallet);
  const cached = communityWalletTierCache.get(normalized);
  if (cached && now - cached.at < COMMUNITY_WALLET_TTL_MS) return cached.tierV2;

  const maxPages = Number(process.env.COMMUNITY_ABSLYSIS_MAX_PAGES || 30);
  const pageSize = Number(process.env.COMMUNITY_ABSLYSIS_PAGE_SIZE || 200);

  for (const tierId of COMMUNITY_TIER_IDS) {
    let previousFirstKey = null;
    for (let page = 1; page <= maxPages; page++) {
      try {
        const users = await fetchAbslysisUsersByTier(tierId, page, pageSize);
        if (!Array.isArray(users) || users.length === 0) break;

        const first = users[0] || {};
        const firstKey = `${normalizeAddress(first?.walletAddress || first?.address)}:${first?.id || ""}:${first?.name || ""}`;
        if (firstKey && firstKey === previousFirstKey) break;
        previousFirstKey = firstKey;

        const hit = users.find((u) => normalizeAddress(u?.walletAddress || u?.address) === normalized);
        if (!hit) {
          if (users.length < pageSize) break;
          continue;
        }

        const raw = hit?.tierV2 ?? hit?.tier_v2 ?? hit?.tierId ?? hit?.tier_id ?? hit?.tier ?? tierId;
        const tierV2 = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(tierV2)) {
          communityWalletTierCache.set(normalized, { at: now, tierV2 });
          return tierV2;
        }
      } catch {
        // Ignore per-page failure and continue scanning.
      }
    }
  }

  return null;
}

function findBestMatch(candidates, wallet) {
  const target = normalizeAddress(wallet);
  if (!Array.isArray(candidates)) return null;

  const exact = candidates.find((u) => normalizeAddress(extractAddress(u)) === target);
  if (exact) return exact;

  const shortStart = target.slice(0, 10);
  const shortEnd = target.slice(-8);
  return (
    candidates.find((u) => {
      const addr = normalizeAddress(extractAddress(u));
      return addr.startsWith(shortStart) && addr.endsWith(shortEnd);
    }) || null
  );
}

function findBestByQuery(candidates, query) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const q = String(query || "").trim().toLowerCase();
  if (!q) return candidates[0];

  const byAddress = candidates.find((u) => normalizeAddress(extractAddress(u)) === q);
  if (byAddress) return byAddress;

  const exactName = candidates.find((u) => String(u?.name || u?.username || "").toLowerCase() === q);
  if (exactName) return exactName;

  const startsWithName = candidates.find((u) => String(u?.name || u?.username || "").toLowerCase().startsWith(q));
  if (startsWithName) return startsWithName;

  const containsName = candidates.find((u) => String(u?.name || u?.username || "").toLowerCase().includes(q));
  if (containsName) return containsName;

  return candidates[0];
}

function mapSuggestionUser(user) {
  const resolvedWallet = extractAddress(user);
  return {
    username: user?.name || user?.username || null,
    avatar: user?.image || user?.avatar || null,
    verified: (user?.verification || "").toUpperCase() === "VERIFIED",
    resolvedWallet: isValidWalletAddress(resolvedWallet) ? resolvedWallet : null,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");
  const query = searchParams.get("query");
  const suggest = searchParams.get("suggest") === "1";
  const limitRaw = Number(searchParams.get("limit") || 5);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10, limitRaw)) : 5;
  const input = (query || wallet || "").trim();
  const debug = searchParams.get("debug") === "1";

  if (!input) {
    return NextResponse.json({ error: "Missing query." }, { status: 400 });
  }

  try {
    if (suggest) {
      const res = await fetch(`https://backend.portal.abs.xyz/api/search/global?query=${encodeURIComponent(input)}`, {
        headers: getAbsHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return NextResponse.json({ suggestions: [] });

      const data = await res.json();
      const users = Array.isArray(data?.results?.users) ? data.results.users : [];
      const suggestions = users
        .map(mapSuggestionUser)
        .filter((u) => u.username || u.resolvedWallet)
        .slice(0, limit);
      return NextResponse.json({ suggestions });
    }

    let resolvedWallet = isValidWalletAddress(input) ? input : null;

    // Resolve user from global search first (works for username and wallet input).
    const searchQueries = resolvedWallet ? [resolvedWallet, resolvedWallet.toLowerCase(), resolvedWallet.toUpperCase()] : [input];
    let match = null;
    for (const q of searchQueries) {
      const res = await fetch(`https://backend.portal.abs.xyz/api/search/global?query=${encodeURIComponent(q)}`, {
        headers: getAbsHeaders(),
        cache: "no-store",
      });
      if (!res.ok) continue;

      const data = await res.json();
      const users = Array.isArray(data?.results?.users) ? data.results.users : [];
      match = resolvedWallet ? (findBestMatch(users, resolvedWallet) || findBestByQuery(users, q)) : findBestByQuery(users, q);
      if (match) break;
    }

    if (!match) return NextResponse.json({ found: false });
    if (!resolvedWallet) {
      const extracted = extractAddress(match);
      if (isValidWalletAddress(extracted)) resolvedWallet = extracted;
    }

    let directProfile = null;
    if (resolvedWallet) {
      try {
        const directRes = await fetch(`https://backend.portal.abs.xyz/api/profiles/${resolvedWallet.toLowerCase()}`, {
          headers: getAbsHeaders(),
          cache: "no-store",
        });
        if (directRes.ok) directProfile = await directRes.json();
      } catch {}
    }

    const merged = { ...match, ...(directProfile || {}) };
    const extractedTier = extractTierInfo(merged);

    let tierV2 = extractTierV2(merged);
    let tierDisplayName = extractedTier.displayName;
    let tierMainTier = extractedTier.mainTier;
    let tierSource = tierV2 !== null || tierDisplayName || tierMainTier ? "official" : "none";

    if (resolvedWallet && tierV2 === null && !tierDisplayName && !tierMainTier) {
      try {
        tierV2 = await resolveTierFromAbslysis(resolvedWallet);
        if (tierV2 !== null) tierSource = "abslysis";
      } catch {}
    }

    if ((!tierDisplayName || !tierMainTier) && typeof tierV2 === "number") {
      try {
        const tiers = await getTiersV2();
        const mapped = tiers.find((t) => Number(t?.id) === tierV2);
        if (mapped) {
          tierDisplayName = tierDisplayName || mapped.displayName || null;
          tierMainTier = tierMainTier || mapped.mainTier || null;
        }
      } catch {}
    }

    const response = {
      found: true,
      username: merged.name || merged.username || null,
      avatar: merged.image || merged.avatar || null,
      verified: (merged.verification || "").toUpperCase() === "VERIFIED",
      resolvedWallet: isValidWalletAddress(resolvedWallet) ? resolvedWallet : null,
      xp: extractXP(merged),
      tierV2,
      tierDisplayName,
      tierMainTier,
    };

    if (debug) {
      response.debug = {
        source: tierSource,
        input,
        resolvedWallet: isValidWalletAddress(resolvedWallet) ? resolvedWallet : null,
        searchMatchKeys: match ? Object.keys(match) : [],
        directProfileKeys: directProfile ? Object.keys(directProfile) : [],
        mergedKeys: Object.keys(merged || {}),
        detectedCandidates: {
          tierV2Raw: [
            merged?.tierV2,
            merged?.tier_v2,
            merged?.tierId,
            merged?.tier_id,
            merged?.tier,
            merged?.profile?.tierV2,
            merged?.data?.tierV2,
            merged?.user?.tierV2,
          ],
          xpRaw: [
            merged?.xp,
            merged?.experience,
            merged?.totalXp,
            merged?.xpPoints,
            merged?.points,
            merged?.stats?.xp,
            merged?.profile?.xp,
            merged?.progress?.xp,
            merged?.tierProgress?.xp,
          ],
        },
        endpoints: {
          officialSearch: "https://backend.portal.abs.xyz/api/search/global",
          officialProfile: "https://backend.portal.abs.xyz/api/profiles/:wallet",
          abslysis: "https://abslysis.xyz/api/v1/user/fetchUsersByTier",
        },
      };
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ found: false });
  }
}
