import type { RawJob } from "../jobs/normalize.js";
import type { SourceAdapter } from "./types.js";
import { logger } from "../shared/logger.js";
import { callMcpTool } from "../mcp/http-client.js";

// Indeed via MCP da Bright Data (dados PUBLICOS). O endpoint generico da Bright
// Data expoe ferramentas de scrape (scrape_as_markdown), nao uma ferramenta
// dedicada do Indeed. Entao raspamos a pagina de busca do Indeed (US) e
// extraimos os cards do markdown. O anti-bot fica por conta da Bright Data.
// OBR: br.indeed.com retorna vazio (bloqueado); usamos www.indeed.com.
// Requer BRIGHTDATA_API_TOKEN. Sem o token a fonte fica inativa.

const BD_URL = "https://mcp.brightdata.com/mcp";
const QUERIES = [
  "flutter",
  "desenvolvedor .net",
  "node js",
  "typescript",
  "react",
  "fullstack",
  "backend",
  "sql server",
  "aws",
];

// Mantido para o teste de parser legado.
interface IndeedStruct {
  title: string;
  href: string;
  company: string;
  location: string;
  description: string;
}
function resolveUrl(href: string): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  const m = href.match(/[?&]jk=([^&]+)/);
  if (m) return `https://br.indeed.com/jobs/view?jk=${m[1]}`;
  return "https://br.indeed.com" + href;
}
export function parseIndeedCard(c: IndeedStruct): RawJob | null {
  if (!c.title || !c.href) return null;
  const url = resolveUrl(c.href);
  const description = [c.location, c.description].filter(Boolean).join(". ").trim();
  return {
    source: "indeed",
    externalId: url,
    url,
    company: c.company || "Desconhecida",
    title: c.title,
    description,
    location: c.location || undefined,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    currency: "USD",
    publishedAt: null,
  };
}

function stripMd(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrap(md: string): string {
  const w = md.match(/BEGIN=====\n([\s\S]*?)\n=====UNTRUSTED/);
  return w?.[1] ?? md;
}

// Extrai vagas do markdown de uma pagina de busca do Indeed.
export function parseIndeedMarkdown(md: string): RawJob[] {
  // O markdown escapa '&' como '\&'; normalizamos para extrair o jk limpo.
  const body = unwrap(md).replace(/\\&/g, "&");
  const titleRe = /\[([^\]]+)\]\((\/rc\/clk\?jk=[^)]+|\/viewjob\?jk=[^)]+)\)/g;
  const titles: { title: string; jk: string; pos: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(body))) {
    const title = m[1];
    const jkUrl = m[2];
    if (!title || !jkUrl) continue;
    const jk = jkUrl.match(/jk=([^&]+)/)?.[1] ?? "";
    if (!jk) continue;
    titles.push({ title: title.trim(), jk, pos: m.index });
  }
  const footerRe = /View all \[([^\]]+) jobs in ([^\]]+)\]/g;
  const footers: { company: string; location: string; pos: number }[] = [];
  while ((m = footerRe.exec(body))) {
    const company = m[1];
    const location = m[2];
    if (!company || !location) continue;
    footers.push({ company: company.trim(), location: location.trim(), pos: m.index });
  }

  const jobs: RawJob[] = [];
  let fi = 0;
  for (const t of titles) {
    while (fi < footers.length) {
      const cand = footers[fi];
      if (cand && cand.pos > t.pos) break;
      fi++;
    }
    const f = footers[fi];
    const end = f ? f.pos : body.length;
    const chunk = stripMd(body.slice(t.pos, end)).replace(t.title, "").trim();
    const url = `https://www.indeed.com/viewjob?jk=${t.jk}`;
    // A busca e remotejob=remote, entao todas sao remotas.
    jobs.push({
      source: "indeed",
      externalId: url,
      url,
      company: f?.company || "Desconhecida",
      title: t.title,
      description: chunk,
      location: f?.location,
      workModel: "REMOTE",
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      currency: "USD",
      publishedAt: null,
    });
  }
  return jobs;
}

export class IndeedSource implements SourceAdapter {
  readonly id = "indeed";
  readonly name = "Indeed (Bright Data)";
  readonly enabled = true;
  note = "Indeed via MCP da Bright Data (scrape generico de pagina publica). Requer BRIGHTDATA_API_TOKEN.";

  async collect(): Promise<RawJob[]> {
    const token = process.env.BRIGHTDATA_API_TOKEN;
    if (!token) {
      logger.warn("[indeed] BRIGHTDATA_API_TOKEN ausente — fonte inativa.");
      return [];
    }
    const seen = new Set<string>();
    const jobs: RawJob[] = [];
    for (const q of QUERIES) {
      const target = `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}&remotejob=remote&sort=date`;
      let md: unknown;
      try {
        md = await callMcpTool({ url: BD_URL, token, tool: "scrape_as_markdown", args: { url: target } });
      } catch (e) {
        logger.error(`[indeed] erro na query "${q}": ${(e as Error).message}`);
        continue;
      }
      const text = typeof md === "string" ? md : JSON.stringify(md);
      if (process.env.INDEED_DEBUG) logger.info(`[indeed] amostra q="${q}": ${text.slice(0, 400)}`);
      for (const job of parseIndeedMarkdown(text)) {
        if (!job.url || seen.has(job.url)) continue;
        seen.add(job.url);
        jobs.push(job);
      }
    }
    logger.info(`[indeed] ${jobs.length} vagas (Bright Data scrape)`);
    return jobs;
  }
}
