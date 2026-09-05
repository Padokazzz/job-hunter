import type { RawJob } from "../jobs/normalize.js";
import type { SourceAdapter } from "./types.js";
import { callGupyTool } from "../mcp/gupy-mcp-client.js";
import { logger } from "../shared/logger.js";

// Gupy via MCP oficial (candidatos): https://candidates.mcp.api.gupy.io/mcp
// Le dados PUBLICOS de vagas (sem login, sem scraping, conforme ToS do MCP).
// Busca vagas de tech + remotas atraves de search_jobs com isRemote=true.
const QUERIES = [
  "desenvolvedor",
  "programador",
  "engenheiro de software",
  "backend",
  "frontend",
  "fullstack",
  "devops",
  "analista de dados",
  "mobile",
  "qa",
];

function mapType(t?: string): string | null {
  if (!t) return null;
  if (t.includes("internship")) return "ESTAGIO";
  if (t.includes("trainee")) return "TRAINEE";
  if (t.includes("temporary")) return "TEMPORARIO";
  if (t.includes("freelancer")) return "FREELANCER";
  if (t.includes("apprentice")) return "APRENDIZ";
  return null;
}

export function parseGupyJob(job: Record<string, any>): RawJob | null {
  if (!job || job.id == null || !job.name) return null;
  const id = String(job.id);
  const company = (job.careerPageName || "").toString().trim() || "Desconhecida";
  const city = job.city || "";
  const state = job.state || "";
  const country = job.country || "";
  const location = [city, state].filter(Boolean).join(", ") || country || "";
  const workplace = job.workplaceType || "";
  const meta = [location, workplace].filter(Boolean).join(". ");
  const description = [meta, job.description || ""].filter(Boolean).join(". ").trim();
  const url = job.jobUrl || `https://portal.gupy.io/vagas/${id}`;
  return {
    source: "gupy",
    externalId: id,
    url,
    company,
    title: job.name,
    description,
    location: location || undefined,
    employmentType: mapType(job.type),
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    publishedAt: job.publishedDate ? new Date(job.publishedDate) : null,
  };
}

export class GupySource implements SourceAdapter {
  readonly id = "gupy";
  readonly name = "Gupy (MCP)";
  readonly enabled = true;
  note = "Coleta via MCP oficial da Gupy (dados publicos, sem login).";

  async collect(): Promise<RawJob[]> {
    const results = new Map<string, RawJob>();
    const LIMIT = 100;
    const MAX_JOBS = 600;
    for (const term of QUERIES) {
      if (results.size >= MAX_JOBS) break;
      let offset = 0;
      for (let page = 0; page < 5; page++) {
        let data: Record<string, any>[] = [];
        try {
          const resp = (await callGupyTool("search_jobs", {
            term,
            isRemote: true,
            limit: LIMIT,
            offset,
            sortBy: "relevance",
          })) as { data?: { data?: Record<string, any>[] } } | null;
          data = resp?.data?.data || [];
        } catch (e) {
          logger.warn(`[gupy] erro na busca "${term}": ${(e as Error).message}`);
        }
        for (const job of data) {
          const parsed = parseGupyJob(job);
          if (parsed) results.set(parsed.externalId, parsed);
        }
        if (data.length < LIMIT) break;
        offset += LIMIT;
      }
    }
    const jobs = [...results.values()];
    logger.info(`[gupy] ${jobs.length} vagas extraidas (MCP)`);
    return jobs;
  }
}
