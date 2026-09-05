import type { RawJob } from "../jobs/normalize.js";
import type { SourceAdapter } from "./types.js";
import { logger } from "../shared/logger.js";

// RemoteOK expoe uma API publica (sem autenticacao) de vagas remotas.
// Documentacao: https://remoteok.com/api
const API_URL = "https://remoteok.com/api";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export class RemoteOkSource implements SourceAdapter {
  readonly id = "remoteok";
  readonly name = "RemoteOK";
  readonly enabled = true;

  async collect(): Promise<RawJob[]> {
    logger.info(`[remoteok] buscando vagas em ${API_URL}`);
    const res = await fetch(API_URL, {
      headers: {
        // RemoteOK exige User-Agent, senao retorna 403.
        "User-Agent": "job-hunter-bot/0.1 (+https://github.com/local)",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      logger.error(`[remoteok] falha na requisicao: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = (await res.json()) as Array<Record<string, unknown>>;
    const limit = 200;
    const jobs: RawJob[] = [];

    for (const item of data) {
      const position = item["position"];
      if (typeof position !== "string") continue; // pula objeto de metadata

      const id = String(item["id"] ?? "");
      const slug = typeof item["slug"] === "string" ? (item["slug"] as string) : "";
      const company = typeof item["company"] === "string" ? (item["company"] as string) : "Desconhecida";
      const description = typeof item["description"] === "string" ? stripHtml(item["description"] as string) : "";
      const location = typeof item["location"] === "string" ? (item["location"] as string) : "Remote";
      const tags = Array.isArray(item["tags"]) ? (item["tags"] as string[]) : [];
      const date = typeof item["date"] === "number" ? new Date(item["date"] * 1000) : null;

      const salMin = typeof item["salary_min"] === "number" ? item["salary_min"] : null;
      const salMax = typeof item["salary_max"] === "number" ? item["salary_max"] : null;

      jobs.push({
        source: this.id,
        externalId: id,
        url: typeof item["url"] === "string" ? (item["url"] as string) : `https://remoteok.com/remote-jobs/${slug}`,
        company,
        title: position,
        description: `${tags.join(", ")}. ${description}`.trim(),
        location,
        workModel: "REMOTE",
        employmentType: null,
        salaryMin: salMin,
        salaryMax: salMax,
        currency: salMin || salMax ? "USD" : null,
        publishedAt: date,
      });

      if (jobs.length >= limit) break;
    }

    logger.info(`[remoteok] ${jobs.length} vagas coletadas`);
    return jobs;
  }
}
