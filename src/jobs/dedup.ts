import type { NormalizedJob } from "./types.js";

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Chave de duplicidade conforme documento:
// hash(company + normalized_title + location)
export function dedupHash(job: Pick<NormalizedJob, "company" | "title" | "location">): string {
  const parts = [job.company, job.title, job.location].map((v) => normalizeText(v ?? ""));
  return parts.join("|");
}
