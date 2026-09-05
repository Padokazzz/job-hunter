import "./shared/env.js";
import { prisma } from "./shared/db.js";
import { logger } from "./shared/logger.js";
import { candidate } from "./config/candidate.js";
import { normalize, type RawJob } from "./jobs/normalize.js";
import { dedupHash } from "./jobs/dedup.js";
import type { NormalizedJob, ScoreResult } from "./jobs/types.js";
import { evaluateGlobalFilter } from "./jobs/filter.js";
import { scoreJob } from "./scoring/score.js";
import { buildReport, type ScoredJob } from "./report/report.js";
import { getEnabledSources } from "./sources/index.js";
import { discoveryMCP } from "./mcp/index.js";
import { generateApplication } from "./applications/generate.js";
import { evaluateAutoPrepare } from "./applications/policy.js";

const RETRY_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number, sourceId: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      logger.warn(`[${sourceId}] tentativa ${i}/${attempts} falhou: ${(err as Error).message}`);
      if (i < attempts) await sleep(500 * i);
    }
  }
  throw lastErr;
}

async function ensureSources() {
  for (const s of getEnabledSources()) {
    await prisma.source.upsert({
      where: { id: s.id },
      create: { id: s.id, name: s.name, enabled: s.enabled, note: s.note ?? null },
      update: { name: s.name, enabled: s.enabled, note: s.note ?? null },
    });
  }
}

interface SourceStats {
  jobsFound: number;
  jobsNew: number;
  jobsRelevant: number;
  skippedNonTech: number;
  skippedNonRemote: number;
}

function isPrismaUniqueError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// Atualiza um Job existente (score/breakdown), preservando o status do usuario.
async function updateJobRecord(
  id: string,
  job: NormalizedJob,
  result: ScoreResult,
): Promise<void> {
  await prisma.scoreBreakdown.deleteMany({ where: { jobId: id } });
  await prisma.job.update({
    where: { id },
    data: {
      title: job.title,
      description: job.description,
      location: job.location,
      workModel: job.workModel,
      seniority: job.seniority,
      english: job.english,
      score: result.score,
      classification: result.classification,
      matchReasons: result.reasons.join(" | "),
      concerns: result.concerns.join(" | "),
      technologies: job.technologies.join(", "),
      updatedAt: new Date(),
    },
  });
  await prisma.scoreBreakdown.createMany({
    data: result.breakdown.map((b) => ({
      jobId: id,
      category: b.category,
      points: b.points,
      maxPoints: b.maxPoints,
      detail: b.detail ?? null,
    })),
  });
}

async function runSource(sourceId: string): Promise<SourceStats> {
  const source = getEnabledSources().find((s) => s.id === sourceId)!;
  const run = await prisma.collectionRun.create({
    data: { sourceId, status: "RUNNING", jobsFound: 0, jobsNew: 0, jobsRelevant: 0 },
  });

  const stats: SourceStats = { jobsFound: 0, jobsNew: 0, jobsRelevant: 0, skippedNonTech: 0, skippedNonRemote: 0 };

  try {
    const raw: RawJob[] = await withRetry(() => discoveryMCP.discover(sourceId), RETRY_ATTEMPTS, sourceId);
    stats.jobsFound = raw.length;

    for (const r of raw) {
      const job = normalize(r);

      // Filtro global (doc do usuario): so vagas TECH e REMOTAS, em TODAS as fontes.
      const fr = evaluateGlobalFilter(job, {
        techOnly: candidate.filters.techOnly,
        remoteOnly: candidate.filters.remoteOnly,
        targetKeywords: candidate.targetKeywords,
      });
      if (!fr.pass) {
        if (fr.reason === "non-remote") stats.skippedNonRemote++;
        else stats.skippedNonTech++;
        continue;
      }

      const hash = dedupHash(job);
      const result = await scoreJob(job, candidate);
      const relevant = result.classification !== "DISCARD" && result.classification !== "LOW";
      if (relevant) stats.jobsRelevant++;

      // Idempotencia pela chave estavel (sourceId, externalId); dedupHash tambem
      // e checado para detectar reposts com externalId diferente.
      const existing =
        (await prisma.job.findUnique({
          where: { sourceId_externalId: { sourceId: job.source, externalId: job.externalId } },
        })) ?? (await prisma.job.findUnique({ where: { dedupHash: hash } }));

      if (existing) {
        await updateJobRecord(existing.id, job, result);
        continue;
      }

      let created: { id: string } | null = null;
      try {
        created = await prisma.job.create({
          data: {
            sourceId: job.source,
            externalId: job.externalId,
            url: job.url,
            company: job.company,
            title: job.title,
            description: job.description,
            location: job.location,
            workModel: job.workModel,
            employmentType: job.employmentType,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            currency: job.currency,
            technologies: job.technologies.join(", "),
            seniority: job.seniority,
            english: job.english,
            publishedAt: job.publishedAt,
            dedupHash: hash,
            score: result.score,
            classification: result.classification,
            matchReasons: result.reasons.join(" | "),
            concerns: result.concerns.join(" | "),
            status: "NEW",
            breakdown: {
              create: result.breakdown.map((b) => ({
                category: b.category,
                points: b.points,
                maxPoints: b.maxPoints,
                detail: b.detail ?? null,
              })),
            },
          },
        });
      } catch (e) {
        if (isPrismaUniqueError(e)) {
          const ex =
            (await prisma.job.findUnique({
              where: { sourceId_externalId: { sourceId: job.source, externalId: job.externalId } },
            })) ?? (await prisma.job.findUnique({ where: { dedupHash: hash } }));
          if (ex) {
            await updateJobRecord(ex.id, job, result);
            continue;
          }
        }
        throw e;
      }
      stats.jobsNew++;

      // Modo 2 (doc sec. 15): preparar automaticamente vagas de alto score e
      // sem risco. NUNCA envia — o envio e sempre humano. Opt-in via AUTO_PREPARE=1.
      if (process.env.AUTO_PREPARE === "1") {
        const decision = evaluateAutoPrepare(job, result);
        if (decision.auto) {
          try {
            const gen = await generateApplication(job, result);
            await prisma.application.create({
              data: {
                jobId: created!.id,
                coverLetter: gen.coverLetter,
                resumeVersion: gen.resumeVersion,
                notes: JSON.stringify({ message: gen.message, highlights: gen.highlights, answers: gen.answers }),
                status: "APPLICATION_READY",
              },
            });
            await prisma.job.update({ where: { id: created!.id }, data: { status: "APPLICATION_READY" } });
            logger.info(`[auto-prepare] ${job.title} (${job.company}) preparada`);
          } catch (e) {
            logger.warn(`[auto-prepare] falha em ${job.title}: ${(e as Error).message}`);
          }
        }
      }
    }

    logger.info(`[${sourceId}] filtradas: ${stats.skippedNonTech} nao-tech, ${stats.skippedNonRemote} nao-remotas`);
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        jobsFound: stats.jobsFound,
        jobsNew: stats.jobsNew,
        jobsRelevant: stats.jobsRelevant,
      },
    });
    await prisma.source.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), status: "OK" } });
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`[${sourceId}] falha definitiva: ${msg}`);
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: msg,
        jobsFound: stats.jobsFound,
        jobsNew: stats.jobsNew,
        jobsRelevant: stats.jobsRelevant,
      },
    });
    await prisma.source.update({ where: { id: sourceId }, data: { status: "ERROR", note: msg } });
  }

  return stats;
}

async function generateDailyReport() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const runs = await prisma.collectionRun.findMany({ where: { startedAt: { gte: startOfDay } } });
  const totalFound = runs.reduce((a, r) => a + r.jobsFound, 0);
  const totalRelevant = runs.reduce((a, r) => a + r.jobsRelevant, 0);

  const today = await prisma.job.findMany({ where: { firstSeenAt: { gte: startOfDay } } });
  const byClassification: Record<string, number> = {};
  for (const j of today) byClassification[j.classification] = (byClassification[j.classification] ?? 0) + 1;

  const top = [...today].sort((a, b) => b.score - a.score).slice(0, 5).map((j) => j.id);

  await prisma.dailyReport.create({
    data: {
      totalFound,
      totalRelevant,
      byClassification: JSON.stringify(byClassification),
      topJobIds: JSON.stringify(top),
    },
  });
  return { totalFound, totalRelevant, byClassification };
}

async function main() {
  logger.info("=== Job Hunter — rotina de coleta (Fase 2) ===");
  await ensureSources();

  const enabled = getEnabledSources();
  logger.info(`Fontes habilitadas: ${enabled.map((s) => s.id).join(", ")}`);

  let anySuccess = false;
  for (const s of enabled) {
    const stats = await runSource(s.id);
    logger.info(`[${s.id}] encontradas=${stats.jobsFound} novas=${stats.jobsNew} aderentes=${stats.jobsRelevant}`);
    if (stats.jobsFound > 0) anySuccess = true;
  }

  if (!anySuccess) {
    logger.warn("Nenhuma fonte retornou vagas nesta execucao (verifique conectividade/estrutura das fontes).");
  }

  const summary = await generateDailyReport();
  logger.info(`Relatorio diario: encontradas=${summary.totalFound} aderentes=${summary.totalRelevant}`);

  // Relatorio de console (TOP 5 do banco).
  const rows = await prisma.job.findMany({ orderBy: { score: "desc" }, take: 50 });
  const scored: ScoredJob[] = rows.map((r) => ({
    job: {
      source: r.sourceId,
      externalId: r.externalId,
      url: r.url,
      company: r.company,
      title: r.title,
      description: r.description,
      location: r.location,
      workModel: r.workModel as ScoredJob["job"]["workModel"],
      employmentType: r.employmentType,
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      currency: r.currency,
      technologies: r.technologies ? r.technologies.split(", ").filter(Boolean) : [],
      seniority: r.seniority as ScoredJob["job"]["seniority"],
      english: r.english as ScoredJob["job"]["english"],
      publishedAt: r.publishedAt,
    },
    result: {
      score: r.score,
      classification: r.classification as ScoredJob["result"]["classification"],
      reasons: r.matchReasons ? r.matchReasons.split(" | ").filter(Boolean) : [],
      concerns: r.concerns ? r.concerns.split(" | ").filter(Boolean) : [],
      breakdown: [],
    },
  }));
  console.log("\n" + buildReport(scored));

  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error(`Falha na rotina: ${(err as Error).message}`);
  process.exit(1);
});
