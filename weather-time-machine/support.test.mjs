import test from "node:test";
import assert from "node:assert/strict";
import {DONATION_URL,verifiedSupportUrl} from "./support.mjs";

test("no payment link or bank data is configured by default",()=>{
  assert.equal(DONATION_URL,"");
  assert.equal(verifiedSupportUrl(DONATION_URL),null);
});
test("only verified HTTPS support page domains are accepted",()=>{
  assert.equal(verifiedSupportUrl("https://ko-fi.com/anagenisismeteo?utm_source=test"),"https://ko-fi.com/anagenisismeteo");
  assert.equal(verifiedSupportUrl("https://buymeacoffee.com/anagenisismeteo"),"https://buymeacoffee.com/anagenisismeteo");
  for(const url of [
    "http://ko-fi.com/anagenisismeteo",
    "https://ko-fi.com.evil.test/support",
    "https://ko-fi.com/",
    "https://name:password@ko-fi.com/profile",
    "javascript:alert(1)",
    "https://paypal.me/random",
    "",
    "not-a-url"
  ])assert.equal(verifiedSupportUrl(url),null);
});
