import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  normalizeErc1155Balance,
  computeCollectionValue,
  pickBestDexPair,
} = require("../app/api/portfolio/_lib/portfolio-math.cjs");

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

run("normalizeErc1155Balance handles hex and numeric", () => {
  assert.equal(normalizeErc1155Balance("0x0"), 0);
  assert.equal(normalizeErc1155Balance("0x2"), 2);
  assert.equal(normalizeErc1155Balance(5), 5);
  assert.equal(normalizeErc1155Balance("7"), 7);
});

run("computeCollectionValue uses floor * count", () => {
  assert.equal(computeCollectionValue({ count: 20, floorPrice: 19.15 }), 383);
  assert.equal(computeCollectionValue({ count: 0, floorPrice: 10 }), 0);
  assert.equal(computeCollectionValue({ count: 10, floorPrice: 0 }), 0);
});

run("pickBestDexPair prioritizes abstract + liquidity", () => {
  const best = pickBestDexPair([
    { chainId: "base", priceUsd: 999, liquidity: { usd: 10 }, quoteToken: { symbol: "USDC" } },
    { chainId: "abstract", priceUsd: 0.003, liquidity: { usd: 8000 }, quoteToken: { symbol: "WETH" }, volume: { h24: 1000 } },
    { chainId: "abstract", priceUsd: 0.35, liquidity: { usd: 5 }, quoteToken: { symbol: "XYZ" }, volume: { h24: 1 } },
  ]);
  assert.ok(best);
  assert.equal(best.priceUsd, 0.003);
});

console.log("All tests passed.");

