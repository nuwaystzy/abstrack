"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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

const SIDEBAR_ICON_URLS = {
  tracker: "https://www.nicepng.com/png/full/4-46246_objects-magnifying-glass-icon-transparent.png",
  portfolio: "https://cdn-icons-png.flaticon.com/512/3360/3360459.png",
  alerts: "https://img.icons8.com/ios11/512/FFFFFF/appointment-reminders--v2.png",
  explore: "https://cdn-icons-png.freepik.com/256/117/117368.png",
  settings: "https://cdn-icons-png.flaticon.com/512/3524/3524659.png",
};

const EMPTY_STATE_ICON_STYLE = {
  width: 52,
  height: 52,
  borderRadius: 16,
  background: "linear-gradient(180deg,#10271d 0%, #0e1814 52%, #0a0a0a 100%)",
  border: "1px solid rgba(52,211,153,0.22)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 0 0 1px rgba(52,211,153,0.08), 0 0 18px rgba(52,211,153,0.14), 0 0 32px rgba(16,185,129,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
};

const EMPTY_STATE_ICON_IMAGE_STYLE = {
  width: 28,
  height: 28,
  objectFit: "contain",
  display: "block",
  filter: "brightness(0) saturate(100%) invert(80%) sepia(76%) saturate(674%) hue-rotate(85deg) brightness(94%) contrast(90%) drop-shadow(0 0 10px rgba(52,211,153,0.28))",
};

const SIDEBAR_ICON_FILTERS = {
  active: "brightness(0) saturate(100%) invert(73%) sepia(37%) saturate(756%) hue-rotate(95deg) brightness(92%) contrast(89%)",
  inactive: "brightness(0) saturate(100%) invert(31%) sepia(12%) saturate(480%) hue-rotate(186deg) brightness(94%) contrast(92%)",
  disabled: "brightness(0) saturate(100%) invert(24%) sepia(11%) saturate(367%) hue-rotate(184deg) brightness(86%) contrast(88%) opacity(0.85)",
  settingsActive: "brightness(0) saturate(100%) invert(56%) sepia(16%) saturate(214%) hue-rotate(181deg) brightness(97%) contrast(88%)",
  settingsInactive: "brightness(0) saturate(100%) invert(37%) sepia(8%) saturate(330%) hue-rotate(183deg) brightness(82%) contrast(88%)",
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

function formatRangeSummary(fromValue, toValue) {
  if (!fromValue || !toValue) return "";
  const fromDate = new Date(fromValue);
  const toDate = new Date(toValue);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return "";
  const sameYear = fromDate.getFullYear() === toDate.getFullYear();
  const fromLabel = fromDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const toLabel = toDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fromLabel} - ${toLabel}`;
}

function toUtcStartOfDayIso(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).toISOString();
}

function toUtcEndExclusiveIso(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0)).toISOString();
}

function getTodayLocalDateValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
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
  const trackerRequestRef = useRef(0);
  const portfolioRequestRef = useRef(0);
  const [trackerWalletInput, setTrackerWalletInput] = useState("");
  const [portfolioWalletInput, setPortfolioWalletInput] = useState("");
  const [trackerScannedWallet, setTrackerScannedWallet] = useState("");
  const [portfolioScannedWallet, setPortfolioScannedWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("recent");
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [collapsed, setCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState("tracker");
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState("md");
  const [trackerProfile, setTrackerProfile] = useState(null);
  const [portfolioProfile, setPortfolioProfile] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHovered, setSearchHovered] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState(null);
  const [portfolioTab, setPortfolioTab] = useState("tokens");
  const [tokenSort, setTokenSort] = useState({ key: "valueUsd", dir: "desc" });
  const [expandedNftGroups, setExpandedNftGroups] = useState({});
  const [showAllNftGroups, setShowAllNftGroups] = useState(false);
  const PORTFOLIO_ANALYTICS_RANGE = "7d";
  const todayDateValue = getTodayLocalDateValue();
  const openNativeDateTimePicker = useCallback((event) => {
    const input = event.currentTarget;
    if (typeof input?.showPicker === "function") {
      try {
        input.showPicker();
      } catch {}
    }
  }, []);


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
  const activeWalletInput = activeNav === "portfolio" ? portfolioWalletInput : trackerWalletInput;

  useEffect(() => {
    if (is1024) setCollapsed(true);
  }, [is1024]);

  useEffect(() => {
    if (activeNav === "portfolio") {
      trackerRequestRef.current += 1;
      setLoading(false);
    } else {
      portfolioRequestRef.current += 1;
      setPortfolioLoading(false);
    }
  }, [activeNav]);

  const NAV_ITEMS = [
    { id: "tracker", label: "Tracker", iconUrl: SIDEBAR_ICON_URLS.tracker, disabled: false },
    { id: "portfolio", label: "Portfolio", iconUrl: SIDEBAR_ICON_URLS.portfolio, disabled: false, badge: "Beta" },
    { id: "alerts", label: "Alerts", iconUrl: SIDEBAR_ICON_URLS.alerts, disabled: true },
    { id: "explore", label: "Explore", iconUrl: SIDEBAR_ICON_URLS.explore, disabled: true },
  ];

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
    const q = activeWalletInput.trim();
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
  }, [activeWalletInput, searchFocused]);

  const fetchPortfolioBundle = useCallback(async (targetWallet, requestId = portfolioRequestRef.current) => {
    if (!targetWallet) return;
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const nftResUrl = `/api/portfolio/nfts?wallet=${encodeURIComponent(targetWallet)}&limit=50&all=1`;
      const tokensRes = await fetch(`/api/portfolio/tokens?wallet=${encodeURIComponent(targetWallet)}`);
      const tokensData = await tokensRes.json().catch(() => ({}));
      if (requestId !== portfolioRequestRef.current) return;
      if (!tokensRes.ok) throw new Error(tokensData?.error || "Failed to load token holdings");

      const nftsRes = await fetch(nftResUrl);
      const nftsData = await nftsRes.json().catch(() => ({}));
      if (requestId !== portfolioRequestRef.current) return;
      if (!nftsRes.ok) throw new Error(nftsData?.error || "Failed to load NFT holdings");

      const gasRes = await fetch(`/api/portfolio/gas?wallet=${encodeURIComponent(targetWallet)}&range=${encodeURIComponent(PORTFOLIO_ANALYTICS_RANGE)}`);
      const gasData = await gasRes.json().catch(() => ({}));
      if (requestId !== portfolioRequestRef.current) return;
      if (!gasRes.ok) throw new Error(gasData?.error || "Failed to load gas analytics");

      const volumeRes = await fetch(`/api/portfolio/volume?wallet=${encodeURIComponent(targetWallet)}&range=${encodeURIComponent(PORTFOLIO_ANALYTICS_RANGE)}`);
      const volumeData = await volumeRes.json().catch(() => ({}));
      if (requestId !== portfolioRequestRef.current) return;
      if (!volumeRes.ok) throw new Error(volumeData?.error || "Failed to load volume analytics");

      if (requestId !== portfolioRequestRef.current) return;
      setPortfolioData({
        tokens: Array.isArray(tokensData?.tokens) ? tokensData.tokens : [],
        nfts: Array.isArray(nftsData?.nfts) ? nftsData.nfts : [],
        totals: {
          tokenValueUsd: Number(tokensData?.totalUsd || 0),
          nftValueUsd: Number(nftsData?.totalEstimatedUsd || 0),
        },
        gas: gasData,
        volume: volumeData,
      });
      setExpandedNftGroups({});
      setShowAllNftGroups(false);
      setPortfolioTab("tokens");
    } catch (e) {
      if (requestId !== portfolioRequestRef.current) return;
      setPortfolioData(null);
      setPortfolioError(e.message || "Failed to load portfolio");
    } finally {
      if (requestId === portfolioRequestRef.current) setPortfolioLoading(false);
    }
  }, [PORTFOLIO_ANALYTICS_RANGE]);

  async function handleSearch(activeFilter = filter, walletOverride = activeWalletInput) {
    const input = walletOverride.trim();
    if (!input) return;
    const scanNav = activeNav;
    const customFromIso = toUtcStartOfDayIso(customFrom);
    const customToIso = toUtcEndExclusiveIso(customTo);
    const effectiveFilter =
      scanNav === "tracker" && activeFilter === "custom" && (!customFromIso || !customToIso)
        ? "24h"
        : activeFilter;
    const requestId = scanNav === "portfolio"
      ? ++portfolioRequestRef.current
      : ++trackerRequestRef.current;
    if (scanNav === "portfolio") {
      setPortfolioLoading(true);
      setPortfolioError(null);
      setPortfolioProfile(null);
    } else {
      setLoading(true);
      setError(null);
      setResults(null);
      setTrackerProfile(null);
    }
    setCatFilter("all");
    try {
      // 1) Resolve username/wallet input through profile API
      const profileRes = await fetch(`/api/user-profile?query=${encodeURIComponent(input)}`);
      const profileData = await profileRes.json().catch(() => ({}));
      if (scanNav === "portfolio" && requestId !== portfolioRequestRef.current) return;
      if (scanNav === "tracker" && requestId !== trackerRequestRef.current) return;
      if (!profileRes.ok && !isWalletAddress(input)) {
        throw new Error(profileData?.error || "Failed to resolve user");
      }

      const fallbackWallet = isWalletAddress(input) ? input.trim() : null;
      const resolvedWallet = profileData?.resolvedWallet || fallbackWallet;
      if (!resolvedWallet) throw new Error("User or wallet not found");

      if (scanNav === "portfolio") {
        setPortfolioScannedWallet(resolvedWallet);
        await fetchPortfolioBundle(resolvedWallet, requestId);
        if (requestId !== portfolioRequestRef.current) return;
      } else {
        setTrackerScannedWallet(resolvedWallet);
        // Fetch tracker only in tracker tab to avoid unnecessary API burst.
        const trackerParams = new URLSearchParams({
          wallet: resolvedWallet,
          filter: effectiveFilter,
        });
        if (effectiveFilter === "custom") {
          trackerParams.set("from", customFromIso);
          trackerParams.set("to", customToIso);
        }
        const trackRes = await fetch(`/api/track?${trackerParams.toString()}`);
        const data = await trackRes.json();
        if (requestId !== trackerRequestRef.current) return;
        if (!trackRes.ok) throw new Error(data.error || "Failed to fetch");
        setResults(data);
        if (activeFilter !== effectiveFilter) setFilter(effectiveFilter);
      }

      try {
        if (!profileData?.found) {
          if (scanNav === "portfolio") setPortfolioProfile(null);
          else setTrackerProfile(null);
          return;
        }
        const nextProfile = {
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
        };
        if (scanNav === "portfolio") setPortfolioProfile(nextProfile);
        else setTrackerProfile(nextProfile);
      } catch {}
    } catch (e) {
      if (scanNav === "portfolio" && requestId !== portfolioRequestRef.current) return;
      if (scanNav === "tracker" && requestId !== trackerRequestRef.current) return;
      const msg = e.message || "Failed to scan";
      if (scanNav === "portfolio") setPortfolioError(msg);
      else setError(msg);
    } finally {
      if (scanNav === "portfolio") {
        if (requestId === portfolioRequestRef.current) setPortfolioLoading(false);
      } else if (requestId === trackerRequestRef.current) {
        setLoading(false);
      }
    }
  }

  function changeFilter(val) {
    if (val === "custom") {
      setCustomRangeOpen(true);
      setFilter("custom");
      return;
    }
    setFilter(val);
    setCustomRangeOpen(false);
    if (results) handleSearch(val, trackerScannedWallet || trackerWalletInput);
  }

  function applyCustomRange() {
    const fromIso = toUtcStartOfDayIso(customFrom);
    const toIso = toUtcEndExclusiveIso(customTo);
    if (!fromIso || !toIso) {
      setError(null);
      setFilter("24h");
      setCustomRangeOpen(false);
      if (trackerScannedWallet || trackerWalletInput.trim()) {
        handleSearch("24h", trackerScannedWallet || trackerWalletInput);
      }
      return;
    }
    if (new Date(fromIso).getTime() >= new Date(toIso).getTime()) {
      setError("Start date must be earlier than end date.");
      return;
    }
    setError(null);
    setFilter("custom");
    if (trackerScannedWallet || trackerWalletInput.trim()) {
      handleSearch("custom", trackerScannedWallet || trackerWalletInput);
    }
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

  const activeScannedWallet = activeNav === "portfolio" ? portfolioScannedWallet : trackerScannedWallet;
  const activeProfile = activeNav === "portfolio" ? portfolioProfile : trackerProfile;
  const displayedWallet = activeScannedWallet || activeWalletInput;
  const userXP = typeof activeProfile?.xp === "number" ? activeProfile.xp : null;
  const tierFromId =
    typeof activeProfile?.tierV2 === "number" && tiers.length > 0
      ? (tiers.find((t) => Number(t?.id) === activeProfile.tierV2) || null)
      : null;
  const tierFromXP = userXP !== null && tiers.length > 0 ? getUserTier(userXP, tiers) : null;
  const currentTier = tierFromXP || tierFromId || (activeProfile?.tierDisplayName ? {
    displayName: activeProfile.tierDisplayName,
    mainTier: activeProfile.tierMainTier || "silver",
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
  const customRangeLabel = formatRangeSummary(customFrom, customTo);
  const customRangeReady = Boolean(customFrom && customTo);
  const customRangeInvalid = customRangeReady && new Date(customFrom).getTime() > new Date(customTo).getTime();
  const customFromMax = customTo && customTo < todayDateValue ? customTo : todayDateValue;
  const profileHeaderDirection = is768 ? "column" : "row";
  const profileHeaderAlign = is768 ? "flex-start" : "center";
  const profileHeaderGap = is768 ? 10 : 12;
  const portfolioTokens = Array.isArray(portfolioData?.tokens) ? [...portfolioData.tokens] : [];
  const portfolioNfts = Array.isArray(portfolioData?.nfts) ? [...portfolioData.nfts] : [];

  useEffect(() => {
    if (activeNav !== "tracker" || filter !== "custom") return;
    if (!customRangeReady || customRangeInvalid) return;
    applyCustomRange();
  }, [activeNav, filter, customFrom, customTo]);

  useEffect(() => {
    if (customFrom && customFrom > todayDateValue) {
      setCustomFrom(todayDateValue);
    }
    if (customTo && customTo > todayDateValue) {
      setCustomTo(todayDateValue);
    }
  }, [customFrom, customTo, todayDateValue]);
  const nftGroups = portfolioNfts
    .map((n) => {
      const count = Math.max(1, Number(n?.count || 1));
      const floorPriceUsd = Number(n?.floorPriceUsd || 0);
      const topOfferUsd = Number(n?.topOfferUsd || 0);
      const totalValueUsd = Number(n?.totalValueUsd || 0);
      const contractAddress = String(n?.contractAddress || "").toLowerCase();
      const sampleItems = Array.isArray(n?.samples) ? n.samples : [];
      return {
        contractAddress,
        collectionName: n?.collectionName || "Unknown Collection",
        collectionSlug: n?.collectionSlug || null,
        collectionImage: n?.collectionImage || n?.image || null,
        floorPriceUsd,
        topOfferUsd,
        totalValueUsd,
        count,
        assetUrl: n?.assetUrl || (n?.collectionSlug ? `https://opensea.io/collection/${n.collectionSlug}` : null),
        items:
          sampleItems.length > 0
            ? sampleItems.map((s) => ({
                ...s,
                contractAddress: contractAddress || n?.contractAddress || "",
                collectionName: n?.collectionName || "Unknown Collection",
                floorPriceUsd,
                topOfferUsd,
                count: Math.max(1, Number(s?.count || s?.balance || 1)),
                totalValueUsd: 0,
              }))
            : [{
                contractAddress: contractAddress || n?.contractAddress || "",
                collectionName: n?.collectionName || "Unknown Collection",
                image: n?.image || n?.collectionImage || null,
                tokenId: null,
                count,
                floorPriceUsd,
                topOfferUsd,
                totalValueUsd: 0,
                assetUrl: n?.assetUrl || (n?.collectionSlug ? `https://opensea.io/collection/${n.collectionSlug}` : null),
              }],
      };
    })
    .sort((a, b) => b.totalValueUsd - a.totalValueUsd);
  const visibleNftGroups = showAllNftGroups ? nftGroups : nftGroups.slice(0, 5);
  const sortedPortfolioTokens = portfolioTokens.sort((a, b) => {
    const dir = tokenSort.dir === "asc" ? 1 : -1;
    if (tokenSort.key === "symbol") {
      return dir * String(a.symbol || "").localeCompare(String(b.symbol || ""));
    }
    const av = Number(a?.[tokenSort.key] || 0);
    const bv = Number(b?.[tokenSort.key] || 0);
    return dir * (av - bv);
  });

  const portfolioTokenValue = Number(portfolioData?.totals?.tokenValueUsd || 0);
  const portfolioNftValue = Number(portfolioData?.totals?.nftValueUsd || 0);
  const portfolioNetWorth = portfolioTokenValue + portfolioNftValue;
  const portfolioGasEth = Number(portfolioData?.gas?.valueEth || 0);
  const portfolioVolumeUsd = Number(portfolioData?.volume?.valueUsd || 0);
  const isScanLoading = activeNav === "portfolio" ? portfolioLoading : loading;

  function fmtUsd(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  function fmtEth(value) {
    return `${Number(value || 0).toFixed(4)} ETH`;
  }

  function onSortTokens(key) {
    setTokenSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: key === "symbol" ? "asc" : "desc" };
    });
  }

  function toggleNftGroup(groupKey) {
    setExpandedNftGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }

  function buildSparkline(values, width = 220, height = 44) {
    const nums = (Array.isArray(values) ? values : []).map((v) => Number(v || 0)).filter((v) => Number.isFinite(v));
    if (!nums.length) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = Math.max(max - min, 1e-9);
    const step = nums.length <= 1 ? width : width / (nums.length - 1);
    return nums
      .map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / span) * height;
        return `${x},${y}`;
      })
      .join(" ");
  }

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
        cursor: collapsed && !is1024 ? "pointer" : "default",
        ...(is1024 ? {
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          transform: collapsed ? "translateX(-100%)" : "translateX(0)",
        } : {}),
      }}
      onClickCapture={() => {
        if (collapsed && !is1024) setCollapsed(false);
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
            const sidebarOpen = !collapsed;
            return (
              <button
                key={item.id}
                onClick={!isDisabled ? () => {
                  setShowSuggestions(false);
                  setSearchFocused(false);
                  setActiveNav(item.id);
                } : undefined}
                aria-disabled={isDisabled}
                tabIndex={isDisabled ? -1 : 0}
                title={isDisabled ? `${item.label} - Coming soon` : item.label}
                style={{
                  display: "flex", alignItems: "center",
                  justifyContent: collapsed ? "center" : "flex-start",
                  gap: collapsed ? 0 : 10,
                  margin: collapsed ? "0 6px" : "0 8px",
                  padding: collapsed ? "4px" : "8px 10px",
                  borderRadius: 12,
                  border: sidebarOpen && isActive ? "1px solid #23262d" : "1px solid transparent",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  pointerEvents: isDisabled ? "none" : "auto",
                  background: sidebarOpen && isActive ? "linear-gradient(90deg,#1a1d24 0%, #181a20 100%)" : "transparent",
                  color: isActive ? "#fff" : isDisabled ? "#394150" : "#4b5563",
                  transition: "all 0.18s", textAlign: "left",
                  opacity: isDisabled ? 0.92 : 1,
                  boxShadow: sidebarOpen && isActive ? "inset 0 1px 0 rgba(255,255,255,0.03)" : "none",
                }}>
                <span style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: sidebarOpen
                    ? (isActive ? "#232833" : "#12151b")
                    : (isActive ? "#151922" : "#101318"),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13,
                  lineHeight: 1,
                  color: isActive
                    ? "#34d399"
                    : isDisabled
                      ? "#374151"
                      : "#4b5563",
                  border: "1px solid " + (sidebarOpen ? (isActive ? "#353d4c" : "#1d222b") : "#1a1d24"),
                  boxShadow: sidebarOpen
                    ? (isActive ? "0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 2px rgba(255,255,255,0.08)" : "inset 0 1px 1px rgba(255,255,255,0.04)")
                    : "none",
                  textAlign: "center",
                  overflow: "hidden",
                }}>
                  <img
                    src={item.iconUrl}
                    alt={item.label}
                    style={{
                      width: 21,
                      height: 21,
                      objectFit: "contain",
                      display: "block",
                      borderRadius: 4,
                      filter: isDisabled
                        ? SIDEBAR_ICON_FILTERS.disabled
                        : isActive
                          ? SIDEBAR_ICON_FILTERS.active
                          : SIDEBAR_ICON_FILTERS.inactive,
                      transform: isActive ? "scale(1.04)" : "scale(1)",
                      transition: "filter 0.18s ease, transform 0.18s ease",
                    }}
                  />
                </span>
                {!collapsed && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 0, width: "100%" }}>
                    <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>{item.label}</span>
                    {!isDisabled && item.badge && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        color: "#34d399",
                        border: "1px solid #14532d",
                        borderRadius: 999,
                        padding: "2px 6px",
                        marginLeft: 8,
                        whiteSpace: "nowrap",
                        background: "rgba(16,185,129,0.08)",
                      }}>
                        {item.badge}
                      </span>
                    )}
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
              width: 38, height: 38, borderRadius: 10,
              background: showSettings ? "#232833" : "#12151b",
              border: showSettings ? "1px solid #353d4c" : "1px solid #1d222b",
              boxShadow: showSettings ? "0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 2px rgba(255,255,255,0.08)" : "inset 0 1px 1px rgba(255,255,255,0.04)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
            <img
              src={SIDEBAR_ICON_URLS.settings}
              alt="Settings"
              style={{
                width: 18,
                height: 18,
                objectFit: "contain",
                display: "block",
                borderRadius: 4,
                filter: showSettings ? SIDEBAR_ICON_FILTERS.settingsActive : SIDEBAR_ICON_FILTERS.settingsInactive,
                transform: showSettings ? "scale(1.04)" : "scale(1)",
                transition: "filter 0.18s ease, transform 0.18s ease",
              }}
            />
          </button>
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
                ?
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: is480 ? 14 : 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
                {activeNav === "portfolio" ? "Portfolio Tracker" : "Wallet Tracker"}
              </span>
              {!is480 && (
                <span style={{ fontSize: 12, color: "#555", marginLeft: 10 }}>
                  {activeNav === "portfolio" ? "Abstract chain · wallet finance" : "Abstract chain · dapp analytics"}
                </span>
              )}
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
                  width: 21,
                  height: 21,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 2,
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <img
                  src="https://da0a8d63d0723a01b9d7d92ba8c7e1cf.cdn.bubble.io/cdn-cgi/image/w=192,h=192,f=auto,dpr=1.5,fit=contain/f1768235282843x762039647217121200/Abstract_Icon_OffWhite.png"
                  alt="Search icon"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    opacity: searchFocused || searchHovered ? 1 : 0.82,
                    filter: searchFocused || searchHovered
                      ? "brightness(0) saturate(100%) invert(78%) sepia(18%) saturate(846%) hue-rotate(97deg) brightness(92%) contrast(86%)"
                      : "brightness(0) saturate(100%) invert(51%) sepia(7%) saturate(481%) hue-rotate(102deg) brightness(91%) contrast(87%)",
                    transition: "filter 0.2s ease, opacity 0.2s ease",
                  }}
                />
              </span>
              <input
                type="text"
                placeholder="Search by address or username..."
                value={activeWalletInput}
                onChange={e => {
                  const nextValue = e.target.value;
                  if (activeNav === "portfolio") setPortfolioWalletInput(nextValue);
                  else setTrackerWalletInput(nextValue);
                }}
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
                disabled={isScanLoading}
                style={{
                  padding: searchBtnPadding,
                  borderRadius: 12,
                  border: "1px solid " + (isScanLoading ? "#2b2b2b" : "#2f5f4c"),
                  background: isScanLoading ? "#1b1b1b" : "linear-gradient(180deg,#1e2f29,#16211e)",
                  color: isScanLoading ? "#666" : "#d9fceb",
                  fontWeight: 800,
                  fontSize: is480 ? 12 : 13,
                  cursor: isScanLoading ? "not-allowed" : "pointer",
                  flexShrink: 0,
                  letterSpacing: "0.02em",
                  boxShadow: isScanLoading ? "none" : "0 8px 15px rgba(0,0,0,0.35), 0 0 0 1px rgba(52,211,153,0.14)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={e => {
                  if (isScanLoading) return;
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.background = "linear-gradient(180deg,#2ac483,#22b377)";
                  e.currentTarget.style.color = "#062017";
                  e.currentTarget.style.boxShadow = "0 14px 22px rgba(46,229,157,0.28), 0 0 20px rgba(46,229,157,0.3)";
                  e.currentTarget.style.borderColor = "#2ee59d";
                }}
                onMouseLeave={e => {
                  if (isScanLoading) return;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.background = "linear-gradient(180deg,#1e2f29,#16211e)";
                  e.currentTarget.style.color = "#d9fceb";
                  e.currentTarget.style.boxShadow = "0 8px 15px rgba(0,0,0,0.35), 0 0 0 1px rgba(52,211,153,0.14)";
                  e.currentTarget.style.borderColor = "#2f5f4c";
                }}
                onMouseDown={e => {
                  if (isScanLoading) return;
                  e.currentTarget.style.transform = "translateY(1px)";
                }}
                onMouseUp={e => {
                  if (isScanLoading) return;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {!isScanLoading && (
                    <img
                      src="https://da0a8d63d0723a01b9d7d92ba8c7e1cf.cdn.bubble.io/cdn-cgi/image/w=192,h=192,f=auto,dpr=1.5,fit=contain/f1768235282843x762039647217121200/Abstract_Icon_OffWhite.png"
                      alt="Scan icon"
                      style={{
                        width: is480 ? 14 : 16,
                        height: is480 ? 14 : 16,
                        objectFit: "contain",
                        opacity: 0.98,
                        filter: "brightness(0) saturate(100%) invert(94%) sepia(17%) saturate(218%) hue-rotate(85deg) brightness(104%) contrast(98%)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span>{isScanLoading ? "Scanning..." : "Scan"}</span>
                </span>
              </button>

              {showSuggestions && searchFocused && activeWalletInput.trim() && (
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
                        if (activeNav === "portfolio") setPortfolioWalletInput(value);
                        else setTrackerWalletInput(value);
                        setShowSuggestions(false);
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
            {activeNav === "tracker" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["recent","Recent · 3h"],["24h","Last 24h"],["7d","Last 7 Days"],["custom","Custom"]].map(([val, label]) => (
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
                {filter === "custom" && customRangeLabel ? (
                  <div style={{
                    padding: "6px 14px",
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#a7f3d0",
                    background: "rgba(52,211,153,0.08)",
                    outline: "1px solid rgba(52,211,153,0.15)",
                  }}>
                    {customRangeLabel}
                  </div>
                ) : null}
                </div>
                <style>{`
                  .custom-datetime-input::-webkit-calendar-picker-indicator {
                    filter: brightness(0) invert(1);
                    opacity: 1;
                    cursor: pointer;
                  }

                  .custom-datetime-input::-webkit-calendar-picker-indicator:hover {
                    opacity: 1;
                  }
                `}</style>
                {(customRangeOpen || filter === "custom") && (
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                    padding: is480 ? "10px" : "12px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.02)",
                    outline: "1px solid #1a1a1a",
                  }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: is480 ? "100%" : 200 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>Start</span>
                      <input
                        type="date"
                        className="custom-datetime-input"
                        value={customFrom}
                        max={customFromMax}
                        onChange={(e) => {
                          const nextValue = e.target.value && e.target.value > todayDateValue
                            ? todayDateValue
                            : e.target.value;
                          setCustomFrom(nextValue);
                          if (customTo && nextValue && customTo < nextValue) {
                            setCustomTo(nextValue);
                          }
                        }}
                        onClick={openNativeDateTimePicker}
                        onFocus={openNativeDateTimePicker}
                        style={{
                          background: "#0b0d0d",
                          color: "#e5e7eb",
                          border: "1px solid #1f2937",
                          borderRadius: 10,
                          padding: "10px 12px",
                          fontSize: 12,
                          outline: "none",
                          colorScheme: "dark",
                          cursor: "pointer",
                        }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: is480 ? "100%" : 200 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>End</span>
                      <input
                        type="date"
                        className="custom-datetime-input"
                        value={customTo}
                        min={customFrom || undefined}
                        max={todayDateValue}
                        onChange={(e) => {
                          const nextValue = e.target.value && e.target.value > todayDateValue
                            ? todayDateValue
                            : e.target.value;
                          setCustomTo(nextValue);
                        }}
                        onClick={openNativeDateTimePicker}
                        onFocus={openNativeDateTimePicker}
                        style={{
                          background: "#0b0d0d",
                          color: "#e5e7eb",
                          border: "1px solid #1f2937",
                          borderRadius: 10,
                          padding: "10px 12px",
                          fontSize: 12,
                          outline: "none",
                          colorScheme: "dark",
                          cursor: "pointer",
                        }}
                      />
                    </label>
                    <div style={{
                      marginLeft: "auto",
                      minWidth: is480 ? "100%" : 200,
                      display: "flex",
                      justifyContent: is480 ? "flex-start" : "flex-end",
                      alignItems: "center",
                    }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: customRangeInvalid ? "#f87171" : customRangeReady ? "#34d399" : "#6b7280",
                      }}>
                        {customRangeInvalid
                          ? "End date must be after start date."
                          : customRangeReady
                            ? "Auto applying selected range..."
                            : "Select start and end date"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Error */}
          {((activeNav === "tracker" && error) || (activeNav === "portfolio" && portfolioError)) && (
            <div style={{
              padding: "12px 16px", borderRadius: 12, marginBottom: 16,
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
              color: "#ef4444", fontSize: 13,
            }}>? {activeNav === "tracker" ? error : portfolioError}</div>
          )}

          {/* Loading */}
          {(activeNav === "tracker" ? loading : portfolioLoading) && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                border: "2px solid #1a1a1a", borderTopColor: "#34d399",
                animation: "spin 0.8s linear infinite",
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontSize: 13, color: "#555" }}>
                {activeNav === "tracker" ? "Scanning on-chain activity..." : "Loading portfolio analytics..."}
              </p>
            </div>
          )}

          {/* RESULTS */}
          {activeNav === "tracker" && results && !loading && (
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
                    {trackerProfile?.avatar
                      ? <img src={trackerProfile.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : displayedWallet.slice(2, 4).toUpperCase()
                    }
                  </div>
                  <div>
                    {trackerProfile?.username && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{trackerProfile.username}</span>
                        {trackerProfile.verified && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                            background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)",
                          }}>{`\u2713`} verified</span>
                        )}
                        {!trackerProfile.verified && (
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
                    <div style={{ fontSize: 12, fontWeight: trackerProfile?.username ? 400 : 700, color: trackerProfile?.username ? "#555" : "#fff", fontFamily: "monospace" }}>
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
                  { label: "Transactions", value: results.totalTxns, color: "#34d399", note: filter === "recent" ? "last 3h" : filter === "24h" ? "last 24h" : filter === "7d" ? "last 7d" : (customRangeLabel || "custom range") },
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
                    {filter === "custom" ? "No activity in selected range." : "No interactions found."}
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
                            onMouseLeave={e => e.target.style.color = "#444"}>?</a>
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

          {/* PORTFOLIO RESULTS */}
          {activeNav === "portfolio" && portfolioScannedWallet && !portfolioLoading && !portfolioError && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{
                display: "flex", flexDirection: profileHeaderDirection, alignItems: profileHeaderAlign, justifyContent: "space-between",
                padding: "14px 18px", borderRadius: 14,
                background: "#0a0a0a", border: "1px solid #1a1a1a",
                gap: profileHeaderGap,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: "#34d399", fontWeight: 800, overflow: "hidden",
                  }}>
                    {portfolioProfile?.avatar
                      ? <img src={portfolioProfile.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : portfolioScannedWallet.slice(2, 4).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{portfolioProfile?.username || "Wallet"}</span>
                      {portfolioProfile?.verified && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                          background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)",
                        }}>{`\u2713`} verified</span>
                      )}
                      {currentTier && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 99,
                          textTransform: "uppercase", color: tierColor, background: `${tierColor}14`, border: `1px solid ${tierColor}45`,
                        }}>
                          {currentTier.displayName || currentTier.name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#555", fontFamily: "monospace" }}>
                      {portfolioScannedWallet.slice(0,10)}...{portfolioScannedWallet.slice(-8)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: is768 ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))", gap: 12 }}>
                {[
                  { label: "Net Worth", value: fmtUsd(portfolioNetWorth), color: "#34d399", note: null },
                  { label: "Token Value", value: fmtUsd(portfolioTokenValue), color: "#60a5fa", note: null },
                  { label: "NFT Value", value: fmtUsd(portfolioNftValue), color: "#a78bfa", note: null },
                  { label: "Gas Spent", value: fmtEth(portfolioGasEth), color: "#f59e0b", note: "Last 7 days" },
                  { label: "Volume", value: fmtUsd(portfolioVolumeUsd), color: "#22d3ee", note: "Last 7 days" },
                ].map((s) => (
                  <div key={s.label} style={{
                    padding: "16px 18px", borderRadius: 14, background: "#0a0a0a", border: "1px solid #1a1a1a",
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${s.color}66,transparent)` }} />
                    <div style={{ fontSize: is480 ? 18 : 22, fontWeight: 900, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 5 }}>{s.label}</div>
                    {s.note && (
                      <div style={{ fontSize: 10, color: "#525252", marginTop: 2 }}>{s.note}</div>
                    )}
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 4,
                  borderRadius: 999,
                  border: "1px solid #1f2937",
                  background: "#0b0d10",
                  alignSelf: "flex-start",
                  width: "fit-content",
                }}
              >
                {[
                  { id: "tokens", label: "Tokens" },
                  { id: "nfts", label: "NFTs" },
                ].map((tab) => {
                  const active = portfolioTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setPortfolioTab(tab.id)}
                      style={{
                        border: "none",
                        borderRadius: 999,
                        padding: "8px 16px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        color: active ? "#d1fae5" : "#94a3b8",
                        background: active ? "linear-gradient(135deg,#113126,#0b1f18)" : "transparent",
                        boxShadow: active ? "inset 0 0 0 1px rgba(52,211,153,0.25)" : "none",
                        transition: "all .16s ease",
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {portfolioTab === "tokens" && (
              <div style={{ borderRadius: 14, border: "1px solid #1a1a1a", overflowX: "auto", background: "#070809" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #1a1a1a", background: "#0a0a0a", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                  Token Holdings
                </div>
                <div style={{ minWidth: is768 ? 560 : "auto" }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
                    gap: 10, padding: "8px 18px", borderBottom: "1px solid #111",
                    fontSize: 10, fontWeight: 700, color: "#525252", textTransform: "uppercase", letterSpacing: "0.08em",
                  }}>
                    <button onClick={() => onSortTokens("symbol")} style={{ background: "transparent", border: "none", color: "inherit", textAlign: "left", cursor: "pointer" }}>Token</button>
                    <button onClick={() => onSortTokens("priceUsd")} style={{ background: "transparent", border: "none", color: "inherit", textAlign: "right", cursor: "pointer" }}>Price</button>
                    <button onClick={() => onSortTokens("balance")} style={{ background: "transparent", border: "none", color: "inherit", textAlign: "right", cursor: "pointer" }}>Balance</button>
                    <button onClick={() => onSortTokens("valueUsd")} style={{ background: "transparent", border: "none", color: "inherit", textAlign: "right", cursor: "pointer" }}>Value</button>
                  </div>
                  {sortedPortfolioTokens.length === 0 ? (
                    <div style={{ padding: "28px 18px", color: "#525252", fontSize: 12 }}>No token holdings found.</div>
                  ) : sortedPortfolioTokens.map((t) => (
                    <div key={`${t.contractAddress}-${t.symbol}`} style={{
                      display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
                      gap: 10, padding: "11px 18px", borderBottom: "1px solid #0d0d0d", alignItems: "center",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <img src={t.icon} alt={t.symbol} style={{ width: 24, height: 24, borderRadius: 8, border: "1px solid #1f2937" }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#f3f4f6" }}>{t.symbol}</div>
                          <div style={{ fontSize: 10, color: "#525252", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{t.contractAddress}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 12, color: "#9ca3af" }}>{fmtUsd(t.priceUsd)}</div>
                      <div style={{ textAlign: "right", fontSize: 12, color: "#9ca3af" }}>{Number(t.balance || 0).toLocaleString("en-US", { maximumFractionDigits: 6 })}</div>
                      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: "#34d399" }}>{fmtUsd(t.valueUsd)}</div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {portfolioTab === "nfts" && (
              <div style={{ borderRadius: 14, border: "1px solid #1a1a1a", background: "#070809", overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #1a1a1a", background: "#0a0a0a", color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>NFT Holdings</span>
                  <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>
                    Sorted by highest value
                  </span>
                </div>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {!is768 && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 70px 110px 110px 120px",
                      gap: 10,
                      padding: "0 12px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}>
                      <div>Assets</div>
                      <div style={{ textAlign: "right" }}>Count</div>
                      <div style={{ textAlign: "right" }}>Floor Price</div>
                      <div style={{ textAlign: "right" }}>Top Offer</div>
                      <div style={{ textAlign: "right" }}>Total Value</div>
                    </div>
                  )}
                  {nftGroups.length === 0 ? (
                    <div style={{ color: "#525252", fontSize: 12 }}>No NFT holdings found.</div>
                  ) : visibleNftGroups.map((group) => {
                    const groupKey = group.contractAddress || group.collectionName;
                    const expanded = !!expandedNftGroups[groupKey];
                    return (
                      <div key={groupKey} style={{ border: "1px solid #1a1a1a", borderRadius: 12, background: "#0a0a0a", overflow: "hidden" }}>
                        <button
                          onClick={() => toggleNftGroup(groupKey)}
                          style={{
                            width: "100%",
                            display: "grid",
                            gridTemplateColumns: is768 ? "24px 1fr auto" : "24px 1.6fr 70px 110px 110px 120px",
                            gap: 10,
                            alignItems: "center",
                            textAlign: "left",
                            background: "linear-gradient(90deg,#0f1318,#0b0e13)",
                            border: "none",
                            color: "#e5e7eb",
                            padding: "10px 12px",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            border: `1px solid ${expanded ? "#2c7a67" : "#273140"}`,
                            color: expanded ? "#34d399" : "#94a3b8",
                            background: expanded ? "rgba(7,29,23,0.85)" : "rgba(13,18,24,0.75)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            lineHeight: 1,
                          }}>{expanded ? "?" : "?"}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <img
                              src={group.collectionImage || `/api/avatar?u=${encodeURIComponent(group.contractAddress || group.collectionName)}`}
                              alt={group.collectionName}
                              style={{ width: 30, height: 30, borderRadius: 9, objectFit: "cover", border: "1px solid #1f2937", flexShrink: 0 }}
                            />
                            <span style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.collectionName}</span>
                          </div>
                          {!is768 && <span style={{ fontSize: 12, color: "#e5e7eb", textAlign: "right", fontWeight: 700 }}>{group.count}</span>}
                          {!is768 && <span style={{ fontSize: 12, color: "#9ca3af", textAlign: "right" }}>{group.floorPriceUsd ? fmtUsd(group.floorPriceUsd) : "—"}</span>}
                          {!is768 && <span style={{ fontSize: 12, color: "#9ca3af", textAlign: "right" }}>{group.topOfferUsd > 0 ? fmtUsd(group.topOfferUsd) : "—"}</span>}
                          {!is768 && <span style={{ fontSize: 12, color: "#34d399", textAlign: "right", fontWeight: 700 }}>{group.totalValueUsd > 0 ? fmtUsd(group.totalValueUsd) : "—"}</span>}
                          {is768 && <span style={{ fontSize: 11, color: "#6b7280", textAlign: "right" }}>{group.count} NFTs · {group.topOfferUsd > 0 ? `Top ${fmtUsd(group.topOfferUsd)}` : "No top offer"}</span>}
                        </button>

                        {expanded && (
                          <div style={{ borderTop: "1px solid #151922", background: "#090d12" }}>
                            {group.items.map((n, idx) => (
                              (() => {
                                const itemCount = Math.max(1, Number(n.count || 1));
                                const itemTopOffer = Number(n.topOfferUsd || 0);
                                const itemFloor = Number(n.floorPriceUsd || 0);
                                const isCollectionPlaceholder = !n.tokenId;
                                const itemUnitValue = itemTopOffer > 0 ? itemTopOffer : itemFloor;
                                const itemTotal = !isCollectionPlaceholder && itemUnitValue > 0 ? itemUnitValue * itemCount : 0;
                                return (
                              <a
                                key={`${n.contractAddress}-${n.tokenId || "collection"}-${idx}`}
                                href={n.assetUrl || (n.contractAddress && n.tokenId ? `https://opensea.io/assets/abstract/${n.contractAddress}/${n.tokenId}` : "#")}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: is768 ? "1fr auto" : "1.6fr 70px 110px 110px 120px",
                                  gap: 10,
                                  alignItems: "center",
                                  padding: "10px 12px",
                                  borderTop: idx === 0 ? "none" : "1px solid #121821",
                                  textDecoration: "none",
                                  color: "inherit",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                  <img
                                    src={n.image || group.collectionImage || `/api/avatar?u=${encodeURIComponent(group.contractAddress || group.collectionName)}`}
                                    alt={n.collectionName}
                                    style={{ width: 24, height: 24, borderRadius: 7, objectFit: "cover", border: "1px solid #1f2937", flexShrink: 0 }}
                                  />
                                  <span style={{ fontSize: 11, color: "#d1d5db", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {n.tokenId ? `${group.collectionName} #${n.tokenId}` : group.collectionName}
                                  </span>
                                </div>
                                {!is768 && <span style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>{itemCount}</span>}
                                {!is768 && <span style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>{itemFloor ? fmtUsd(itemFloor) : "—"}</span>}
                                {!is768 && <span style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>{itemTopOffer ? fmtUsd(itemTopOffer) : "—"}</span>}
                                {!is768 && <span style={{ fontSize: 11, color: "#34d399", textAlign: "right", fontWeight: 700 }}>{itemTotal ? fmtUsd(itemTotal) : "—"}</span>}
                                {is768 && <span style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>{itemTopOffer ? fmtUsd(itemTopOffer) : "—"}</span>}
                              </a>
                                );
                              })()
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {portfolioNfts.length > 0 && (
                  <div style={{ padding: "0 14px 14px" }}>
                    <button
                      onClick={() => setShowAllNftGroups((prev) => !prev)}
                      disabled={nftGroups.length <= 5}
                      style={{
                        width: "100%",
                        borderRadius: 10,
                        border: "1px solid " + (nftGroups.length <= 5 ? "#1f2937" : "#24463a"),
                        background: nftGroups.length <= 5 ? "#0b0f0d" : "#0f1714",
                        color: nftGroups.length <= 5 ? "#4b5563" : "#34d399",
                        padding: "10px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: nftGroups.length <= 5 ? "not-allowed" : "pointer",
                      }}
                    >
                      {nftGroups.length <= 5 ? "All NFTs shown" : showAllNftGroups ? "Show top 5 NFTs" : "Show all NFTs"}
                    </button>
                  </div>
                )}
              </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: is768 ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div style={{ borderRadius: 14, border: "1px solid #1a1a1a", background: "#0a0a0a", padding: "14px 18px" }}>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>Gas Analytics</div>
                  <div style={{ marginTop: 10, height: 44 }}>
                    {(() => {
                      const points = Array.isArray(portfolioData?.gas?.points) ? portfolioData.gas.points.map((p) => p?.v || 0) : [];
                      const poly = buildSparkline(points, 220, 40);
                      return poly ? (
                        <svg viewBox="0 0 220 44" width="100%" height="44" preserveAspectRatio="none">
                          <polyline
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={poly}
                          />
                        </svg>
                      ) : (
                        <div style={{ fontSize: 11, color: "#4b5563" }}>No chart data for selected timeframe.</div>
                      );
                    })()}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                    Last 7 days: {fmtEth(portfolioData?.gas?.breakdown?.["7d"])}
                  </div>
                </div>
                <div style={{ borderRadius: 14, border: "1px solid #1a1a1a", background: "#0a0a0a", padding: "14px 18px" }}>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>Volume Analytics</div>
                  <div style={{ marginTop: 10, height: 44 }}>
                    {(() => {
                      const points = Array.isArray(portfolioData?.volume?.points) ? portfolioData.volume.points.map((p) => p?.vUsd || 0) : [];
                      const poly = buildSparkline(points, 220, 40);
                      return poly ? (
                        <svg viewBox="0 0 220 44" width="100%" height="44" preserveAspectRatio="none">
                          <polyline
                            fill="none"
                            stroke="#22d3ee"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={poly}
                          />
                        </svg>
                      ) : (
                        <div style={{ fontSize: 11, color: "#4b5563" }}>No chart data for selected timeframe.</div>
                      );
                    })()}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                    Last 7 days: {fmtUsd(portfolioData?.volume?.breakdownUsd?.["7d"])}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {activeNav === "tracker" && !results && !loading && !error && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 16 }}>
              <div style={EMPTY_STATE_ICON_STYLE}>
                <img
                  src={SIDEBAR_ICON_URLS.portfolio}
                  alt="wallet icon"
                  style={EMPTY_STATE_ICON_IMAGE_STYLE}
                />
              </div>
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
          {activeNav === "portfolio" && !portfolioScannedWallet && !portfolioLoading && !portfolioError && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 16 }}>
              <div style={EMPTY_STATE_ICON_STYLE}>
                <img
                  src={SIDEBAR_ICON_URLS.portfolio}
                  alt="wallet icon"
                  style={EMPTY_STATE_ICON_IMAGE_STYLE}
                />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>No wallet loaded</p>
                <p style={{ fontSize: 13, color: "#404040", marginTop: 6 }}>Scan wallet address or username to load portfolio</p>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}


















