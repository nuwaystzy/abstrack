import { NextResponse } from "next/server";

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
    // Try direct profile endpoint first
    const directRes = await fetch(
      `https://backend.portal.abs.xyz/api/profiles/${wallet.toLowerCase()}`,
      { headers: { Accept: "application/json" } }
    );

    if (directRes.ok) {
      const data = await directRes.json();
      if (data?.name || data?.username) {
        return NextResponse.json({
          found: true,
          username: data.name || data.username,
          avatar: data.image || data.avatar || null,
        });
      }
    }

    // Fallback: search by wallet address (try both original + lowercase query)
    const searchQueries = [wallet, wallet.toLowerCase()];
    const searchResponses = await Promise.all(
      searchQueries.map((query) =>
        fetch(`https://backend.portal.abs.xyz/api/search/global?query=${encodeURIComponent(query)}`, {
          headers: { Accept: "application/json" },
        }).catch(() => null)
      )
    );

    let match = null;
    for (const res of searchResponses) {
      if (!res || !res.ok) continue;
      const data = await res.json();
      const candidates = [
        ...(data?.results?.users || []),
        ...(data?.results?.profiles || []),
        ...(data?.results?.wallets || []),
        ...(data?.results?.accounts || []),
      ];
      match = findBestMatch(candidates, wallet);
      if (match) break;
    }

    if (!match) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      username: match.name || match.username || null,
      avatar: match.image || match.avatar || null,
      verified: match.verification === "VERIFIED",
    });

  } catch {
    return NextResponse.json({ found: false });
  }
}
