import type { NormalizedJob } from "./types.js";

export interface GlobalFilterOptions {
  techOnly: boolean;
  remoteOnly: boolean;
  targetKeywords: string[];
}

export interface FilterResult {
  pass: boolean;
  reason?: "non-tech" | "non-remote";
}

// Filtro global aplicado a TODAS as fontes apos a normalizacao.
// techOnly: a vaga deve ter ao menos uma tecnologia detectada OU uma palavra-chave
//          de tech no titulo.
// remoteOnly: o modelo de trabalho deve ser REMOTO (exclui presencial/hibrido).
export function evaluateGlobalFilter(job: NormalizedJob, opts: GlobalFilterOptions): FilterResult {
  const isTech =
    !opts.techOnly ||
    job.technologies.length > 0 ||
    opts.targetKeywords.some((k) => job.title.toLowerCase().includes(k.toLowerCase()));
  if (!isTech) return { pass: false, reason: "non-tech" };

  const isRemote = !opts.remoteOnly || job.workModel === "REMOTE";
  if (!isRemote) return { pass: false, reason: "non-remote" };

  return { pass: true };
}
