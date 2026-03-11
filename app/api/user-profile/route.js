import { NextResponse } from "next/server";

let tiersCache = null;
let tiersCacheAt = 0;
const TIERS_TTL_MS = 5 * 60 * 1000;
const COMMUNITY_TIER_IDS = Array.from({ length: 22 }, (_, i) => i + 1);
const COMMUNITY_USERS_TTL_MS = 10 * 60 * 1000;
const COMMUNITY_WALLET_TTL_MS = 60 * 60 * 1000;
const communityTierUsersCache = new Map(); // tierId -> { at, users }
const communityWalletTierCache = new Map(); // walletLower -> { at, tierV2 }

function getAbsHeaders() {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0",
  };

  // Optional authenticated mode (set in local env / Vercel env)
  // ABS_PORTAL_BEARER should be token value only (without "Bearer " prefix).
  if (process.env.ABS_PORTAL_BEARER) {
    headers.Authorization = `Bearer ${process.env.ABS_PORTAL_BEARER}`;
  }
  // Cookie-based fallback when portal API requires session cookies.
  if (process.env.ABS_PORTAL_COOKIE) {
    headers.Cookie = process.env.ABS_PORTAL_COOKIE;
  }

  return headers;
}

function getCommunityHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
  };
}

function normalizeAddress(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
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

function extractUsersFromCommunityPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results?.users)) return payload.results.users;
  if (Array.isArray(payload?.users)) return payload.users;
  return [];
}

async function fetchCommunityUsersByTier(tierId) {
  const now = Date.now();
  const cached = communityTierUsersCache.get(tierId);
  if (cached && now - cached.at < COMMUNITY_USERS_TTL_MS) {
    return cached.users;
  }

  const baseUrl = process.env.COMMUNITY_ABSLYSIS_BASE_URL || "https://abslysis.xyz";
  const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/user/fetchUsersByTier`;
  const res = await fetch(url, {
    method: "POST",
    headers: getCommunityHeaders(),
    body: JSON.stringify({ tier: tierId }),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const payload = await res.json();
  const users = extractUsersFromCommunityPayload(payload);
  communityTierUsersCache.set(tierId, { at: now, users });
  return users;
}

async function resolveTierFromCommunity(wallet) {
  const now = Date.now();
  const normalized = normalizeAddress(wallet);
  const cached = communityWalletTierCache.get(normalized);
  if (cached && now - cached.at < COMMUNITY_WALLET_TTL_MS) {
    return cached.tierV2;
  }

  for (const tierId of COMMUNITY_TIER_IDS) {
    try {
      const users = await fetchCommunityUsersByTier(tierId);
      const hit = users.find((u) => normalizeAddress(u?.walletAddress || u?.address) === normalized);
      if (!hit) continue;

      const raw =
        hit?.tierV2 ??
        hit?.tier_v2 ??
        hit?.tierId ??
        hit?.tier_id ??
        hit?.tier ??
        tierId;
      const tierV2 = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(tierV2)) {
        communityWalletTierCache.set(normalized, { at: now, tierV2 });
        return tierV2;
      }
    } catch {
      // Ignore per-tier request failure and continue.
    }
  }
  return null;
}

function findBestMatch(candidates, wallet) {
  const target = normalizeAddress(wallet);
  if (!Array.isArray(candidates)) return null;

  const exact = candidates.find((u) => normalizeAddress(extractAddress(u)) === target);
  if (exact) return exact;

  // Fallback: match by compact wallet form if provider returns shortened address labels
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
    // Try direct profile endpoint first for richer fields (xp, tier progress, avatar)
    let directProfile = null;
    try {
      const directRes = await fetch(`https://backend.portal.abs.xyz/api/profiles/${wallet.toLowerCase()}`, {
        headers: getAbsHeaders(),
        cache: "no-store",
      });
      if (directRes.ok) directProfile = await directRes.json();
    } catch {}

    // Source of truth: search/global endpoint
    const searchQueries = [wallet, wallet.toLowerCase(), wallet.toUpperCase()];
    let match = null;

    for (const query of searchQueries) {
      const res = await fetch(
        `https://backend.portal.abs.xyz/api/search/global?query=${encodeURIComponent(query)}`,
        {
          headers: getAbsHeaders(),
          cache: "no-store",
        }
      );
      if (!res.ok) continue;

      const data = await res.json();
      const users = Array.isArray(data?.results?.users) ? data.results.users : [];

      match = findBestMatch(users, wallet);
      if (!match && users.length > 0) {
        // Fallback when provider doesn't return full address shape consistently
        match = users[0];
      }
      if (match) break;
    }

    if (!match) return NextResponse.json({ found: false });

    const merged = {
      ...match,
      ...(directProfile || {}),
    };

    const extractedTier = extractTierInfo(merged);
    let tierV2 = extractTierV2(merged);
    let tierDisplayName = extractedTier.displayName;
    let tierMainTier = extractedTier.mainTier;

    if (tierV2 === null && !tierDisplayName && !tierMainTier) {
      try {
        tierV2 = await resolveTierFromCommunity(wallet);
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
        community: {
          fallbackAttempted: extractedTier.displayName == null && extractedTier.mainTier == null,
          resolvedTierV2: tierV2,
          source: "abslysis:/api/v1/user/fetchUsersByTier",
        },
      };
    }

    return NextResponse.json(response);

  } catch {
    return NextResponse.json({ found: false });
  }
}
