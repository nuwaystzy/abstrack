"use client";
import { useEffect, useState } from "react";

const CATEGORY_LABELS = {
  defi:    { label: "DeFi",    color: "#34d399", bg: "rgba(0,255,135,0.08)"   },
  bridge:  { label: "Bridge",  color: "#60a5fa", bg: "rgba(96,165,250,0.08)"  },
  nft:     { label: "NFT",     color: "#f59e0b", bg: "rgba(245,158,11,0.08)"  },
  gaming:  { label: "Gaming",  color: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
  social:  { label: "Social",  color: "#f472b6", bg: "rgba(244,114,182,0.08)" },
  infra:   { label: "Infra",   color: "#94a3b8", bg: "rgba(148,163,184,0.08)" },
  meme:    { label: "Meme",    color: "#fbbf24", bg: "rgba(251,191,36,0.08)"  },
  unknown: { label: "Unknown", color: "#374151", bg: "rgba(55,65,81,0.08)"    },
};

const TIER_COLORS = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  platinum: "#00e5ff",
  diamond: "#4da3ff",
  obsidian: "#8b5cf6",
  ethereal: "#ff66ff",
};

async function fetchTiers() {
  const res = await fetch("https://backend.portal.abs.xyz/api/tiers/v2");
  if (!res.ok) throw new Error("Failed to fetch tiers");
  const data = await res.json();
  const list = Array.isArray(data) ? data : (Array.isArray(data?.tiers) ? data.tiers : []);
  return [...list].sort((a, b) => (a?.xpRequirement || 0) - (b?.xpRequirement || 0));
}

function getUserTier(xp, tiers) {
  if (!tiers.length) return null;
  let current = tiers[0];
  for (const tier of tiers) {
    if (xp >= tier.xpRequirement) current = tier;
  }
  return current;
}

function isWalletAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function CategoryBadge({ category }) {
  const c = CATEGORY_LABELS[category] || CATEGORY_LABELS.unknown;
  return (
    <span style={{
      padding: "3px 10px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 700,
      color: c.color,
      background: c.bg,
      border: `1px solid ${c.color}20`,
      whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

export default function Page() {
  const [wallet, setWallet] = useState("");
  const [scannedWallet, setScannedWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("recent");
  const [catFilter, setCatFilter] = useState("all");
  const [collapsed, setCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState("tracker");
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState("md");
  const [profile, setProfile] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHovered, setSearchHovered] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);

  useEffect(() => {
    const updateViewport = () => {
      if (typeof window !== "undefined") setViewportWidth(window.innerWidth || 1280);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const is320 = viewportWidth <= 320;
  const is480 = viewportWidth <= 480;
  const is768 = viewportWidth <= 768;
  const is1024 = viewportWidth <= 1024;

  useEffect(() => {
    if (is1024) setCollapsed(true);
  }, [is1024]);

  const NAV_ITEMS = [
    { id: "tracker", label: "Tracker", icon: "⬡", disabled: false },
    { id: "portfolio", label: "Portfolio", icon: "◈", disabled: true },
    { id: "alerts", label: "Alerts", icon: "◎", disabled: true },
    { id: "explore", label: "Explore", icon: "✦", disabled: true },
  ];

  useEffect(() => {
    if (activeNav === "portfolio" || activeNav === "alerts" || activeNav === "explore") {
      setActiveNav("tracker");
    }
  }, [activeNav]);

  useEffect(() => {
    let mounted = true;
    fetchTiers()
      .then((data) => {
        if (mounted) setTiers(data);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const q = wallet.trim();
    if (!q || !searchFocused) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoadingSuggestions(true);
        const res = await fetch(`/api/user-profile?query=${encodeURIComponent(q)}&suggest=1&limit=6`);
        const data = await res.json();
        const list = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(list);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [wallet, searchFocused]);

  async function handleSearch(activeFilter = filter, walletOverride = wallet) {
    const input = walletOverride.trim();
    if (!input) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setProfile(null);
    setCatFilter("all");
    try {
      // 1) Resolve username/wallet input through profile API
      const profileRes = await fetch(`/api/user-profile?query=${encodeURIComponent(input)}`);
      const profileData = await profileRes.json().catch(() => ({}));
      if (!profileRes.ok && !isWalletAddress(input)) {
        throw new Error(profileData?.error || "Failed to resolve user");
      }

      const fallbackWallet = isWalletAddress(input) ? input.trim() : null;
      const resolvedWallet = profileData?.resolvedWallet || fallbackWallet;
      if (!resolvedWallet) throw new Error("User or wallet not found");

      // 2) Fetch track data using resolved wallet address
      const trackRes = await fetch(`/api/track?wallet=${resolvedWallet}&filter=${activeFilter}`);
      const data = await trackRes.json();
      if (!trackRes.ok) throw new Error(data.error || "Failed to fetch");
      setResults(data);
      setScannedWallet(resolvedWallet);

      try {
        if (!profileData?.found) {
          setProfile(null);
          return;
        }
        setProfile({
          found: true,
          username: profileData.username || null,
          avatar: profileData.avatar || null,
          verified: !!profileData.verified,
          xp: typeof profileData.xp === "number" ? profileData.xp : null,
          tierV2:
            typeof profileData.tierV2 === "number"
              ? profileData.tierV2
              : (typeof profileData.tierV2 === "string" && profileData.tierV2.trim() !== "" && !Number.isNaN(Number(profileData.tierV2)))
                ? Number(profileData.tierV2)
                : null,
          tierDisplayName: profileData.tierDisplayName || null,
          tierMainTier: profileData.tierMainTier || null,
        });
      } catch {}
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function changeFilter(val) {
    setFilter(val);
    if (results) handleSearch(val, scannedWallet || wallet);
  }

  const visibleApps = results
    ? catFilter === "all"
      ? results.apps
      : results.categories[catFilter] || []
    : [];

  const totalVisibleCount = visibleApps.length
    ? visibleApps.reduce((sum, app) => sum + app.count, 0)
    : 1;

  const presentCats = results
    ? ["all", ...Object.keys(results.categories).filter(c => results.categories[c]?.length > 0)]
    : [];

  const displayedWallet = scannedWallet || wallet;
  const userXP = typeof profile?.xp === "number" ? profile.xp : null;
  const tierFromId =
    typeof profile?.tierV2 === "number" && tiers.length > 0
      ? (tiers.find((t) => Number(t?.id) === profile.tierV2) || null)
      : null;
  const tierFromXP = userXP !== null && tiers.length > 0 ? getUserTier(userXP, tiers) : null;
  const currentTier = tierFromXP || tierFromId || (profile?.tierDisplayName ? {
    displayName: profile.tierDisplayName,
    mainTier: profile.tierMainTier || "silver",
  } : null);
  const tierColor = currentTier?.mainTier ? (TIER_COLORS[currentTier.mainTier] || "#4b5563") : "#4b5563";
  const sidebarWidth = is1024 ? 220 : 200;
  const contentPadding = is480 ? 10 : is768 ? 14 : 24;
  const searchCardPadding = is480 ? "12px 12px 10px" : "20px 20px 16px";
  const statsColumns = is480 ? "1fr" : is768 ? "1fr 1fr" : "1fr 1fr 1fr";
  const appTableMinWidth = is768 ? 720 : 0;
  const bodyFontSize = is320 ? 12 : is480 ? 13 : is768 ? 14 : 14;
  const searchBtnPadding = is480 ? "10px 14px" : "10px 18px";
  const searchInputFont = is480 ? 12 : 13;
  const profileHeaderDirection = is768 ? "column" : "row";
  const profileHeaderAlign = is768 ? "flex-start" : "center";
  const profileHeaderGap = is768 ? 10 : 12;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#000", color: "#e5e7eb", fontFamily: "'Inter',sans-serif", overflow: "hidden" }}>
      {is1024 && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.48)",
            zIndex: 90,
          }}
        />
      )}

      {/* SIDEBAR */}
      <aside style={{
        width: is1024 ? sidebarWidth : (collapsed ? 56 : sidebarWidth),
        background: "#050505",
        borderRight: "1px solid #1a1a1a",
        display: "flex", flexDirection: "column",
        transition: is1024 ? "transform 0.24s ease" : "width 0.2s ease",
        flexShrink: 0, position: "relative",
        overflow: "hidden",
        ...(is1024 ? {
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          transform: collapsed ? "translateX(-100%)" : "translateX(0)",
        } : {}),
      }}>

        {/* Logo header */}
        <div
          onClick={collapsed ? () => setCollapsed(false) : undefined}
          style={{
            height: 56, display: "flex", alignItems: "center",
            padding: collapsed ? "0 13px" : "0 14px",
            borderBottom: "1px solid #1a1a1a",
            justifyContent: "space-between", flexShrink: 0,
            cursor: collapsed ? "pointer" : "default",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <img
              src="https://i.postimg.cc/nzP2JwPr/Poster-Menyambut-Ramadan-dalam-Gaya-Kartun-Ceria-(5).png"
              alt="AbsTrack"
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                flexShrink: 0,
                objectFit: "cover",
              }}
            />
            {!collapsed && (
              <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>AbsTrack</span>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={e => { e.stopPropagation(); setCollapsed(true); }}
              style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                background: "transparent", border: "1px solid #222",
                color: "#555", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#ddd"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.color = "#555"; }}
            >‹</button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 0", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const isDisabled = !!item.disabled;
            const isActive = activeNav === item.id && !isDisabled;
            return (
              <button
                key={item.id}
                onClick={!isDisabled ? () => setActiveNav(item.id) : undefined}
                aria-disabled={isDisabled}
                tabIndex={isDisabled ? -1 : 0}
                title={isDisabled ? `${item.label} - Coming soon` : item.label}
                style={{
                  display: "flex", alignItems: "center",
                  gap: 10, margin: "0 8px",
                  padding: collapsed ? "7px 7px" : "7px 10px",
                  borderRadius: 8, border: "none",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  pointerEvents: isDisabled ? "none" : "auto",
                  background: isActive ? "#1a1a1a" : "transparent",
                  color: isActive ? "#fff" : isDisabled ? "#394150" : "#4b5563",
                  transition: "all 0.15s", textAlign: "left",
                  opacity: isDisabled ? 0.92 : 1,
                }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: isActive ? "#2a2a2a" : "#141414",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13,
                  color: isActive ? "#ffffff" : isDisabled ? "#374151" : "#4b5563",
                  border: "1px solid " + (isActive ? "#2e2e2e" : "#1a1a1a"),
                }}>{item.icon}</span>
                {!collapsed && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 0, width: "100%" }}>
                    <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>{item.label}</span>
                    {isDisabled && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        color: "#6b7280",
                        border: "1px solid #1f2937",
                        borderRadius: 999,
                        padding: "2px 6px",
                        marginLeft: 8,
                        whiteSpace: "nowrap",
                      }}>
                        Coming soon
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Credit */}
        {!collapsed && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid #1a1a1a" }}>
            <div style={{ fontSize: 10, color: "#525252", lineHeight: 1.6 }}>
              Built by{" "}
              <a href="https://x.com/nowayskun" target="_blank" rel="noopener noreferrer"
                style={{ color: "#404040", textDecoration: "none", fontWeight: 700 }}
                onMouseEnter={e => e.target.style.color = "#34d399"}
                onMouseLeave={e => e.target.style.color = "#404040"}>
                @nowayskun
              </a>
            </div>
            <div style={{ fontSize: 10, color: "#404040", marginTop: 1 }}>AbsTrack · Abstract Chain</div>
          </div>
        )}

        {/* Settings button */}
        <div style={{ padding: "12px 0", display: "flex", justifyContent: "center", borderTop: "1px solid #1a1a1a" }}>
          <button onClick={e => { e.stopPropagation(); setShowSettings(s => !s); }}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: showSettings ? "#1e1e1e" : "rgba(255,255,255,0.03)",
              border: showSettings ? "1px solid #2e2e2e" : "1px solid #1a1a1a",
              color: showSettings ? "#34d399" : "#404040",
              cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            }}>⚙</button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div style={{
            position: "fixed",
            bottom: 70,
            left: collapsed ? 64 : 208,
            zIndex: 100,
            background: "#0d0d0d", border: "1px solid #1f1f1f",
            borderRadius: 14, padding: 16, width: 200,
            boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#404040", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Settings</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Font Size</span>
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #1f1f1f" }}>
                {[["S","sm"],["M","md"],["L","lg"]].map(([label, val]) => (
                  <button key={val} onClick={() => setFontSize(val)}
                    style={{
                      padding: "4px 10px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                      background: fontSize === val ? "#1e1e1e" : "transparent",
                      color: fontSize === val ? "#e5e7eb" : "#404040",
                    }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* MAIN */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
        position: "relative",
        background: "#040506",
        fontSize: fontSize === "sm" ? 12 : fontSize === "lg" ? 16 : bodyFontSize,
      }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: 18,
            border: "1px solid #1a1a1a",
            backgroundColor: "#050607",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: is480 ? "18px 18px" : "24px 24px",
            WebkitMaskImage: "radial-gradient(ellipse at center, #000 52%, transparent 100%)",
            maskImage: "radial-gradient(ellipse at center, #000 52%, transparent 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Topbar */}
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: is480 ? "0 10px" : is768 ? "0 14px" : "0 24px", height: 56,
          background: "#000", borderBottom: "1px solid #1a1a1a",
          position: "relative", zIndex: 1,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 10 }}>
            {is1024 && (
              <button
                onClick={() => setCollapsed((v) => !v)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  border: "1px solid #22302a",
                  background: "#0b1110",
                  color: "#9ca3af",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ☰
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: is480 ? 14 : 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>Wallet Tracker</span>
              {!is480 && <span style={{ fontSize: 12, color: "#555", marginLeft: 10 }}>Abstract chain · dapp analytics</span>}
            </div>
          </div>
          <img
            src="https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3NmVmYWZzbHQxdXc5YXZ5NDE5NXI3dnBvYzFxMHNrZWU1b2gxMGg1diZlcD12MV9zdGlja2Vyc19yZWxhdGVkJmN0PXM/f5DwFJeDOmuFGN5g4d/giphy.gif"
            alt="Live status"
            style={{ height: is480 ? 24 : 28, width: "auto", display: "block", flexShrink: 0 }}
          />
        </header>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: "auto", overflowX: "hidden", padding: contentPadding,
          position: "relative", zIndex: 1,
          zoom: fontSize === "sm" ? 0.9 : fontSize === "lg" ? 1.1 : 1,
        }}>

          {/* Search card */}
          <div style={{
            background: "#0a0a0a", border: "1px solid #1a1a1a",
            borderRadius: 16, padding: searchCardPadding, marginBottom: 20,
          }}>
            <div
              onMouseEnter={() => setSearchHovered(true)}
              onMouseLeave={() => setSearchHovered(false)}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#070a09",
                border: searchFocused || searchHovered ? "1px solid rgba(52,211,153,0.45)" : "1px solid #1f2a25",
                borderRadius: 18,
                padding: is480 ? "6px 8px 6px 10px" : "8px 10px 8px 14px",
                boxShadow: searchFocused || searchHovered
                  ? "0 0 0 1px rgba(52,211,153,0.12), 0 0 26px rgba(0,255,135,0.18), inset 0 0 18px rgba(0,255,135,0.06)"
                  : "inset 0 0 0 rgba(0,0,0,0)",
                transition: "all 0.2s ease",
              }}
            >
              <span
                aria-hidden
                style={{
                  fontSize: 21,
                  lineHeight: 1,
                  marginRight: 2,
                  color: searchFocused || searchHovered ? "#34d399" : "#6b7280",
                  transition: "color 0.2s ease",
                }}
              >
                ⌕
              </span>
              <input
                type="text"
                placeholder="Search by address or username..."
                value={wallet}
                onChange={e => setWallet(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                onFocus={() => {
                  setSearchFocused(true);
                  setShowSuggestions(true);
                }}
                onBlur={() => {
                  setSearchFocused(false);
                  setTimeout(() => setShowSuggestions(false), 120);
                }}
                onClick={() => setShowSuggestions(true)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  padding: is480 ? "8px 2px" : "10px 2px",
                  fontSize: searchInputFont,
                  color: "#e5e7eb",
                  outline: "none",
                  fontFamily: "inherit",
                  fontWeight: 600,
                }}
              />
              <div style={{ width: 1, height: 30, background: "#20302a", opacity: 0.9 }} />
              <button
                onClick={() => handleSearch()}
                disabled={loading}
                style={{
                  padding: searchBtnPadding,
                  borderRadius: 12,
                  border: "1px solid " + (loading ? "#2b2b2b" : "#2f5f4c"),
                  background: loading ? "#1b1b1b" : "linear-gradient(180deg,#1e2f29,#16211e)",
                  color: loading ? "#666" : "#d9fceb",
                  fontWeight: 800,
                  fontSize: is480 ? 12 : 13,
                  cursor: loading ? "not-allowed" : "pointer",
                  flexShrink: 0,
                  letterSpacing: "0.02em",
                  boxShadow: loading ? "none" : "0 8px 15px rgba(0,0,0,0.35), 0 0 0 1px rgba(52,211,153,0.14)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={e => {
                  if (loading) return;
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.background = "linear-gradient(180deg,#2ac483,#22b377)";
                  e.currentTarget.style.color = "#062017";
                  e.currentTarget.style.boxShadow = "0 14px 22px rgba(46,229,157,0.28), 0 0 20px rgba(46,229,157,0.3)";
                  e.currentTarget.style.borderColor = "#2ee59d";
                }}
                onMouseLeave={e => {
                  if (loading) return;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.background = "linear-gradient(180deg,#1e2f29,#16211e)";
                  e.currentTarget.style.color = "#d9fceb";
                  e.currentTarget.style.boxShadow = "0 8px 15px rgba(0,0,0,0.35), 0 0 0 1px rgba(52,211,153,0.14)";
                  e.currentTarget.style.borderColor = "#2f5f4c";
                }}
                onMouseDown={e => {
                  if (loading) return;
                  e.currentTarget.style.transform = "translateY(1px)";
                }}
                onMouseUp={e => {
                  if (loading) return;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
              >
                {loading ? "Scanning..." : "Scan →"}
              </button>

              {showSuggestions && searchFocused && wallet.trim() && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  background: "#0b0f0d",
                  border: "1px solid #1f2f28",
                  borderRadius: 14,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.45), 0 0 20px rgba(52,211,153,0.12)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    padding: "10px 12px",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    color: "#5f6f67",
                    borderBottom: "1px solid #1b2622",
                  }}>
                    SUGGESTIONS
                  </div>
                  {loadingSuggestions && (
                    <div style={{ padding: "12px", fontSize: 12, color: "#6b7280" }}>Searching...</div>
                  )}
                  {!loadingSuggestions && suggestions.length === 0 && (
                    <div style={{ padding: "12px", fontSize: 12, color: "#6b7280" }}>No user found.</div>
                  )}
                  {!loadingSuggestions && suggestions.map((s, idx) => (
                    <button
                      key={`${s.resolvedWallet || s.username || "s"}-${idx}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const value = s.username || s.resolvedWallet || "";
                        setWallet(value);
                        setShowSuggestions(false);
                        if (s.resolvedWallet) {
                          handleSearch(filter, s.resolvedWallet);
                        } else if (value) {
                          handleSearch(filter, value);
                        }
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        padding: "10px 12px",
                        cursor: "pointer",
                        borderTop: idx === 0 ? "none" : "1px solid #17221e",
                        color: "#d9fceb",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        overflow: "hidden",
                        background: "rgba(52,211,153,0.14)",
                        border: "1px solid rgba(52,211,153,0.22)",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        color: "#34d399",
                        fontWeight: 800,
                      }}>
                        {s.avatar
                          ? <img src={s.avatar} alt={s.username || "user"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : (s.username || s.resolvedWallet || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#f3f4f6", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.username || "Unknown"}
                          </span>
                          {s.verified && (
                            <span style={{
                              fontSize: 9,
                              fontWeight: 800,
                              color: "#34d399",
                              background: "rgba(52,211,153,0.12)",
                              border: "1px solid rgba(52,211,153,0.25)",
                              borderRadius: 99,
                              padding: "1px 6px",
                            }}>
                              verified
                            </span>
                          )}
                        </div>
                        {s.resolvedWallet && (
                          <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
                            {s.resolvedWallet}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {[["recent","Recent · 3h"],["24h","Last 24h"],["7d","Last 7 Days"]].map(([val, label]) => (
                <button key={val} onClick={() => changeFilter(val)}
                  style={{
                    padding: "6px 14px", borderRadius: 99, border: "none",
                    background: filter === val ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.02)",
                    color: filter === val ? "#34d399" : "#4b5563",
                    fontWeight: 600, fontSize: 12, cursor: "pointer",
                    outline: filter === val ? "1px solid rgba(52,211,153,0.2)" : "1px solid #1a1a1a",
                    transition: "all 0.15s",
                  }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "12px 16px", borderRadius: 12, marginBottom: 16,
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
              color: "#ef4444", fontSize: 13,
            }}>⚠ {error}</div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                border: "2px solid #1a1a1a", borderTopColor: "#34d399",
                animation: "spin 0.8s linear infinite",
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontSize: 13, color: "#555" }}>Scanning on-chain activity...</p>
            </div>
          )}

          {/* RESULTS */}
          {results && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Wallet header */}
              <div style={{
                display: "flex", flexDirection: profileHeaderDirection, alignItems: profileHeaderAlign, justifyContent: "space-between",
                padding: "14px 18px", borderRadius: 14,
                background: "#0a0a0a", border: "1px solid #1a1a1a",
                gap: profileHeaderGap,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: "#34d399", fontWeight: 800,
                    overflow: "hidden",
                  }}>
                    {profile?.avatar
                      ? <img src={profile.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : displayedWallet.slice(2, 4).toUpperCase()
                    }
                  </div>
                  <div>
                    {profile?.username && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{profile.username}</span>
                        {profile.verified && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                            background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)",
                          }}>{`\u2713`} verified</span>
                        )}
                        {!profile.verified && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                            background: "rgba(255,255,255,0.04)", color: "#555", border: "1px solid #1f1f1f",
                          }}>abs</span>
                        )}
                        {currentTier && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            padding: "2px 7px",
                            borderRadius: 99,
                            textTransform: "uppercase",
                            color: tierColor,
                            background: `${tierColor}14`,
                            border: `1px solid ${tierColor}45`,
                          }}>
                            {currentTier.displayName || currentTier.name}
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: profile?.username ? 400 : 700, color: profile?.username ? "#555" : "#fff", fontFamily: "monospace" }}>
                      {displayedWallet.slice(0,10)}...{displayedWallet.slice(-8)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: is768 ? "left" : "right", width: is768 ? "100%" : "auto" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>{results.lastActive}</div>
                  <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>Last activity</div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: statsColumns, gap: 12 }}>
                {[
                  { label: "Transactions", value: results.totalTxns, color: "#34d399", note: filter === "recent" ? "last 3h" : filter === "24h" ? "last 24h" : "last 7d" },
                  { label: "Apps Used",    value: results.uniqueApps, color: "#60a5fa", note: `${results.stats?.knownCount || 0} identified` },
                  { label: "Categories",  value: results.stats?.categories?.length || 0, color: "#a78bfa", note: results.stats?.categories?.map(c => CATEGORY_LABELS[c]?.label).filter(Boolean).join(", ") || "—" },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: "18px 20px", borderRadius: 14,
                    background: "#0a0a0a", border: "1px solid #1a1a1a",
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${s.color}50,transparent)` }} />
                    <div style={{ fontSize: 28, fontWeight: 900, color: s.color, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginTop: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: "#525252", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.note}</div>
                  </div>
                ))}
              </div>

              {/* App table */}
              <div style={{ borderRadius: 14, border: "1px solid #1a1a1a", overflowX: is768 ? "auto" : "hidden", overflowY: "hidden", background: "#070809" }}>
                <div style={{ minWidth: appTableMinWidth || "auto" }}>

                {/* Toolbar */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: is480 ? "12px 12px" : "14px 18px", background: "#0a0a0a", borderBottom: "1px solid #1a1a1a",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>App Interactions</span>
                    <span style={{
                      padding: "2px 10px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                      background: "#1e1e1e", color: "#4b5563",
                    }}>{visibleApps.length}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {presentCats.map(cat => {
                      if (cat === "unknown") return null;
                      const c = CATEGORY_LABELS[cat];
                      const isActive = catFilter === cat;
                      const count = cat === "all" ? results.apps.length : results.categories[cat]?.length;
                      return (
                        <button key={cat} onClick={() => setCatFilter(cat)}
                          style={{
                            padding: "4px 12px", borderRadius: 99, border: "none", cursor: "pointer",
                            background: isActive ? (c?.bg || "rgba(0,255,135,0.08)") : "#0b0c0d",
                            color: isActive ? (c?.color || "#34d399") : "#4b5563",
                            outline: `1px solid ${isActive ? (c?.color || "#34d399") + "30" : "#242424"}`,
                            fontSize: 12, fontWeight: 700, transition: "all 0.15s",
                          }}>
                          {cat === "all" ? "All" : c?.label || cat}
                          <span style={{ marginLeft: 4, opacity: 0.5 }}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Col headers */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "36px 1fr 90px 60px 120px 24px",
                  gap: 12, padding: "8px 18px",
                  background: "#050505", borderBottom: "1px solid #111",
                  fontSize: 10, fontWeight: 700, color: "#525252",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                }}>
                  {["#","App","Category","Txns","Activity",""].map((h,i) => (
                    <div key={i} style={{ textAlign: i === 3 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>

                {/* Rows */}
                {visibleApps.length === 0 ? (
                  <div style={{ padding: "48px 0", textAlign: "center", color: "#525252", fontSize: 13 }}>
                    No interactions found.
                  </div>
                ) : visibleApps.map((app, i) => {
                  const barPct = Math.round((app.count / totalVisibleCount) * 100);
                  const c = CATEGORY_LABELS[app.category] || CATEGORY_LABELS.unknown;
                  const isImg = app.icon && (app.icon.startsWith("http") || app.icon.startsWith("/api"));
                  return (
                    <div key={i} style={{
                      display: "grid",
                      gridTemplateColumns: "36px 1fr 90px 60px 120px 24px",
                      gap: 12, padding: "12px 18px",
                      background: "#070809",
                      borderBottom: "1px solid #0d0d0d",
                      alignItems: "center",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#0a0a0a"}
                    onMouseLeave={e => e.currentTarget.style.background = "#070809"}>

                      {/* Rank */}
                      <div style={{
                        fontSize: 12, fontWeight: 900,
                        color: i === 0 ? "#34d399" : i === 1 ? "#60a5fa" : i === 2 ? "#f59e0b" : "#444",
                      }}>{String(i + 1).padStart(2,"0")}</div>

                      {/* App */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                          background: `${c.color}10`, border: `1px solid ${c.color}20`,
                          overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14,
                        }}>
                          {isImg
                            ? <img src={app.icon} alt={app.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : app.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.name}</div>
                          <div style={{ fontSize: 10, color: "#525252", fontFamily: "monospace" }}>{app.address.slice(0,8)}...{app.address.slice(-4)}</div>
                        </div>
                      </div>

                      {/* Category */}
                      <div><CategoryBadge category={app.category} /></div>

                      {/* Txns */}
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: c.color }}>{app.count}</span>
                      </div>

                      {/* Bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 99, background: "#1e1e1e", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 99,
                            width: `${barPct}%`,
                            background: `linear-gradient(90deg,${c.color}60,${c.color})`,
                            transition: "width 0.5s ease",
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: "#555", width: 28, textAlign: "right" }}>{barPct}%</span>
                      </div>

                      {/* Link */}
                      <div style={{ textAlign: "right" }}>
                        {app.url && (
                          <a href={app.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "#444", fontSize: 13, textDecoration: "none", transition: "color 0.15s" }}
                            onMouseEnter={e => e.target.style.color = "#34d399"}
                            onMouseLeave={e => e.target.style.color = "#444"}>↗</a>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>

              {/* Activity distribution */}
              {Object.keys(results.categories).filter(c => c !== "unknown").length > 0 && (
                <div style={{ borderRadius: 14, border: "1px solid #1a1a1a", overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", background: "#0a0a0a", borderBottom: "1px solid #1a1a1a" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Activity Distribution</span>
                    <span style={{ fontSize: 12, color: "#555", marginLeft: 8 }}>by category</span>
                  </div>
                  <div style={{ padding: 16, display: "flex", gap: 12, flexWrap: "wrap", background: "#050505" }}>
                    {Object.entries(results.categories).filter(([cat]) => cat !== "unknown").map(([cat, apps]) => {
                      const c = CATEGORY_LABELS[cat] || CATEGORY_LABELS.unknown;
                      const total = apps.reduce((s, a) => s + a.count, 0);
                      const allTotal = results.apps.reduce((s, a) => s + a.count, 0);
                      const pct = Math.round((total / allTotal) * 100);
                      return (
                        <div key={cat} style={{
                          flex: "1 1 120px", padding: "14px 16px", borderRadius: 12,
                          background: c.bg, border: `1px solid ${c.color}15`,
                        }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: c.color, letterSpacing: "-0.03em" }}>{pct}%</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginTop: 4 }}>{c.label}</div>
                          <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{total} txns · {apps.length} app{apps.length !== 1 ? "s" : ""}</div>
                          <div style={{ marginTop: 8, height: 3, borderRadius: 99, background: "#1e1e1e" }}>
                            <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: c.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Empty state */}
          {!results && !loading && !error && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: "#0a0a0a", border: "1px solid #1a1a1a",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24,
              }}>⬡</div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>No wallet scanned</p>
                <p style={{ fontSize: 13, color: "#404040", marginTop: 6 }}>Enter an Abstract chain wallet address or username above to get started</p>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
                {[["Recent · 3h","Fast, last 3 hours"],["Last 24h","Full day activity"],["Last 7 Days","Weekly overview"]].map(([t,d]) => (
                  <div key={t} style={{
                    padding: "14px 18px", borderRadius: 12, width: is480 ? "100%" : 140, maxWidth: is480 ? 320 : 140, textAlign: "center",
                    background: "#0a0a0a", border: "1px solid #1a1a1a",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>{t}</div>
                    <div style={{ fontSize: 10, color: "#525252", marginTop: 4 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}






