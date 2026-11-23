// Optional Cloudflare Worker; deploy this on your own workers.dev domain.
// This forwards only approved PWS endpoints; it does not remove the API-key requirement.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept'
};
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';
    if (!/^\/v2\/pws\/(observations|dailysummary|history)\/|^\/v3\/location\/near$/.test(path))
      return new Response('Unsupported PWS endpoint', { status: 400, headers: cors });
    url.searchParams.delete('path');
    if (!url.searchParams.get('apiKey')) return new Response('Missing API key', { status: 401, headers: cors });
    const upstream = new URL('https://api.weather.com' + path);
    upstream.search = url.searchParams.toString();
    try {
      const response = await fetch(upstream, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 0 } });
      return new Response(response.body, { status: response.status, headers: { ...cors, 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ error: 'Upstream unavailable' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }
};
