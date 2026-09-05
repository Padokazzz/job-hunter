import type { NormalizedJob, ScoreResult } from "../jobs/types.js";

export interface ScoredJob {
  job: NormalizedJob;
  result: ScoreResult;
}

const CLASS_LABEL: Record<string, string> = {
  PRIORITARY: "Candidatura prioritaria",
  GOOD: "Boa oportunidade",
  SECONDARY: "Oportunidade secundaria",
  LOW: "Baixa prioridade",
  DISCARD: "Descartar",
};

export function buildReport(scored: ScoredJob[], date = new Date()): string {
  const total = scored.length;
  const afterFilters = scored.filter((s) => s.result.classification !== "DISCARD").length;
  const counts = {
    PRIORITARY: scored.filter((s) => s.result.classification === "PRIORITARY").length,
    GOOD: scored.filter((s) => s.result.classification === "GOOD").length,
    SECONDARY: scored.filter((s) => s.result.classification === "SECONDARY").length,
    LOW: scored.filter((s) => s.result.classification === "LOW").length,
    DISCARD: scored.filter((s) => s.result.classification === "DISCARD").length,
  };

  const top = [...scored].sort((a, b) => b.result.score - a.result.score).slice(0, 5);

  const lines: string[] = [];
  lines.push(`🤖 Relatorio de vagas - ${date.toLocaleDateString("pt-BR")}`);
  lines.push("");
  lines.push(`Vagas encontradas: ${total}`);
  lines.push(`Apos filtros: ${afterFilters}`);
  lines.push(`Alta aderencia: ${counts.PRIORITARY}`);
  lines.push(`Boa aderencia: ${counts.GOOD}`);
  lines.push(`Secundarias: ${counts.SECONDARY}`);
  lines.push(`Baixa prioridade: ${counts.LOW}`);
  lines.push(`Descartadas: ${counts.DISCARD}`);
  lines.push("");
  lines.push("🔥 TOP 5");
  lines.push("");
  top.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.job.title}`);
    lines.push(`   Empresa: ${s.job.company}`);
    lines.push(`   Stack: ${s.job.technologies.slice(0, 6).join(", ") || "n/a"}`);
    lines.push(`   Modelo: ${s.job.workModel} | Senioridade: ${s.job.seniority} | Ingles: ${s.job.english}`);
    lines.push(`   Score: ${s.result.score}/100 (${CLASS_LABEL[s.result.classification]})`);
    lines.push(`   ${s.job.url}`);
    if (s.result.concerns.length) lines.push(`   ⚠️  ${s.result.concerns.join("; ")}`);
    lines.push("");
  });

  return lines.join("\n");
}
