import { prisma } from "../shared/db.js";

export interface ResumeMatchResult {
  technologies: string[];
  experienceYears: number | null;
  experienceLevel: string | null;
  areas: string[];
  bonusPoints: number;
  matchDetails: string[];
  matchRatio: number; // 0-1: proporção de tecnologias da vaga que o candidato domina
  matchedTechs: string[]; // tecnologias da vaga que o candidato domina
}

let cachedResume: {
  technologies: string[];
  experienceYears: number | null;
  experienceLevel: string | null;
  areas: string[];
} | null = null;

let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getActiveResume() {
  const now = Date.now();
  if (cachedResume && now - cacheTimestamp < CACHE_TTL) {
    return cachedResume;
  }

  try {
    const resume = await prisma.resume.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!resume) {
      cachedResume = null;
      return null;
    }

    const technologies = JSON.parse(resume.technologies || "[]");
    const experience = resume.experience ? JSON.parse(resume.experience) : {};

    cachedResume = {
      technologies,
      experienceYears: experience.years ?? null,
      experienceLevel: experience.level ?? null,
      areas: experience.areas || [],
    };
    cacheTimestamp = now;

    return cachedResume;
  } catch (error) {
    console.error("[resume-match] Error fetching active resume:", error);
    return null;
  }
}

export async function calculateResumeBonus(jobTechnologies: string[]): Promise<ResumeMatchResult> {
  const resume = await getActiveResume();

  if (!resume) {
    return {
      technologies: [],
      experienceYears: null,
      experienceLevel: null,
      areas: [],
      bonusPoints: 0,
      matchDetails: [],
      matchRatio: 0,
      matchedTechs: [],
    };
  }

  const matchDetails: string[] = [];
  let bonusPoints = 0;

  // Bonus for matching technologies (up to 15 points)
  const matchedTechs: string[] = [];
  const jobTechsLower = jobTechnologies.map((t) => t.toLowerCase());

  for (const resumeTech of resume.technologies) {
    const resumeTechLower = resumeTech.toLowerCase();
    for (const jobTech of jobTechsLower) {
      if (jobTech.includes(resumeTechLower) || resumeTechLower.includes(jobTech)) {
        matchedTechs.push(resumeTech);
        break;
      }
    }
  }

  // Calcular proporção de match
  const matchRatio = jobTechnologies.length > 0 ? matchedTechs.length / jobTechnologies.length : 0;

  if (matchedTechs.length > 0) {
    const techBonus = Math.min(15, matchedTechs.length * 3);
    bonusPoints += techBonus;
    matchDetails.push(`Tecnologias do currículo encontradas: ${matchedTechs.join(", ")} (+${techBonus})`);
  }

  // Bonus for experience level match (up to 5 points)
  if (resume.experienceLevel) {
    const levelMap: Record<string, string[]> = {
      junior: ["JUNIOR", "JUNIOR_PLENO"],
      pleno: ["PLENO", "JUNIOR_PLENO"],
      senior: ["SENIOR"],
      estagiario: ["JUNIOR"],
    };

    const resumeLevels = levelMap[resume.experienceLevel] || [];
    if (resumeLevels.length > 0) {
      bonusPoints += 3;
      matchDetails.push(`Nível de experiência compatível: ${resume.experienceLevel} (+3)`);
    }
  }

  // Bonus for relevant areas (up to 5 points)
  if (resume.areas.length > 0) {
    const relevantAreas = resume.areas.filter((area) =>
      jobTechnologies.some(
        (tech) =>
          (area === "frontend" && ["react", "vue", "angular", "html", "css", "next.js"].some((t) => tech.toLowerCase().includes(t))) ||
          (area === "backend" && ["node.js", "python", "java", "php", "ruby", "go"].some((t) => tech.toLowerCase().includes(t))) ||
          (area === "fullstack" && true) ||
          (area === "mobile" && ["flutter", "react native", "swift", "kotlin"].some((t) => tech.toLowerCase().includes(t))) ||
          (area === "devops" && ["docker", "kubernetes", "aws", "azure", "gcp"].some((t) => tech.toLowerCase().includes(t)))
      )
    );

    if (relevantAreas.length > 0) {
      bonusPoints += 3;
      matchDetails.push(`Áreas de atuação relevantes: ${relevantAreas.join(", ")} (+3)`);
    }
  }

  // Cap bonus at 20 points
  bonusPoints = Math.min(20, bonusPoints);

  return {
    technologies: resume.technologies,
    experienceYears: resume.experienceYears,
    experienceLevel: resume.experienceLevel,
    areas: resume.areas,
    bonusPoints,
    matchDetails,
    matchRatio,
    matchedTechs,
  };
}

export function invalidateResumeCache() {
  cachedResume = null;
  cacheTimestamp = 0;
}