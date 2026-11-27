import {CLOUDFLARE_WEB_ANALYTICS_TOKEN} from "./analytics-config.mjs";

const BEACON_SRC="https://static.cloudflareinsights.com/beacon.min.js";
// Cloudflare supplies a UUID site token in its Web Analytics snippet.
// Do not load any external analytics script for a missing/malformed token.
export function validCloudflareToken(token){
  return typeof token==="string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
}
export function configureCloudflareAnalytics(doc,token=CLOUDFLARE_WEB_ANALYTICS_TOKEN){
  if(!validCloudflareToken(token))return false;
  if(!doc?.body||doc.getElementById("cloudflare-web-analytics"))return false;
  const script=doc.createElement("script");
  script.id="cloudflare-web-analytics";
  script.defer=true;
  script.src=BEACON_SRC;
  script.setAttribute("data-cf-beacon",JSON.stringify({token,spa:false}));
  doc.body.appendChild(script);
  return true;
}
if(typeof document!=="undefined")configureCloudflareAnalytics(document);
