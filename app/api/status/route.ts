const SOURCE_URL = "https://apim-proximotrem-prd-brazilsouth-001.azure-api.net/api/v1/lines";

export async function GET() {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: { Accept: "application/json", "User-Agent": "Status-Trilhos-SP/1.0" },
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json({ error: "Fonte indisponível", upstreamStatus: response.status }, { status: 502 });
    }

    const payload = await response.json();
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return Response.json({ error: "Não foi possível consultar a fonte pública." }, { status: 502 });
  }
}
