import type { RawJob } from "../jobs/normalize.js";
import type { SourceAdapter } from "./types.js";
import { logger } from "../shared/logger.js";

// Coletor dedicado do Programathor (portal BR de vagas de tecnologia).
// O HTML e server-rendered: cada vaga e um <a href="/jobs/<id>-<slug>">
// que envolve o card com titulo (<h3>), empresa (alt da img), local/
// senioridade/contrato (spans) e tags de tecnologia. Segue a paginacao.
const BASE = "https://programathor.com.br";

function decodeEntities(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ccedil;/g, "ç")
    .replace(/&atilde;/g, "ã").replace(/&otilde;/g, "õ").replace(/&ntilde;/g, "ñ")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCard(path: string, inner: string): RawJob | null {
  const idM = path.match(/\/jobs\/(\d+)-/);
  const externalId = idM && idM[1] ? idM[1] : path;
  const url = BASE + path;

  const titleM = inner.match(/<h3[^>]*>([^<]+)<\/h3>/i);
  const title = titleM ? decodeEntities(titleM[1]) : "";
  if (!title) return null;

  let location = "";
  let seniority = "";
  let contract = "";
  let company = "Desconhecida";
  const iconSpans = inner.matchAll(/<i class='[^']*fa-(?:map-marker-alt|chart-bar|file-alt|briefcase)[^']*'><\/i>([^<]+)</gi);
  for (const m of iconSpans) {
    const icon = m[0];
    const val = decodeEntities(m[1]);
    if (icon.includes("map-marker-alt")) location = val;
    else if (icon.includes("chart-bar")) seniority = val;
    else if (icon.includes("file-alt")) contract = val;
    else if (icon.includes("briefcase")) company = val; // nome canônico da empresa
  }

  // Fallback: nome da empresa também vem no alt do logo (quando presente).
  if (!company || company === "Desconhecida") {
    const imgM = inner.match(/<img[^>]*alt="([^"]+)"/i);
    if (imgM) company = decodeEntities(imgM[1]);
  }

  const tags = [...inner.matchAll(/<span class='tag-list background-gray'>([^<]+)<\/span>/gi)]
    .map((m) => decodeEntities(m[1]))
    .filter(Boolean);

  const description = [title, seniority, contract, location, ...tags].join(". ");

  return {
    source: "programathor",
    externalId,
    url,
    company,
    title,
    description,
    location,
    employmentType: contract || null,
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    publishedAt: null,
  };
}

export class ProgramathorSource implements SourceAdapter {
  readonly id = "programathor";
  readonly name = "Programathor";
  readonly enabled = true;
  note = "Coletor HTML dedicado do Programathor (BR) com paginacao.";

  async collect(): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const seen = new Set<string>();
    const maxPages = 5;

    for (let page = 1; page <= maxPages; page++) {
      const url = `${BASE}/jobs${page > 1 ? `?page=${page}` : ""}`;
      logger.info(`[programathor] buscando ${url}`);
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JobHunterBot/1.0)" },
      });
      if (!res.ok) {
        logger.warn(`[programathor] HTTP ${res.status} na pagina ${page}`);
        break;
      }
      const html = await res.text();
      const cardRe = /<a href="(\/jobs\/\d+-[^"]+)">([\s\S]*?)<\/a>/gi;
      let matches = 0;
      let newOnes = 0;
      let m: RegExpExecArray | null;
      while ((m = cardRe.exec(html)) !== null) {
        matches++;
        const job = parseCard(m[1] ?? "", m[2] ?? "");
        if (!job) continue;
        if (seen.has(job.externalId)) continue;
        seen.add(job.externalId);
        jobs.push(job);
        newOnes++;
      }
      if (matches === 0 || newOnes === 0) break;
    }

    logger.info(`[programathor] ${jobs.length} vagas extraidas`);
    return jobs;
  }
}
