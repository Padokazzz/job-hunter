export type WorkModel = "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
export type Seniority = "JUNIOR" | "JUNIOR_PLENO" | "PLENO" | "SENIOR" | "UNKNOWN";
export type English = "NONE" | "TECHNICAL" | "INTERMEDIATE" | "ADVANCED" | "UNKNOWN";

export interface NormalizedJob {
  source: string;
  externalId: string;
  url: string;
  company: string;
  title: string;
  description: string;
  location: string;
  workModel: WorkModel;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  technologies: string[];
  seniority: Seniority;
  english: English;
  publishedAt: Date | null;
}

export type Classification =
  | "PRIORITARY" // 85-100
  | "GOOD" // 70-84
  | "SECONDARY" // 55-69
  | "LOW" // 40-54
  | "DISCARD"; // 0-39

// Fluxo explicito de status da vaga (doc Fase 2).
export type JobStatus =
  | "NEW"
  | "REVIEWING"
  | "APPROVED"
  | "APPLICATION_READY"
  | "APPLIED"
  | "INTERVIEW"
  | "REJECTED"
  | "CLOSED";

export interface ScoreBreakdownItem {
  category: string;
  points: number;
  maxPoints: number;
  detail?: string;
}

export interface ScoreResult {
  score: number;
  classification: Classification;
  reasons: string[];
  concerns: string[];
  breakdown: ScoreBreakdownItem[];
}
