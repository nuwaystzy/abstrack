import { NextResponse } from "next/server";

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

    // Fallback: search by wallet address
    const searchRes = await fetch(
      `https://backend.portal.abs.xyz/api/search/global?query=${wallet}`,
      { headers: { Accept: "application/json" } }
    );

    if (!searchRes.ok) throw new Error("Failed");

    const data = await searchRes.json();
    const users = data?.results?.users || [];

    // Exact match by address
    const match = users.find(
      u => u.address?.toLowerCase() === wallet.toLowerCase()
    );

    if (!match) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      username: match.name || null,
      avatar: match.image || null,
      verified: match.verification === "VERIFIED",
    });

  } catch {
    return NextResponse.json({ found: false });
  }
}
