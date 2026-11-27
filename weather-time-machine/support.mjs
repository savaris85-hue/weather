// No payment details, keys or beneficiary account are held by this app.
// Activate only after the creator verifies the public payment flow and receipts.
// Supported: a public Ko-fi page or Buy Me a Coffee page.
export const DONATION_URL="";
const TRUSTED_DOMAINS=new Set(["ko-fi.com","www.ko-fi.com","buymeacoffee.com","www.buymeacoffee.com"]);
export function verifiedSupportUrl(raw){
  if(typeof raw!=="string"||!raw.trim())return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||url.username||url.password||!TRUSTED_DOMAINS.has(url.hostname))return null;
    if(url.pathname==="/"||!url.pathname.slice(1).trim())return null;
    url.search="";
    url.hash="";
    return url.toString();
  }catch{return null}
}
