import { NextResponse } from "next/server";

const ABSTRACT_CHAIN_ID = 2741;
const API_KEY = process.env.ETHERSCAN_API_KEY;

// ─── DAPP REGISTRY (inline — no import needed) ───────────
const DAPP_REGISTRY = [
  { name: "Abstract Bridge", category: "bridge", icon: "/api/avatar?u=AbstractChain", contracts: ["0x10919913673e0a7efb9b98e30d0cb3bb4fa9cb8c","0x0000000000000000000000000000000000008008"] },
  { name: "Abstract Global Wallet", category: "infra", icon: "/api/avatar?u=AbstractChain", contracts: ["0x0000000000000000000000000000000000008007","0x9b947df68d35281c972511b3e7bc875926f26c1a"] },
  { name: "Abstract Voting", category: "social", icon: "/api/avatar?u=AbstractChain", contracts: ["0x3b50de27506f0a8c1f4122a1e6f470009a76ce2a"] },
  { name: "Wrapped ETH (WETH)", category: "defi", icon: "/api/avatar?u=AbstractChain", contracts: ["0x4200000000000000000000000000000000000006","0x3439153eb7af838ad19d56e1571fbd09333c2809"] },
  { name: "Uniswap V3", category: "defi", icon: "/api/avatar?u=Uniswap", contracts: ["0x1f98431c8ad98523631ae4a59f267346ea31f984","0xe592427a0aece92de3edee1f18e0157c05861564","0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45","0xc36442b4a4522e871399cd717abdd847ab11fe88","0x91ae842a5ffd8d12023116943e72a606179294f3","0xad1eca41e6f772be3cb5a48a6141f9bcc1af9f7c","0xfa928d3abc512383b8e5e77edd2d5678696084f9"] },
  { name: "Uniswap V2", category: "defi", icon: "/api/avatar?u=Uniswap", contracts: ["0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f","0x7a250d5630b4cf539739df2c5dacb4c659f2488d"] },
  { name: "Myriad Prediction Market", category: "defi", icon: "/api/avatar?u=MyriadMarkets", contracts: ["0x3e0f5f8f5fb043abfa475c0308417bf72c463289"] },
  { name: "Relay Bridge", category: "bridge", icon: "/api/avatar?u=RelayProtocol", contracts: ["0xa5f565650890fba1824ee0f21ebbbf660a179934","0x03508bb71268bba25ecacc8f620e01866650532c","0x4cd00e388f4d35b5c7e361c63f1474e8da785546","0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f","0x4cd00e387622c35bddb9b4c962c136462338bc31","0xf5042e6ffac5a625d4e7848e0b01373d8eb9e222"] },
  { name: "Stargate Finance", category: "bridge", icon: "/api/avatar?u=StargateFinance", contracts: ["0x45a01e4e04f14f7a4a6702c74187c5f6222033cd","0x296f55f8fb28e498b858d0bcda06d955b2cb3f97","0x84a71ccd554cc1b02749b35d22f684cc8ec987e1"] },
  { name: "Across Protocol", category: "bridge", icon: "/api/avatar?u=AcrossProtocol", contracts: ["0xe35e9842fceaca96570b734083f4a58e8f7c5f2a"] },
  { name: "Moody Madness", category: "gaming", icon: "/api/avatar?u=MoodyMights", contracts: ["0x35ffe9d966e35bd1b0e79f0d91e438701ea1c644","0x10919961a413610cad2f3d73dc94b3f44146a5f1","0x6fea0ccbb746d94657cec0884e84ccfdff0d5bd3"] },
  { name: "Kosmo (Objekt Minter)", category: "nft", icon: "/api/avatar?u=triplescosmos", contracts: ["0x569dcb7923866ba7198ee5b8c0c7a350f969218"] },
  { name: "OpenSea (Seaport)", category: "nft", icon: "/api/avatar?u=opensea", contracts: ["0x00000000000000adc04c56bf30ac9d3c0aaf14dc","0x0000000000000068f116a894984e2db1123eb395","0x00000000006c3852cbef3e08e8df289169ede581"] },
  { name: "Death Fun", category: "gaming", icon: "/api/avatar?u=DeathFunGame", contracts: ["0x27edd16ee56958fddcba08947f12c43ddec2b20c"] },
  { name: "Aborean", category: "gaming", icon: "/api/avatar?u=Aborean", contracts: ["0xc0f53703e9f4b79fa2fb09a2aeba487fa97729c9","0xa4890b89dc628bae614780079acc951fb0ecdc5f","0x4c68e4102c0f120cce9f08625bd12079806b7c4d","0xe8142d2f82036b6fc1e79e4ae85cf53fbffdc998","0x27b04370d8087e714a9f557c1eff7901cea6bb63","0x36cbf77d8f8355d7a077d670c29e290e41367072","0x5b4789afec36e61a74c15f898a3e45316b104cd7","0xe34be58e965a90ff3cbd42738651a630fb2552b4"] },
  { name: "Tollan Universe", category: "gaming", icon: "/api/avatar?u=TollanUniverse", contracts: ["0xc4d5107a91dd1271a4ea65a768a16aa64caca107"] },
  { name: "Ruyui", category: "gaming", icon: "/api/avatar?u=RuyuiFoundation", contracts: ["0x920fefb4e92dbba0393ba233cecb1051a0dde25c","0xf724aec8d4a4c88f4b475d412b1f50dc35c4ae3e"] },
  { name: "Gigaverse", category: "gaming", icon: "/api/avatar?u=playgigaverse", contracts: ["0x74eb92b33f2400eb14f6d6725b14f76078d5e731","0x59eec556cef447e13edf4bfd3d4433d8dad8a7a5"] },
  { name: "Cambria", category: "gaming", icon: "/api/avatar?u=playcambria", contracts: ["0x5f8abf7f164fbed5c51f696ddf3c2c17bcbc8fbb","0x47c6ce21490b691f2a8eea8051e784d021aef333","0xb3713f00135db530cdc097d375a25813807e256c"] },
  { name: "Khugabash", category: "gaming", icon: "/api/avatar?u=Khugaverse", contracts: ["0xafca524dc2cdd7c21cd1de4e837c8c813c8322cc"] },
  { name: "Xeet", category: "social", icon: "/api/avatar?u=xeetdotai", contracts: ["0xec27d2237432d06981e1f18581494661517e1bd3","0x57020375f4df37012a2f1c765d5a0f9a2bb77996"] },
  { name: "Dyli", category: "social", icon: "/api/avatar?u=dyli_io", contracts: ["0x458422e93bf89a109afc4fac00aacf2f18fcf541"] },
  { name: "Gacha Game", category: "gaming", icon: "/api/avatar?u=gacha_game_", contracts: ["0x3272596f776470d2d7c3f7dff3dc50888b7d8967"] },
  { name: "Blinko by Bearish", category: "gaming", icon: "/api/avatar?u=bearish_af", contracts: ["0x1859072d67fdD26c8782C90A1E4F078901c0d763"] },
  { name: "Spellborne", category: "gaming", icon: "/api/avatar?u=spellborne", contracts: ["0x56053bDb06C2F996924F0f8785200A73262B49aC","0x191b9f793e67452df89f920e6f97ae55b98e8098"] },
  { name: "MoG", category: "gaming", icon: "/api/avatar?u=onchainheroes", contracts: ["0xBDE2483b242C266a97E39826b2B5B3c06FC02916","0x33ee11ce309854a45b65368c078616abcb5c6e3d","0x7c47ea32fd27d1a74fc6e9f31ce8162e6ce070eb"] },
  { name: "Amigo", category: "gaming", icon: "/api/avatar?u=TryAmigoApp", contracts: ["0x4b48f3d1ddc9e5793d4817517255e6bef6d72a7c"] },
  { name: "Lolland", category: "defi", icon: "/api/avatar?u=LOLLandGame", contracts: ["0xa9053dc939d74222f7aa0b3a2be407abbfd56c6a","0x24ebed9c44ecfca47321037c3041fbbbe984094a"] },
  { name: "Pengu Clash", category: "gaming", icon: "/api/avatar?u=PenguClash", contracts: ["0xabed660eae79ff8945f3e8d0edc42657695a814c"] },
  { name: "Roach Racing", category: "gaming", icon: "/api/avatar?u=RoachRacingClub", contracts: ["0x7edd91c4dd202032872bfbfcd3a4e4f71cb4b8bc","0x341c67cb6b91fb0b476860e8487dac219e9d3369"] },
  { name: "Dojo3", category: "gaming", icon: "/api/avatar?u=Dojo3HQ", contracts: ["0x0b4429576e5ed44a1b8f676c8217eb45707afa3d"] },
  { name: "Riskiit", category: "gaming", icon: "/api/avatar?u=riskiiit", contracts: ["0xb4b55c656c6b89f020a6e1044b66d227b638c474","0x80381686185720086903b39a163b02454fcafa6","0x7cab6b1f410b4457ddfbf486dac6f9a1d148ac2f","0xefa7cac7dacf418f0cb1e15cc4b408806fbfa83a"] },
];

// Build fast lookup map
const LOOKUP = new Map();
for (const app of DAPP_REGISTRY) {
  for (const addr of app.contracts) {
    LOOKUP.set(addr.toLowerCase(), app);
  }
}

function resolveAddress(address) {
  const app = LOOKUP.get(address?.toLowerCase());
  if (app) return { name: app.name, category: app.category, icon: app.icon, known: true };
  return { name: `Contract ${address?.slice(0, 8)}...`, category: "unknown", icon: "❓", known: false };
}

function formatDate(timestamp) {
  const date = new Date(parseInt(timestamp) * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(timestamp) {
  const seconds = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export async function GET(request) {
  if (!API_KEY) {
    return NextResponse.json({ error: "Server misconfiguration: ETHERSCAN_API_KEY is missing." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");
  const requestedFilter = searchParams.get("filter") || "recent";
  const filter = ["recent", "24h", "7d"].includes(requestedFilter) ? requestedFilter : "recent";

  if (!wallet || !wallet.startsWith("0x") || wallet.length !== 42) {
    return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  }

  try {
    // Smart fetch caps (time-window still applied below).
    // recent/24h raised to reduce undercount for active wallets.
    const PAGE_SIZE = 100;
    const MAX_TXS = filter === "recent" ? 2000 : filter === "24h" ? 2000 : 2000;
    const MAX_PAGES = Math.ceil(MAX_TXS / PAGE_SIZE);
    const now = Math.floor(Date.now() / 1000);
    const TIME_CUTOFF = filter === "recent" ? 10800 : filter === "24h" ? 86400 : 604800; // recent=3h

    let allTxns = [];
    let page = 1;
    let reachedCutoff = false;

    while (page <= MAX_PAGES && !reachedCutoff) {
      const apiUrl = `https://api.etherscan.io/v2/api?chainid=${ABSTRACT_CHAIN_ID}&module=account&action=txlist&address=${wallet}&page=${page}&offset=${PAGE_SIZE}&sort=desc&apikey=${API_KEY}`;
      const response = await fetch(apiUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        if (page === 1) throw new Error(`Upstream API failed with status ${response.status}`);
        break;
      }
      const data = await response.json();
      if (!Array.isArray(data.result)) {
        if (page === 1) {
          const upstreamMessage = typeof data?.result === "string" ? data.result : "Invalid upstream response";
          throw new Error(upstreamMessage);
        }
        break;
      }
      if (data.result.length === 0) break;

      // Always collect txns; stop early if we hit the time cutoff
      allTxns = allTxns.concat(data.result);
      if (data.result.some(tx => now - parseInt(tx.timeStamp) >= TIME_CUTOFF)) {
        reachedCutoff = true; break;
      }

      if (data.result.length < PAGE_SIZE) break;
      page++;
    }

    if (allTxns.length === 0) {
      return NextResponse.json({ totalTxns: 0, uniqueApps: 0, lastActive: "N/A", apps: [], categories: {}, stats: { totalApps: 0, knownCount: 0, unknownCount: 0, categories: [] } });
    }

    let txns = allTxns;
    // Apply time filter for all modes
    txns = txns.filter(tx => now - parseInt(tx.timeStamp) < TIME_CUTOFF);
    if (txns.length > MAX_TXS) txns = txns.slice(0, MAX_TXS);

    const lastActive = txns[0]?.timeStamp
      ? `${timeAgo(txns[0].timeStamp)} · ${formatDate(txns[0].timeStamp)}`
      : "Unknown";

    // Resolve all contract interactions — group by APP NAME (merge multi-contract apps)
    const appMap = new Map(); // keyed by app name
    let unknownCount = 0;
    for (const tx of txns) {
      const to = tx.to?.toLowerCase();
      if (!to || !tx.input || tx.input === "0x") continue;
      const resolved = resolveAddress(tx.to);
      if (!resolved.known) {
        unknownCount++;
        continue; // skip unknowns
      }
      const key = resolved.name;
      if (!appMap.has(key)) {
        appMap.set(key, {
          address: tx.to, // show first contract address as representative
          name: resolved.name,
          category: resolved.category,
          icon: resolved.icon,
          url: resolved.url,
          known: true,
          count: 0,
        });
      }
      appMap.get(key).count++;
    }

    const apps = Array.from(appMap.values())
      .sort((a, b) => b.count - a.count);

    // Group by category
    const categories = {};
    for (const app of apps) {
      const cat = app.category || "unknown";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(app);
    }

    const uniqueCats = [...new Set(apps.map(a => a.category))];
    const stats = {
      totalApps: apps.length,
      knownCount: apps.filter(a => a.known).length,
      unknownCount,
      categories: uniqueCats,
    };

    return NextResponse.json({ totalTxns: txns.length, uniqueApps: apps.length, lastActive, apps, categories, stats });

  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json({ error: "Failed to fetch data. Please try again." }, { status: 500 });
  }
}


