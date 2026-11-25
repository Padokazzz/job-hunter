import { readdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../shared/db.js";
import { parseResumeFromPDF } from "../shared/resume-parser.js";

export interface ResumeRankingProfile {
  technologies: string[];
  experienceYears: number | null;
  experienceLevel: string | null;
}

export async function getResumeRankingProfile(): Promise<ResumeRankingProfile | null> {
  const resume = await prisma.resume.findFirst({
    where: { isActive: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { technologies: true, experience: true },
  });
  if (resume) {
    const experience = JSON.parse(resume.experience || "{}");
    return {
      technologies: JSON.parse(resume.technologies || "[]"),
      experienceYears: experience.years ?? null,
      experienceLevel: experience.level ?? null,
    };
  }

  const directory = path.resolve("curriculo");
  const files = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const pdfs = files.filter((file) => file.isFile() && /\.pdf$/i.test(file.name));
  if (pdfs.length === 0) return null;
  if (pdfs.length > 1) throw new Error("Há mais de um PDF em curriculo/. Ative um currículo no painel.");
  const parsed = await parseResumeFromPDF(path.join(directory, pdfs[0]!.name));
  if (!parsed.textContent.trim() || !parsed.technologies.length) {
    throw new Error("O PDF base não contém tecnologias reconhecíveis no texto.");
  }
  return {
    technologies: parsed.technologies,
    experienceYears: parsed.experience.years,
    experienceLevel: parsed.experience.level,
  };
}

export function technologiesOf(values: string[]): Set<string> {
  return new Set(values.map((value) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "node") return "node.js";
    if (normalized === "cicd") return "ci/cd";
    return normalized;
  }).filter(Boolean));
}
