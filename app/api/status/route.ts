const SOURCE_URL = "https://apim-proximotrem-prd-brazilsouth-001.azure-api.net/api/v1/lines";
const CACHE_SECONDS = 60;
const STALE_SECONDS = 300;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

type RateLimitEntry = { count: number; resetAt: number };

const rateLimitStore = new Map<string, RateLimitEntry>();

const publicCacheHeaders = {
  "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
  "X-Content-Type-Options": "nosniff",
};

function getClientIp(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("cf-connecting-ip");

  return forwarded?.split(",")[0]?.trim() || "";
}

function isRateLimited(request: Request) {
  const ip = getClientIp(request);
  if (!ip) return false;

  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;

  if (rateLimitStore.size > 1_000) {
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt <= now) rateLimitStore.delete(key);
    }
  }

  return current.count > RATE_LIMIT_MAX_REQUESTS;
}

export async function GET(request: Request) {
  if (isRateLimited(request)) {
    return Response.json(
      { error: "Muitas consultas em pouco tempo. Tente novamente em instantes." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "60",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  try {
    const response = await fetch(SOURCE_URL, {
      headers: { Accept: "application/json", "User-Agent": "Status-Trilhos-SP/1.0" },
      next: { revalidate: CACHE_SECONDS },
    });

    if (!response.ok) {
      return Response.json(
        { error: "Fonte indisponível", upstreamStatus: response.status },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const payload = await response.json();
    return Response.json(payload, { headers: publicCacheHeaders });
  } catch {
    return Response.json(
      { error: "Não foi possível consultar a fonte pública." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
