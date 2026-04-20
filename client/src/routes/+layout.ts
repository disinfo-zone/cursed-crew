// Full SPA — the server serves the static bundle with an index.html fallback,
// and all data flows over WebSocket. No SSR, no prerender-time data fetching.
export const prerender = false;
export const ssr = false;
export const trailingSlash = 'never';
