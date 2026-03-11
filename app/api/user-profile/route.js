import { NextResponse } from "next/server";

let tiersCache = null;
let tiersCacheAt = 0;
const TIERS_TTL_MS = 5 * 60 * 1000;

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
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  const list = Array.isArray(data) ? data : Array.isArray(data?.tiers) ? data.tiers : [];
  tiersCache = list;
  tiersCacheAt = now;
  return list;
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

  if (!wallet || !wallet.startsWith("0x") || wallet.length !== 42) {
    return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  }

  try {
    // Try direct profile endpoint first for richer fields (xp, tier progress, avatar)
    let directProfile = null;
    try {
      const directRes = await fetch(`https://backend.portal.abs.xyz/api/profiles/${wallet.toLowerCase()}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
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
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
          },
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
    const tierV2 = extractTierV2(merged);
    let tierDisplayName = extractedTier.displayName;
    let tierMainTier = extractedTier.mainTier;

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

    return NextResponse.json({
      found: true,
      username: merged.name || merged.username || null,
      avatar: merged.image || merged.avatar || null,
      verified: (merged.verification || "").toUpperCase() === "VERIFIED",
      xp: extractXP(merged),
      tierV2,
      tierDisplayName,
      tierMainTier,
    });

  } catch {
    return NextResponse.json({ found: false });
  }
}
