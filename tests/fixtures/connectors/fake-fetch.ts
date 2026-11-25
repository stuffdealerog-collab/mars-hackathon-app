/**
 * A fetch that answers from fixtures: routes are tried in order, a `once` route answers one time only. Every call
 * is recorded (url, method, headers, body) so tests can check what was sent. No network.
 */
export interface Route {
  match: RegExp | ((url: string, init: RequestInit) => boolean);
  status?: number;
  body: unknown;
  once?: boolean;
}

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export function fakeFetch(routes: Route[]) {
  const calls: Call[] = [];
  const used = new Set<Route>();
  const fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    calls.push({ url, method: (init.method ?? "GET").toUpperCase(), headers, body: typeof init.body === "string" ? init.body : null });
    const route = routes.find((r) => !(r.once && used.has(r)) && (typeof r.match === "function" ? r.match(url, init) : r.match.test(url)));
    if (!route) return new Response(JSON.stringify({ error: { message: `no fixture for ${url}` } }), { status: 599 });
    used.add(route);
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}
