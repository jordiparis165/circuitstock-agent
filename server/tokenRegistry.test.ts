import assert from "node:assert/strict";
import test from "node:test";
import { getQuoteToken } from "./tokenRegistry";

test("getQuoteToken: Ondo on BSC requires USDT (verified - BSC rejects USDC with code 40368)", () => {
  assert.equal(getQuoteToken("ondo", "56").symbol, "USDT");
  assert.equal(getQuoteToken("ondo", 56).symbol, "USDT"); // numeric chain id too
});

test("getQuoteToken: bStock on BSC uses USDC (verified - also accepts USDT, but USDC is the default)", () => {
  assert.equal(getQuoteToken("bstock", "56").symbol, "USDC");
});

test("getQuoteToken: platform is case-insensitive", () => {
  assert.equal(getQuoteToken("Ondo", "56").symbol, "USDT");
  assert.equal(getQuoteToken("BSTOCK", "56").symbol, "USDC");
});

test("getQuoteToken: unmapped platform/chain falls back to USDC rather than guessing per call", () => {
  assert.equal(getQuoteToken("ondo", "1").symbol, "USDC"); // Ethereum Ondo stablecoin is unverified - see docs
  assert.equal(getQuoteToken(undefined, "56").symbol, "USDC");
  assert.equal(getQuoteToken("unknown-platform", "56").symbol, "USDC");
});
