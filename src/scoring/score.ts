import type { NormalizedJob, ScoreResult, Classification, ScoreBreakdownItem } from "../jobs/types.js";
import type { CandidateProfile } from "../config/candidate.js";
import { calculateResumeBonus } from "./resume-match.js";

function classify(score: number): Classification {
  if (score >= 85) return "PRIORITARY";
  if (score >= 70) return "GOOD";
  if (score >= 55) return "SECONDARY";
  if (score >= 40) return "LOW";
  return "DISCARD";
}

export async function scoreJob(job: NormalizedJob, candidate: CandidateProfile): Promise<ScoreResult> {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const breakdown: ScoreBreakdownItem[] = [];
  let score = 0;

  // --- Stack (40) ---
  let stack = 0;
  const matchedStack: string[] = [];
  for (const tech of job.technologies) {
    const pts = candidate.stackPoints[tech];
    if (pts) {
      stack += pts;
      matchedStack.push(`${tech}(+${pts})`);
    }
  }
  const stackPenalty = 0; // base; ajustado abaixo se techs de baixa prioridade
  stack = Math.min(40, stack);
  score += stack;
  if (matchedStack.length) reasons.push(`Stack aderente: ${matchedStack.join(", ")}`);
  breakdown.push({ category: "stack", points: stack, maxPoints: 40, detail: matchedStack.join(", ") || "nenhuma tech aderente" });

  const lowOnly = job.technologies.length > 0 && job.technologies.every((t) => candidate.lowPriorityTechs.includes(t));
  if (lowOnly) {
    score -= 8;
    concerns.push("Tecnologias centrais fora do perfil (baixa prioridade)");
  } else if (job.technologies.some((t) => candidate.lowPriorityTechs.includes(t))) {
    concerns.push("Menciona tecnologia de baixa prioridade");
  }

  // --- Modelo de trabalho (15) ---
  const workPts = job.workModel === "REMOTE" ? 15 : job.workModel === "HYBRID" ? 8 : job.workModel === "ONSITE" ? 2 : 0;
  score += workPts;
  if (job.workModel === "REMOTE") reasons.push("Remoto (+15)");
  else if (job.workModel === "HYBRID") reasons.push("Híbrido (+8)");
  else if (job.workModel === "ONSITE") reasons.push("Presencial (+2)");
  else concerns.push("Modelo de trabalho não informado");
  breakdown.push({ category: "workModel", points: workPts, maxPoints: 15, detail: job.workModel });

  // --- Senioridade (15) ---
  // Lógica adaptativa: vagas SENIOR podem ser consideradas se o currículo
  // mostrar experiência e conhecimentos suficientes.
  let senPts = 0;
  let seniorityNote = "";

  if (job.seniority === "JUNIOR") {
    senPts = 15;
    seniorityNote = "Júnior (+15)";
  } else if (job.seniority === "JUNIOR_PLENO") {
    senPts = 12;
    seniorityNote = "Júnior/Pleno (+12)";
  } else if (job.seniority === "PLENO") {
    senPts = 7;
    seniorityNote = "Pleno (+7)";
  } else if (job.seniority === "SENIOR") {
    // Para vagas SENIOR: analisar se faz sentido baseado no currículo
    const resumeData = await calculateResumeBonus(job.technologies);
    const years = resumeData.experienceYears ?? 0;
    const matchedTechs = resumeData.technologies.filter((t) =>
      job.technologies.some((jt) => jt.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(jt.toLowerCase()))
    );
    const jobTechCount = job.technologies.length;
    const matchRatio = jobTechCount > 0 ? matchedTechs.length / jobTechCount : 0;

    // Vaga SENIOR faz sentido se:
    // 1. Candidato tem 2+ anos E domina pelo menos 50% das tecnologias
    // 2. Ou candidato tem 3+ anos (independente da stack)
    if (years >= 3) {
      senPts = 5; // Alguns pontos para 3+ anos
      seniorityNote = `Sênior — ${years} anos de experiência (+5)`;
    } else if (years >= 2 && matchRatio >= 0.5) {
      senPts = 3; // Poucos pontos mas possível
      seniorityNote = `Sênior — ${years} anos, ${matchedTechs.length}/${jobTechCount} techs conhecidas (+3)`;
    } else {
      senPts = 0;
      seniorityNote = "Sênior — experiência insuficiente para esta vaga";
      concerns.push(`Vaga sênior: ${years} anos de experiência, domina ${matchedTechs.length}/${jobTechCount} tecnologias`);
    }
  } else {
    senPts = 5;
    seniorityNote = "Senioridade não informada (+5 padrão)";
  }

  score += senPts;
  if (seniorityNote) reasons.push(seniorityNote);
  breakdown.push({ category: "seniority", points: senPts, maxPoints: 15, detail: job.seniority });

  // "3+ anos para vaga junior"
  if ((job.seniority === "JUNIOR" || job.seniority === "JUNIOR_PLENO") && /\b(3|4|5|6|7|8|9|10)\+?\s*anos?\b/i.test(job.description)) {
    score -= 5;
    concerns.push("Exige 3+ anos para vaga júnior");
  }

  // --- Experiência compatível (10) ---
  const expKeywords = [
    /\bprojeto/i, /\bapi(s)?\b/i, /\bfront[- ]?end\b/i, /\bback[- ]?end\b/i,
    /\bbanco de dados\b|\bdatabase\b/i, /\bgit\b/i, /\bprodu[çc][ãa]o\b|\bproduction\b/i,
    /\baplica[çc][ãa]o\b|\bapplication\b/i,
  ];
  const expMatches = expKeywords.filter((re) => re.test(job.description)).length;
  const expPts = Math.min(10, Math.round(expMatches * 1.5));
  score += expPts;
  if (expPts > 0) reasons.push(`Experiência compatível citada (+${expPts})`);
  breakdown.push({ category: "experience", points: expPts, maxPoints: 10, detail: `${expMatches} sinais` });

  // --- Localização (5) ---
  let locPts = 1;
  if (job.workModel === "REMOTE") locPts = 5;
  else if (candidate.preferredLocations.some((re) => re.test(job.location))) locPts = 4;
  score += locPts;
  if (locPts === 5) reasons.push("Localização remota (+5)");
  else if (locPts === 4) reasons.push(`Local aderente (${job.location}) (+4)`);
  breakdown.push({ category: "location", points: locPts, maxPoints: 5, detail: job.location });

  // --- Inglês (5) ---
  let engPts = 5;
  if (job.english === "NONE") engPts = 5;
  else if (job.english === "TECHNICAL") engPts = 4;
  else if (job.english === "INTERMEDIATE") engPts = 2;
  else if (job.english === "ADVANCED") { engPts = -5; concerns.push("Inglês avançado/fluente obrigatório — forte penalização"); }
  score += engPts;
  if (job.english === "NONE") reasons.push("Inglês não obrigatório (+5)");
  else if (job.english === "TECHNICAL") reasons.push("Inglês técnico/leitura (+4)");
  else if (job.english === "INTERMEDIATE") reasons.push("Inglês intermediário (+2)");
  breakdown.push({ category: "english", points: engPts, maxPoints: 5, detail: job.english });

  // --- Outros (10) ---
  let outros = 0;
  if (job.salaryMin != null || job.salaryMax != null) outros += 2;
  if (/\bbenef[íi]cios?\b|\bbenefits\b/i.test(job.description)) outros += 1;
  if (/\bcrescimento\b|\bgrowth\b|\bcarreira\b/i.test(job.description)) outros += 1;
  if (job.seniority === "JUNIOR" || job.seniority === "JUNIOR_PLENO") outros += 1;
  if (job.description.length > 300) outros += 1;
  if (job.technologies.some((t) => ["react", "next.js", "typescript", "docker", "aws"].includes(t))) outros += 2;
  outros = Math.min(10, outros);
  score += outros;
  if (outros > 0) reasons.push(`Outros fatores (+${outros})`);
  breakdown.push({ category: "others", points: outros, maxPoints: 10, detail: "" });

  // Penalizacao por stack de baixa prioridade (so se for o nucleo da vaga).
  if (lowOnly) {
    score -= 8;
    breakdown.push({ category: "lowPriorityPenalty", points: -8, maxPoints: 0, detail: "techs de baixa prioridade como nucleo" });
  }

  // Bonus do currículo (até 20 pontos)
  try {
    const resumeBonus = await calculateResumeBonus(job.technologies);
    if (resumeBonus.bonusPoints > 0) {
      score += resumeBonus.bonusPoints;
      reasons.push(...resumeBonus.matchDetails);
      breakdown.push({
        category: "resumeMatch",
        points: resumeBonus.bonusPoints,
        maxPoints: 20,
        detail: resumeBonus.matchDetails.join("; ") || "match com currículo",
      });
    }
  } catch (error) {
    // Se houver erro ao buscar currículo, não penaliza a vaga
    console.error("[score] Error calculating resume bonus:", error);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    classification: classify(score),
    reasons,
    concerns,
    breakdown,
  };
}
