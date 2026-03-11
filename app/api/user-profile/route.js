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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");
  const debug = searchParams.get("debug") === "1";

  if (!wallet || !wallet.startsWith("0x") || wallet.length !== 42) {
    return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  }

  try {
    let directProfile = null;
    try {
      const directRes = await fetch(`https://backend.portal.abs.xyz/api/profiles/${wallet.toLowerCase()}`, {
        headers: getAbsHeaders(),
        cache: "no-store",
      });
      if (directRes.ok) directProfile = await directRes.json();
    } catch {}

    const searchQueries = [wallet, wallet.toLowerCase(), wallet.toUpperCase()];
    let match = null;

    for (const query of searchQueries) {
      const res = await fetch(`https://backend.portal.abs.xyz/api/search/global?query=${encodeURIComponent(query)}`, {
        headers: getAbsHeaders(),
        cache: "no-store",
      });
      if (!res.ok) continue;

      const data = await res.json();
      const users = Array.isArray(data?.results?.users) ? data.results.users : [];
      match = findBestMatch(users, wallet);
      if (!match && users.length > 0) match = users[0];
      if (match) break;
    }

    if (!match) return NextResponse.json({ found: false });

    const merged = { ...match, ...(directProfile || {}) };
    const extractedTier = extractTierInfo(merged);

    let tierV2 = extractTierV2(merged);
    let tierDisplayName = extractedTier.displayName;
    let tierMainTier = extractedTier.mainTier;
    let tierSource = tierV2 !== null || tierDisplayName || tierMainTier ? "official" : "none";

    if (tierV2 === null && !tierDisplayName && !tierMainTier) {
      try {
        tierV2 = await resolveTierFromAbslysis(wallet);
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
      xp: extractXP(merged),
      tierV2,
      tierDisplayName,
      tierMainTier,
    };

    if (debug) {
      response.debug = {
        source: tierSource,
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

