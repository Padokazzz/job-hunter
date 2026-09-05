import type { NormalizedJob, ScoreResult } from "../jobs/types.js";

export interface PrepareDecision {
  auto: boolean;
  reasons: string[];
}

// Modo 2 (doc sec. 15): preparar automaticamente vagas com score alto e sem
// sinais de risco. NUNCA envia — apenas prepara. O envio e sempre humano.
export function evaluateAutoPrepare(job: NormalizedJob, result: ScoreResult): PrepareDecision {
  const reasons: string[] = [];

  if (result.score < 85) {
    reasons.push(`Score ${result.score} < 85 (limiar do Modo 2)`);
    return { auto: false, reasons };
  }
  if (result.classification !== "PRIORITARY" && result.classification !== "GOOD") {
    reasons.push(`Classificacao ${result.classification} fora de PRIORITARY/GOOD`);
    return { auto: false, reasons };
  }
  if (job.english === "ADVANCED") {
    reasons.push("Ingles avancado obrigatorio — requer revisao humana");
    return { auto: false, reasons };
  }
  if (job.seniority === "SENIOR") {
    reasons.push("Vaga sênior — fora do perfil júnior");
    return { auto: false, reasons };
  }
  const riskyKeywords = ["teste t", "teste tecnico", "desafio", "captcha", "anti-bot", "avançado", "obrigat", "3+ anos", "red flag"];
  const risky = result.concerns.some((c) => riskyKeywords.some((k) => c.toLowerCase().includes(k)));
  if (risky) {
    reasons.push("Contém sinais de risco (teste técnico / CAPTCHA / exigência pesada)");
    return { auto: false, reasons };
  }

  reasons.push(`Score ${result.score} >= 85, aderente e sem sinais de risco -> preparar automaticamente (Modo 2)`);
  return { auto: true, reasons };
}
