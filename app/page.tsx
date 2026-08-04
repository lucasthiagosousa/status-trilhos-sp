"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const CACHE_KEY = "status-trilhos-sp:last-valid-response";
const REFRESH_INTERVAL = 60_000;

type Filter = "all" | "normal" | "problem";
type Severity = "normal" | "warning" | "critical" | "single" | "unknown";
type AnyRecord = Record<string, unknown>;

type RailLine = {
  key: string;
  code: string;
  line: string;
  name: string;
  operator: string;
  statusCode: string;
  statusLabel: string;
  description: string;
  updatedAt: string;
  severity: Severity;
};

const API_SOURCE =
  "https://apim-proximotrem-prd-brazilsouth-001.azure-api.net/api/v1/lines";

function getValue(record: AnyRecord, ...names: string[]) {
  const entries = Object.entries(record);
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (found && found[1] !== null && found[1] !== undefined) return String(found[1]);
  }
  return "";
}

function extractArray(payload: unknown): AnyRecord[] {
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === "object") as AnyRecord[];
  if (!payload || typeof payload !== "object") return [];
  const root = payload as AnyRecord;
  for (const key of ["Data", "data", "lines"]) {
    if (Array.isArray(root[key])) {
      return (root[key] as unknown[]).filter((item) => item && typeof item === "object") as AnyRecord[];
    }
  }
  return [];
}

function classifyStatus(statusCode: string, statusLabel: string, description: string): Severity {
  const value = `${statusCode} ${statusLabel} ${description}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/via unica|single track/.test(value)) return "single";
  if (/interromp|paralisa|suspens|sem circula|fora de operacao|encerrad|inoperante|blocked|stopped/.test(value)) return "critical";
  if (/atencao|velocidade reduzida|operacao parcial|lentidao|restric|alterada|degradada|warning|reduced/.test(value)) return "warning";
  if (/normal|regular|operacao plena|sem ocorrencia|operando normalmente/.test(value)) return "normal";
  return "unknown";
}

function normalizeLines(payload: unknown): RailLine[] {
  return extractArray(payload).map((item, index) => {
    const code = getValue(item, "Code");
    const line = getValue(item, "Line");
    const name = getValue(item, "Name") || line || code || "Linha sem identificação";
    const statusCode = getValue(item, "StatusCode");
    const statusLabel = getValue(item, "StatusLabel", "Status") || "Status não informado";
    const description = getValue(item, "Description") || "Nenhuma descrição informada pela fonte.";
    const operator = getValue(item, "Operator") || "Operadora não informada";
    const updatedAt = getValue(item, "UpdatedAt");

    return {
      key: `${code}-${line}-${name}-${index}`,
      code,
      line,
      name,
      operator,
      statusCode,
      statusLabel,
      description,
      updatedAt,
      severity: classifyStatus(statusCode, statusLabel, description),
    };
  });
}

function formatDate(value: string | number | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function severityCopy(severity: Severity) {
  return {
    normal: { label: "Operação normal", icon: "✓" },
    warning: { label: "Atenção", icon: "!" },
    critical: { label: "Interrupção", icon: "×" },
    single: { label: "Via única", icon: "↔" },
    unknown: { label: "Não classificado", icon: "?" },
  }[severity];
}

function formatLineTitle(number: string, name: string) {
  if (!number) return name;
  const normalizedName = name.toLocaleLowerCase("pt-BR");
  const normalizedNumber = number.toLocaleLowerCase("pt-BR");
  if (normalizedName.includes(normalizedNumber)) return name;
  return `${number} — ${name}`;
}

export default function Home() {
  const [raw, setRaw] = useState<unknown>(null);
  const [lastSuccess, setLastSuccess] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingCache, setUsingCache] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(60);

  const loadStatus = useCallback(async (manual = false) => {
    setLoading(true);
    if (manual) setSecondsLeft(60);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const lines = extractArray(payload);
      if (!lines.length) throw new Error("A fonte não retornou uma lista de linhas reconhecível.");

      const timestamp = Date.now();
      setRaw(payload);
      setLastSuccess(timestamp);
      setUsingCache(false);
      setError("");
      localStorage.setItem(CACHE_KEY, JSON.stringify({ payload, timestamp }));
    } catch {
      setError("Não foi possível consultar a fonte agora.");
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (cached?.payload && cached?.timestamp) {
          setRaw(cached.payload);
          setLastSuccess(cached.timestamp);
          setUsingCache(true);
        }
      } catch {
        localStorage.removeItem(CACHE_KEY);
      }
    } finally {
      setLoading(false);
      setSecondsLeft(60);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadStatus(), 0);
    const refresh = window.setInterval(() => loadStatus(), REFRESH_INTERVAL);
    const countdown = window.setInterval(() => setSecondsLeft((value) => (value <= 1 ? 60 : value - 1)), 1000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refresh);
      window.clearInterval(countdown);
    };
  }, [loadStatus]);

  const lines = useMemo(() => normalizeLines(raw), [raw]);
  const normalCount = lines.filter((item) => item.severity === "normal").length;
  const problemCount = lines.length - normalCount;
  const visibleLines = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return lines.filter((item) => {
      const filterMatch = filter === "all" || (filter === "normal" ? item.severity === "normal" : item.severity !== "normal");
      const searchMatch = !term || `${item.code} ${item.line} ${item.name}`.toLocaleLowerCase("pt-BR").includes(term);
      return filterMatch && searchMatch;
    });
  }, [filter, lines, query]);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Status Trilhos SP — início">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>Status Trilhos</strong><em>SP</em></span>
        </a>
        <div className="system-state"><span className={error ? "signal signal-error" : "signal"} />{error ? "Fonte instável" : "Monitoramento ativo"}</div>
      </header>

      <div className="shell" id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">PAINEL OPERACIONAL • SÃO PAULO</p>
            <h1>Status da rede</h1>
            <p className="hero-copy">Condições operacionais das linhas de metrô e trem retornadas pela fonte pública.</p>
          </div>
          <button className="refresh-button" onClick={() => loadStatus(true)} disabled={loading}>
            <span className={loading ? "refresh-icon spinning" : "refresh-icon"}>↻</span>
            {loading ? "Consultando…" : "Atualizar agora"}
          </button>
        </section>

        <section className="status-strip" aria-live="polite">
          <div className="query-info">
            <span className={`pulse ${error ? "pulse-error" : ""}`} />
            <div><small>ÚLTIMA CONSULTA VÁLIDA</small><strong>{formatDate(lastSuccess)}</strong></div>
          </div>
          <div className="auto-refresh"><small>PRÓXIMA ATUALIZAÇÃO</small><strong>{secondsLeft}s</strong></div>
          <div className={`data-badge ${usingCache ? "stale" : ""}`}>{usingCache ? "DADOS DESATUALIZADOS" : error ? "SEM DADOS" : "DADOS ATUAIS"}</div>
        </section>

        {error && (
          <section className="notice notice-error" role="alert">
            <span>!</span><div><strong>API temporariamente indisponível</strong><p>{usingCache ? "Exibindo a última resposta válida salva neste navegador." : "Não há uma resposta válida salva neste navegador para exibir."}</p></div>
          </section>
        )}

        {!loading && !error && lines.length > 0 && problemCount === 0 && (
          <section className="notice notice-success"><span>✓</span><div><strong>Todas as linhas retornadas estão normais</strong><p>Nenhuma ocorrência foi identificada na última resposta da fonte.</p></div></section>
        )}

        <section className="metrics" aria-label="Resumo operacional">
          <article><div><small>LINHAS MONITORADAS</small><strong>{lines.length}</strong></div><span className="metric-icon">⌁</span></article>
          <article className="metric-normal"><div><small>OPERAÇÃO NORMAL</small><strong>{normalCount}</strong></div><span className="metric-icon">✓</span></article>
          <article className="metric-problem"><div><small>COM FALHAS</small><strong>{problemCount}</strong></div><span className="metric-icon">!</span></article>
        </section>

        <section className="controls">
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar linha por nome ou número..." aria-label="Buscar linha" />{query && <button onClick={() => setQuery("")} aria-label="Limpar pesquisa">×</button>}</label>
          <div className="filters" role="group" aria-label="Filtrar linhas">
            {([['all', 'Todas'], ['normal', 'Normais'], ['problem', 'Com problemas']] as [Filter, string][]).map(([value, label]) => (
              <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </section>

        <div className="section-heading"><div><p className="eyebrow">STATUS POR LINHA</p><h2>Visão operacional</h2></div><span>{visibleLines.length} {visibleLines.length === 1 ? "resultado" : "resultados"}</span></div>

        {loading && !lines.length ? (
          <section className="loading-grid" aria-label="Carregando linhas">{[1,2,3,4].map((n) => <div key={n} className="skeleton" />)}</section>
        ) : visibleLines.length ? (
          <section className="cards">
            {visibleLines.map((item) => {
              const copy = severityCopy(item.severity);
              const number = item.code || item.line;
              const lineTitle = formatLineTitle(number, item.name);
              return (
                <article className={`line-card ${item.severity}`} key={item.key}>
                  <div className="card-top"><div className="line-identity"><span className="line-number">{number || "—"}</span><div><small>LINHA E DENOMINAÇÃO</small><h3>{lineTitle}</h3></div></div><span className="severity-icon">{copy.icon}</span></div>
                  <div className="status-row"><span className="status-dot" /><strong>{item.statusLabel}</strong>{item.statusCode && <code>{item.statusCode}</code>}</div>
                  <p className="description">{item.description}</p>
                  <div className="card-footer"><span><small>OPERADORA</small><strong>{item.operator}</strong></span>{item.updatedAt && <span className="line-time"><small>ATUALIZADO</small><strong>{formatDate(item.updatedAt)}</strong></span>}</div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="empty"><span>⌕</span><h3>Nenhuma linha encontrada</h3><p>Ajuste a pesquisa ou selecione outro filtro.</p></section>
        )}

        {raw !== null && (
          <details className="raw-data"><summary><span><b>{ }</b> JSON bruto da última consulta</span><i>⌄</i></summary><pre>{JSON.stringify(raw, null, 2)}</pre></details>
        )}
      </div>

      <footer><p>Este painel depende da disponibilidade e da cobertura da fonte consultada. Confirme informações importantes nos canais oficiais das operadoras.</p><a href={API_SOURCE} target="_blank" rel="noreferrer">Fonte de dados ↗</a></footer>
    </main>
  );
}
