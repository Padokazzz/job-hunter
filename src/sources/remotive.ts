import type { RawJob } from "../jobs/normalize.js";
import type { SourceAdapter } from "./types.js";
import { logger } from "../shared/logger.js";

// Remotive: API publica de vagas 100% remotas (remotive.com/api/remote-jobs).
// Sem auth. O filtro global tech+remoto e aplicado a posteriori.
const API = "https://remotive.com/api/remote-jobs";

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseRemotiveJob(j: Record<string, unknown>): RawJob | null {
  const title = typeof j.title === "string" ? j.title.trim() : "";
  const url = typeof j.url === "string" ? j.url : "";
  if (!title || !url) return null;
  const company = typeof j.company_name === "string" ? j.company_name.trim() : "Desconhecida";
  const location = typeof j.candidate_required_location === "string" ? j.candidate_required_location.trim() : undefined;
  const description = [j.candidate_required_location, j.salary, j.description]
    .filter((v): v is string => typeof v === "string")
    .map(stripHtml)
    .join(". ");
  return {
    source: "remotive",
    externalId: url,
    url,
    company,
    title,
    description,
    location,
    workModel: "REMOTE",
    employmentType: typeof j.job_type === "string" ? j.job_type : null,
    salaryMin: null,
    salaryMax: null,
    currency: "USD",
    publishedAt: null,
  };
}

export class RemotiveSource implements SourceAdapter {
  readonly id = "remotive";
  readonly name = "Remotive";
  readonly enabled = true;
  note = "API publica remotive.com (vagas remotas). Sem auth.";

  async collect(): Promise<RawJob[]> {
    try {
      const res = await fetch(API, { headers: { "User-Agent": "job-hunter/0.1" } });
      if (!res.ok) {
        logger.warn(`[remotive] HTTP ${res.status}`);
        return [];
      }
      const json = (await res.json()) as { jobs?: unknown[] };
      const jobs = (json.jobs ?? [])
        .map((x) => parseRemotiveJob(x as Record<string, unknown>))
        .filter((j): j is RawJob => j !== null);
      logger.info(`[remotive] ${jobs.length} vagas`);
      return jobs;
    } catch (e) {
      logger.error(`[remotive] erro: ${(e as Error).message}`);
      return [];
    }
  }
}
