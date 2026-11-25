import type { NormalizedJob, ScoreResult, Classification, ScoreBreakdownItem } from "../jobs/types.js";
import type { CandidateProfile } from "../config/candidate.js";
import { technologiesOf, type ResumeRankingProfile } from "./resume-match.js";

function classify(score: number): Classification {
  if (score >= 85) return "PRIORITARY";
  if (score >= 70) return "GOOD";
  if (score >= 55) return "SECONDARY";
  if (score >= 40) return "LOW";
  return "DISCARD";
}

export async function scoreJob(job: NormalizedJob, candidate: CandidateProfile, resume: ResumeRankingProfile | null = null): Promise<ScoreResult> {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const breakdown: ScoreBreakdownItem[] = [];
  let score = 0;

  const jobTechnologies = [...technologiesOf(job.technologies)];
  const resumeTechnologies = technologiesOf(resume?.technologies ?? []);
  const matchedTechs = jobTechnologies.filter((tech) => resumeTechnologies.has(tech));
  const matchRatio = jobTechnologies.length ? matchedTechs.length / jobTechnologies.length : 0;

  // --- Stack ---
  let stack = 0;
  const matchedStack: string[] = [];
  for (const tech of jobTechnologies) {
    const pts = resume ? 0 : candidate.stackPoints[tech];
    if (pts) {
      stack += pts;
      matchedStack.push(`${tech}(+${pts})`);
    }
  }
  const stackMax = resume ? 70 : 40;
  stack = resume ? Math.round(stackMax * matchRatio) : Math.min(stackMax, stack);
  score += stack;
  if (resume) {
    const detail = jobTechnologies.length
      ? `${matchedTechs.length}/${jobTechnologies.length} tecnologias da vaga presentes no PDF`
      : "Nenhuma tecnologia identificada na vaga";
    reasons.push(detail + (matchedTechs.length ? `: ${matchedTechs.join(", ")}` : ""));
    breakdown.push({ category: "resumeMatch", points: stack, maxPoints: stackMax, detail: reasons[0] });
  } else {
    if (matchedStack.length) reasons.push(`Stack aderente: ${matchedStack.join(", ")}`);
    breakdown.push({ category: "stack", points: stack, maxPoints: stackMax, detail: matchedStack.join(", ") || "nenhuma tech aderente" });
  }

  const lowOnly = !resume && jobTechnologies.length > 0 && jobTechnologies.every((t) => candidate.lowPriorityTechs.includes(t));
  if (lowOnly) concerns.push("Tecnologias centrais fora do perfil (baixa prioridade)");
  else if (!resume && jobTechnologies.some((t) => candidate.lowPriorityTechs.includes(t))) {
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
    const years = resume?.experienceYears ?? 0;
    const jobTechCount = jobTechnologies.length;

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

  const resumeLevels: Record<string, string[]> = {
    estagiario: ["JUNIOR"], junior: ["JUNIOR", "JUNIOR_PLENO"],
    pleno: ["PLENO", "JUNIOR_PLENO"], senior: ["SENIOR"],
  };
  if (resume?.experienceLevel && job.seniority !== "UNKNOWN") {
    const compatible = resumeLevels[resume.experienceLevel]?.includes(job.seniority);
    senPts = compatible ? 15 : Math.min(senPts, 5);
    seniorityNote = compatible ? "Senioridade compatível com o currículo" : "Senioridade diferente da identificada no currículo";
  }
  score += senPts;
  if (seniorityNote) reasons.push(seniorityNote);
  breakdown.push({ category: "seniority", points: senPts, maxPoints: 15, detail: job.seniority });

  // "3+ anos para vaga junior"
  if ((job.seniority === "JUNIOR" || job.seniority === "JUNIOR_PLENO") && /\b(3|4|5|6|7|8|9|10)\+?\s*anos?\b/i.test(job.description)) {
    score -= 5;
    breakdown.push({ category: "experiencePenalty", points: -5, maxPoints: 0, detail: "Exige 3+ anos para vaga júnior" });
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

  if (resume) {
    for (const factor of breakdown.slice(1)) {
      const maxPoints = factor.category === "workModel" || factor.category === "seniority"
        ? Math.ceil(factor.maxPoints / 2)
        : Math.floor(factor.maxPoints / 2);
      factor.points = Math.round(factor.maxPoints ? factor.points * maxPoints / factor.maxPoints : factor.points / 2);
      factor.maxPoints = maxPoints;
    }
    score = breakdown.reduce((total, factor) => total + factor.points, 0);
    for (const [index, reason] of reasons.entries()) reasons[index] = reason.replace(/ \(\+\d+\)/g, "");
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
