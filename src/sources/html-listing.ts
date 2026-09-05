import type { RawJob } from "../jobs/normalize.js";
import type { SourceAdapter } from "./types.js";
import { logger } from "../shared/logger.js";

// Ajuda a coletar de sites que expoem vagas em HTML estatico (sem SPA/JS).
// E best-effort: se a estrutura nao bater, retorna [] (nunca inventa dados).
// Fontes que exigem JS/autenticacao devem ser tratadas em adaptadores proprios.
export interface HtmlListingConfig {
  url: string;
  // Regex global com grupos nomeados: title, company?, path?, description?
  itemRegex: RegExp;
  baseUrl: string;
}

export function collectFromHtml(cfg: HtmlListingConfig, sourceId: string): Promise<RawJob[]> {
  return (async () => {
    logger.info(`[${sourceId}] buscando ${cfg.url}`);
    const res = await fetch(cfg.url, {
      headers: { "User-Agent": "job-hunter-bot/0.1 (+https://github.com/local)" },
    });
    if (!res.ok) {
      logger.warn(`[${sourceId}] HTTP ${res.status} - fonte indisponivel`);
      return [];
    }
    const html = await res.text();
    const jobs: RawJob[] = [];
    const re = new RegExp(cfg.itemRegex.source, cfg.itemRegex.flags.includes("g") ? cfg.itemRegex.flags : cfg.itemRegex.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const title = m.groups?.["title"]?.trim();
      if (!title) continue;
      const company = m.groups?.["company"]?.trim() || "Desconhecida";
      const path = m.groups?.["path"]?.trim();
      const url = path ? new URL(path, cfg.baseUrl).toString() : cfg.url;
      const description = m.groups?.["description"]?.trim() || "";
      jobs.push({
        source: sourceId,
        externalId: url,
        url,
        company,
        title,
        description,
        location: "",
        employmentType: null,
        salaryMin: null,
        salaryMax: null,
        currency: null,
        publishedAt: null,
      });
    }
    logger.info(`[${sourceId}] ${jobs.length} vagas extraidas`);
    return jobs;
  })().catch((err) => {
    logger.warn(`[${sourceId}] falha na coleta: ${(err as Error).message}`);
    return [];
  });
}
