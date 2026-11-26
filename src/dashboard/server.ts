import "../shared/env.js";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { prisma } from "../shared/db.js";
import { logger } from "../shared/logger.js";
import { generateApplication } from "../applications/generate.js";
import { parseResumeFromBuffer } from "../shared/resume-parser.js";
import { detectPostingLanguage } from "../jobs/posting-language.js";
import { analyzeTechnologyGaps } from "../jobs/technology-gaps.js";
import { getResumeRankingProfile } from "../scoring/resume-match.js";
import type { NormalizedJob } from "../jobs/types.js";
import type { Job, ScoreBreakdown, Application, Prisma } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");

const app = Fastify({ logger: false });

await app.register(fastifyMultipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

await app.register(fastifyStatic, {
  root: publicDir,
  prefix: "/",
  cacheControl: true,
  maxAge: 60 * 60 * 1000, // 1h static assets (hashed by content via ?v not needed; low-churn)
});

// Cache simples em memoria para leituras pesadas (TTL curto, suficiente para
// o dashboard e o auto-refresh). Nao armazena segredos.
const memCache = new Map<string, { ts: number; data: unknown }>();
function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = memCache.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < ttlMs) return Promise.resolve(hit.data as T);
  return compute().then((data) => {
    if (memCache.size >= 128) {
      const oldest = memCache.keys().next().value;
      if (oldest !== undefined) memCache.delete(oldest);
    }
    memCache.set(key, { ts: now, data });
    return data;
  });
}
function invalidate(prefix: string) {
  for (const k of [...memCache.keys()]) if (k.startsWith(prefix)) memCache.delete(k);
}

function toJobDto(job: Job & { breakdown: ScoreBreakdown[]; applications: Application[] }) {
  const submitted = job.applications?.find((application) => application.appliedAt);
  return {
    id: job.id,
    sourceId: job.sourceId,
    company: job.company,
    title: job.title,
    location: job.location,
    workModel: job.workModel,
    seniority: job.seniority,
    english: job.english,
    postingLanguage: job.postingLanguage,
    submittedAt: submitted?.appliedAt ?? null,
    submittedApplicationId: submitted?.id ?? null,
    technologies: job.technologies ? job.technologies.split(", ").filter(Boolean) : [],
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    score: job.score,
    classification: job.classification,
    status: job.status,
    favorited: job.favorited,
    viewed: job.viewed,
    unavailable: job.unavailable,
    firstSeenAt: job.firstSeenAt,
    publishedAt: job.publishedAt,
    url: job.url,
    matchReasons: job.matchReasons ? job.matchReasons.split(" | ").filter(Boolean) : [],
    concerns: job.concerns ? job.concerns.split(" | ").filter(Boolean) : [],
    description: job.description,
    breakdown: (job.breakdown ?? []).map((b) => ({ category: b.category, points: b.points, maxPoints: b.maxPoints, detail: b.detail })),
    applications: (job.applications ?? []).map((a) => ({
      id: a.id,
      status: job.status,
      appliedAt: a.appliedAt,
      applicationUrl: a.applicationUrl,
      coverLetter: a.coverLetter,
      resumeVersion: a.resumeVersion,
      notes: a.notes,
    })),
  };
}

function allowedPostingLanguages(query: unknown): string[] {
  const includeEnglish = (query as { includeEnglish?: string } | undefined)?.includeEnglish === "true";
  return includeEnglish ? ["pt", "en"] : ["pt"];
}

app.get("/api/stats", async (req) => {
  const languages = allowedPostingLanguages(req.query);
  const where = { postingLanguage: { in: languages }, unavailable: false };
  const cacheKey = "stats:" + languages.join(",");
  return cached(cacheKey, 120_000, async () => {
    const [total, byClassificationAgg, bySourceAgg, byStatusAgg, favorited, applied, topCompanies] =
      await Promise.all([
        prisma.job.count({ where }),
        prisma.job.groupBy({ where, by: ["classification"], _count: { _all: true } }),
        prisma.job.groupBy({ where, by: ["sourceId"], _count: { _all: true } }),
        prisma.job.groupBy({ where, by: ["status"], _count: { _all: true } }),
        prisma.job.count({ where: { ...where, favorited: true } }),
        prisma.application.count(),
        prisma.job.groupBy({
          where, by: ["company"], _count: { _all: true },
          orderBy: { _count: { company: "desc" } }, take: 5,
        }),
      ]);

    return {
      total,
      favorited,
      applied,
      byClassification: Object.fromEntries(byClassificationAgg.map((g) => [g.classification, g._count._all])),
      bySource: Object.fromEntries(bySourceAgg.map((g) => [g.sourceId, g._count._all])),
      byStatus: Object.fromEntries(byStatusAgg.map((g) => [g.status, g._count._all])),
      topCompanies: topCompanies.map((c) => ({ company: c.company, count: c._count._all })),
      dbMode: (process.env.DATABASE_URL ?? "").startsWith("postgres") ? "supabase" : "sqlite",
    };
  });
});

const SORTABLE: Record<string, string> = {
  title: "title", company: "company", source: "sourceId", score: "score",
  classification: "classification", status: "status", workModel: "workModel",
  seniority: "seniority", favorited: "favorited", firstSeenAt: "firstSeenAt",
  publishedAt: "publishedAt",
};

const submittedApplications = { some: { appliedAt: { not: null } } } satisfies Prisma.ApplicationListRelationFilter;

app.get("/api/technology-gaps", async (req, reply) => {
  const q = req.query as { minScore?: string; days?: string };
  const minScore = q.minScore === undefined ? 55 : Number(q.minScore);
  const days = q.days === undefined ? 90 : Number(q.days);
  if (![55, 70, 85].includes(minScore) || ![30, 90, 0].includes(days)) {
    return reply.code(400).send({ error: "Selecione um período e uma aderência mínima válidos." });
  }

  const languages = allowedPostingLanguages(req.query);
  return cached(`technology-gaps:${languages.join(",")}:${minScore}:${days}`, 60_000, async () => {
    const profile = await getResumeRankingProfile();
    if (!profile?.textContent?.trim()) return { resumeName: null, jobCount: 0, gaps: [] };

    const jobs = await prisma.job.findMany({
      where: {
        unavailable: false,
        score: { gte: minScore },
        postingLanguage: { in: languages },
        ...(days ? { firstSeenAt: { gte: new Date(Date.now() - days * 86_400_000) } } : {}),
      },
      select: { id: true, title: true, company: true, description: true, score: true },
    });

    return {
      resumeName: profile.originalName ?? "Currículo ativo",
      ...analyzeTechnologyGaps(profile.textContent, jobs),
    };
  });
});

app.get("/api/jobs", async (req, reply) => {
  const q = (req.query as Record<string, string>) ?? {};
  const unavailable = q.availability === "unavailable";
  const conditions: Prisma.JobWhereInput[] = [{ unavailable }];

  if (q.scoreMin && Number.isInteger(Number(q.scoreMin))) conditions.push({ score: { gte: Number(q.scoreMin) } });

  if (q.seniority) conditions.push({ seniority: q.seniority });

  if (q.workModel) conditions.push({ workModel: q.workModel });
  if (q.english) conditions.push({ english: q.english });
  if (q.source) conditions.push({ sourceId: q.source });
  if (q.status) conditions.push({ status: q.status });
  if (q.application === "submitted") conditions.push({ applications: submittedApplications });
  else if (!unavailable && q.application !== "all" && !["APPLIED", "INTERVIEW", "OFFER"].includes(q.status ?? "")) {
    conditions.push({ NOT: { applications: submittedApplications } });
  }
  if (q.favorited === "true") conditions.push({ favorited: true });
  if (q.viewed === "false") conditions.push({ viewed: false });
  for (const term of searchTerms(q.search)) {
    const match = { contains: term, mode: "insensitive" as const };
    conditions.push({ OR: [{ title: match }, { company: match }, { technologies: match }] });
  }
  if (q.location) conditions.push({ location: { contains: q.location, mode: "insensitive" } });
  if (q.company) conditions.push({ company: { contains: q.company, mode: "insensitive" } });
  const fromDate = dayStart(q.fromDate);
  if (fromDate) conditions.push({ firstSeenAt: { gte: fromDate } });

  if (q.stack) {
    const tokens = q.stack.split(",").map((t) => t.trim()).filter(Boolean);
    conditions.push({
      OR: tokens.map((t) => ({ technologies: { contains: t, mode: "insensitive" } })),
    });
  }

  const where = { postingLanguage: { in: allowedPostingLanguages(q) }, AND: conditions };

  const limit = Math.min(Math.max(Math.trunc(Number(q.limit)) || 50, 1), 200);
  const offset = Math.min(1_000_000, Math.max(Math.trunc(Number(q.offset)) || 0, 0));
  const sortKey = Object.hasOwn(SORTABLE, q.sort ?? "") ? q.sort! : "score";
  const order: "asc" | "desc" = q.order === "asc" ? "asc" : "desc";

  const orderBy: Prisma.JobOrderByWithRelationInput[] = [{ [SORTABLE[sortKey]!]: order }, { id: "asc" }];

  const key = "jobs:" + new URLSearchParams(q as Record<string, string>).toString();
  return cached(key, 30_000, async () => {
    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        // Listagem enxuta: a descricao/breakdown/applications so sao usados no
        // drawer, que busca o job completo em /api/jobs/:id. Isso corta o payload
        // em ~90% e evita joins pesados em cada linha.
        select: {
          id: true, sourceId: true, company: true, title: true, location: true,
          workModel: true, seniority: true, english: true, score: true,
          classification: true, status: true, favorited: true, viewed: true, postingLanguage: true, unavailable: true,
          applications: { where: { appliedAt: { not: null } }, orderBy: [{ appliedAt: "asc" }, { id: "asc" }], take: 1, select: { id: true, appliedAt: true } },
        firstSeenAt: true, publishedAt: true, url: true, technologies: true,
      },
      }),
    ]);

    return {
      items: jobs.map((j) => toJobDto(j as Job & { breakdown: ScoreBreakdown[]; applications: Application[] })),
      total,
      offset,
      limit,
    };
  });
});

app.get("/api/jobs/recent", async (req) => {
  const languages = allowedPostingLanguages(req.query);
  return cached("jobs:recent:" + languages.join(","), 30_000, async () => {
    const jobs = await prisma.job.findMany({
      where: {
        NOT: { applications: submittedApplications },
        unavailable: false,
        postingLanguage: { in: languages },
        score: { gte: 40 },
        classification: { in: ["PRIORITARY", "GOOD", "SECONDARY"] },
      },
      orderBy: [{ score: "desc" }, { firstSeenAt: "desc" }],
      take: 10,
      select: {
        id: true, company: true, title: true, location: true, workModel: true,
        score: true, classification: true, technologies: true, url: true,
        firstSeenAt: true, salaryMin: true, salaryMax: true, currency: true,
      },
    });
    return jobs.map((j) => ({
      id: j.id,
      company: j.company,
      title: j.title,
      location: j.location,
      workModel: j.workModel,
      score: j.score,
      classification: j.classification,
      technologies: j.technologies ? j.technologies.split(", ").filter(Boolean) : [],
      url: j.url,
      firstSeenAt: j.firstSeenAt,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      currency: j.currency,
    }));
  });
});

app.get("/api/companies", async (req) => {
  const languages = allowedPostingLanguages(req.query);
  return cached("/api/companies:" + languages.join(","), 60_000, async () => {
    const rows = await prisma.job.groupBy({
      where: { postingLanguage: { in: languages } },
      by: ["company"],
      _count: { _all: true },
      orderBy: { _count: { company: "desc" } },
      take: 150,
    });
    return rows.map((r) => ({ company: r.company, count: r._count._all }));
  });
});

app.get("/api/jobs/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const job = await prisma.job.findUnique({
    where: { id },
    include: { breakdown: true, applications: { orderBy: [{ appliedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }] } },
  });
  if (!job) return reply.code(404).send({ error: "not found" });
  return toJobDto(job as Job & { breakdown: ScoreBreakdown[]; applications: Application[] });
});

app.post("/api/jobs/:id/action", async (req, reply) => {
  const { id } = req.params as { id: string };
  const { action, value } = (req.body ?? {}) as { action: string; value?: boolean | string | { appliedAt?: string; channel?: string; confirmationUrl?: string } };

  // Preparar candidatura: gera o pacote (carta/mensagem/respostas) a partir do
  // curriculo REAL e grava em Application. NAO envia — envio e humano.
  if (action === "prepare") {
    const jobRow = await prisma.job.findUnique({ where: { id } });
    if (!jobRow) return reply.code(404).send({ error: "not found" });

    const normalized: NormalizedJob = {
      source: jobRow.sourceId,
      externalId: jobRow.externalId,
      url: jobRow.url,
      company: jobRow.company,
      title: jobRow.title,
      description: jobRow.description || "",
      location: jobRow.location,
      workModel: jobRow.workModel as NormalizedJob["workModel"],
      employmentType: jobRow.employmentType,
      salaryMin: jobRow.salaryMin,
      salaryMax: jobRow.salaryMax,
      currency: jobRow.currency,
      technologies: jobRow.technologies ? jobRow.technologies.split(", ").filter(Boolean) : [],
      seniority: jobRow.seniority as NormalizedJob["seniority"],
      english: jobRow.english as NormalizedJob["english"],
      publishedAt: jobRow.publishedAt,
    };

    let gen;
    try {
      gen = await generateApplication(normalized, {
        score: jobRow.score,
        classification: "GOOD",
        reasons: [],
        concerns: [],
        breakdown: [],
      });
    } catch (genError) {
      console.error("[prepare] Erro ao gerar candidatura:", genError);
      return reply.code(500).send({ error: "Erro ao gerar candidatura: " + (genError as Error).message });
    }

    const notesPayload = JSON.stringify({
      message: gen.message,
      highlights: gen.highlights,
      answers: gen.answers,
    });

    const application = await prisma.$transaction(async (tx) => {
      const job = await tx.job.update({ where: { id }, data: { updatedAt: new Date() } });
      const existing = await tx.application.findFirst({ where: { jobId: id }, orderBy: { createdAt: "desc" } });
      const status = existing && applicationStages.includes(job.status) ? job.status : "APPLICATION_READY";
      const data = { coverLetter: gen.coverLetter, resumeVersion: gen.resumeVersion, notes: notesPayload, status };
      await tx.job.update({ where: { id }, data: { status } });
      return existing
        ? tx.application.update({ where: { id: existing.id }, data })
        : tx.application.create({ data: { ...data, jobId: id } });
    });
    logger.info(`[aplicacao] preparada para ${jobRow.title} (${jobRow.company}) - pacote gerado`);
    invalidate("jobs:"); invalidate("stats");
    return { ok: true, status: application.status, applicationId: application.id };
  }

  // Confirmacao HUMANA de envio. O bot nunca envia automaticamente nem
  // contorna CAPTCHA/2FA/anti-bot (doc sec. 16).
  if (action === "applied") {
    const details = value && typeof value === "object" ? value : undefined;
    if (details && [details.appliedAt, details.channel, details.confirmationUrl].some(
      (field) => field !== undefined && typeof field !== "string")) {
      return reply.code(400).send({ error: "Confira a data, o canal e o link de confirmação." });
    }
    const appliedAt = details?.appliedAt ? new Date(details.appliedAt) : new Date();
    const channel = details?.channel?.trim() || null;
    const applicationUrl = details?.confirmationUrl?.trim() || (typeof value === "string" ? value : "") || null;
    if (Number.isNaN(appliedAt.getTime()) || appliedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000 || (channel?.length ?? 0) > 80 ||
        (applicationUrl && !validWebUrl(applicationUrl))) {
      return reply.code(400).send({ error: "Confira a data, o canal e o link de confirmação." });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lock the job before reading applications so concurrent confirmations share the same record.
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM "Job" WHERE id = ${id} FOR UPDATE
      `;
      const job = locked[0];
      if (!job) return null;
      const submitted = await tx.application.findFirst({
        where: { jobId: id, appliedAt: { not: null } }, orderBy: [{ appliedAt: "asc" }, { id: "asc" }],
      });
      if (submitted) return { applicationId: submitted.id, status: job.status, alreadySubmitted: true };

      const draft = await tx.application.findFirst({ where: { jobId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const status = draft && applicationStages.includes(job.status) && job.status !== "APPLICATION_READY"
        ? job.status : "APPLIED";
      const data = { status, appliedAt, channel, applicationUrl: applicationUrl ?? draft?.applicationUrl };
      const application = draft
        ? await tx.application.update({ where: { id: draft.id }, data })
        : await tx.application.create({ data: { ...data, jobId: id } });
      await tx.job.update({ where: { id }, data: { status } });
      return { applicationId: application.id, status, alreadySubmitted: false };
    });
    if (!result) return reply.code(404).send({ error: "Vaga não encontrada." });
    invalidate("jobs:"); invalidate("stats");
    return { ok: true, ...result };
  }

  if (action === "unavailable") {
    if (typeof value !== "boolean") return reply.code(400).send({ error: "Disponibilidade inválida." });
    const changed = await prisma.job.updateMany({ where: { id }, data: { unavailable: value } });
    if (!changed.count) return reply.code(404).send({ error: "Vaga não encontrada." });
    invalidate("jobs:"); invalidate("stats"); invalidate("technology-gaps:");
    return { ok: true, unavailable: value };
  }

  const update: Record<string, unknown> = {};
  switch (action) {
    case "favorite":
      update.favorited = value !== false;
      break;
    case "view":
      update.viewed = true;
      update.status = "REVIEWING";
      break;
    case "approve":
      update.status = "APPROVED";
      break;
    case "ignore":
      update.status = "REJECTED";
      break;
    case "notes":
      update.notes = String(value ?? "");
      break;
    default:
      return reply.code(400).send({ error: "acao invalida" });
  }

  if (action === "view") {
    const current = await prisma.job.findUnique({ where: { id }, select: { status: true } });
    if (current && ["APPLIED", "INTERVIEW", "OFFER", "APPLICATION_READY", "APPROVED", "REJECTED", "CLOSED"].includes(current.status)) {
      delete update.status;
    }
  }

  const job = await prisma.job.update({ where: { id }, data: update });
  invalidate("jobs:"); invalidate("stats");
  return { ok: true, status: job.status, favorited: job.favorited };
});

app.get("/api/sources", async () => {
  const sources = await prisma.source.findMany({ orderBy: { id: "asc" } });
  const runs = await prisma.collectionRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  const bySource = new Map(runs.map((r) => [r.sourceId, r]));
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    enabled: s.enabled,
    status: s.status,
    lastRunAt: s.lastRunAt,
    note: s.note,
    lastRun: bySource.get(s.id)
      ? { status: bySource.get(s.id)!.status, jobsFound: bySource.get(s.id)!.jobsFound, error: bySource.get(s.id)!.error }
      : null,
  }));
});

app.get("/api/reports", async () => {
  const reports = await prisma.dailyReport.findMany({ orderBy: { generatedAt: "desc" }, take: 30 });
  return reports.map((r) => ({
    id: r.id,
    date: r.date,
    totalFound: r.totalFound,
    totalRelevant: r.totalRelevant,
    byClassification: JSON.parse(r.byClassification || "{}"),
    topJobIds: JSON.parse(r.topJobIds || "[]"),
    generatedAt: r.generatedAt,
  }));
});

const applicationStages = ["APPLICATION_READY", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "CLOSED"];

function searchTerms(value: unknown): string[] {
  return typeof value === "string" ? value.trim().slice(0, 160).split(/\s+/).filter(Boolean).slice(0, 8) : [];
}

function validWebUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function dayStart(value: unknown): Date | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return date;
}

app.get("/api/applications", async (req, reply) => {
  const q = req.query as Record<string, string>;
  const since = dayStart(q.since);
  const until = dayStart(q.until);
  if ((q.since && !since) || (q.until && !until) || (since && until && since > until)) {
    return reply.code(400).send({ error: "Informe um período válido." });
  }
  if (until) until.setUTCDate(until.getUTCDate() + 1);
  for (const [date, offset] of [[since, q.sinceOffset], [until, q.untilOffset]] as const) {
    const minutes = Number(offset);
    if (date && Number.isInteger(minutes) && Math.abs(minutes) <= 14 * 60) {
      date.setUTCMinutes(minutes);
    }
  }

  const where: Prisma.ApplicationWhereInput = {
    id: typeof q.id === "string" && q.id ? q.id : undefined,
    job: {
      status: q.stage && applicationStages.includes(q.stage) ? q.stage : undefined,
      AND: searchTerms(q.search).map((term) => ({
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { company: { contains: term, mode: "insensitive" } },
        ],
      })),
    },
    appliedAt: q.submitted === "true" ? { not: null, gte: since, lt: until } : since || until ? { gte: since, lt: until } : undefined,
  };
  const limit = 25;
  const offset = Math.min(1_000_000, Math.max(0, Math.trunc(Number(q.offset) || 0)));
  const [total, apps] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: q.sort === "followUp"
        ? [{ followUpOn: { sort: "asc", nulls: "last" } }, { id: "desc" }]
        : [{ appliedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: limit,
      select: {
        id: true, jobId: true, appliedAt: true, applicationUrl: true, channel: true, nextAction: true, followUpOn: true,
        job: { select: { title: true, company: true, url: true, status: true, unavailable: true } },
      },
    }),
  ]);
  return {
    total, offset, limit,
    items: apps.map(({ job, ...application }) => ({
      ...application, jobTitle: job.title, company: job.company, jobUrl: job.url, status: job.status, unavailable: job.unavailable,
    })),
  };
});

app.patch("/api/applications/:id/follow-up", async (req, reply) => {
  const { id } = req.params as { id: string };
  const { nextAction, followUpOn } = (req.body ?? {}) as { nextAction?: unknown; followUpOn?: unknown };
  if (typeof nextAction !== "string" || nextAction.trim().length > 200 ||
      typeof followUpOn !== "string" || (followUpOn && !dayStart(followUpOn))) {
    return reply.code(400).send({ error: "Informe uma ação de até 200 caracteres e uma data válida." });
  }
  const result = await prisma.application.updateMany({
    where: { id },
    data: { nextAction: nextAction.trim() || null, followUpOn: followUpOn || null },
  });
  if (!result.count) return reply.code(404).send({ error: "Candidatura não encontrada." });
  return { ok: true };
});

app.patch("/api/applications/:id/stage", async (req, reply) => {
  const { id } = req.params as { id: string };
  const { stage } = (req.body ?? {}) as { stage?: string };
  if (!stage || !applicationStages.includes(stage)) {
    return reply.code(400).send({ error: "Etapa inválida." });
  }
  const changed = await prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({ where: { id }, select: { jobId: true } });
    if (!application) return false;
    await tx.job.update({ where: { id: application.jobId }, data: { status: stage } });
    await tx.application.updateMany({ where: { jobId: application.jobId }, data: { status: stage } });
    if (stage === "APPLIED") {
      await tx.application.updateMany({
        where: { jobId: application.jobId, appliedAt: null },
        data: { appliedAt: new Date() },
      });
    }
    return true;
  });
  if (!changed) return reply.code(404).send({ error: "Candidatura não encontrada." });
  invalidate("jobs:"); invalidate("stats");
  return { ok: true };
});

// Rotas de upload de currículo
app.get("/api/resume", async () => {
  const activeResume = await prisma.resume.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!activeResume) {
    return { active: null, history: [] };
  }

  const history = await prisma.resume.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      originalName: true,
      technologies: true,
      experience: true,
      isActive: true,
      createdAt: true,
    },
  });

  return {
    active: {
      id: activeResume.id,
      fileName: activeResume.fileName,
      originalName: activeResume.originalName,
      technologies: JSON.parse(activeResume.technologies || "[]"),
      experience: activeResume.experience ? JSON.parse(activeResume.experience) : null,
      education: activeResume.education ? JSON.parse(activeResume.education) : null,
      skills: activeResume.skills ? JSON.parse(activeResume.skills) : [],
      createdAt: activeResume.createdAt,
    },
    history: history.map((r) => ({
      ...r,
      technologies: JSON.parse(r.technologies || "[]"),
      experience: r.experience ? JSON.parse(r.experience) : null,
    })),
  };
});

app.post("/api/resume/upload", async (req, reply) => {
  try {
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: "Nenhum arquivo enviado" });
    }

    if (!data.filename.endsWith(".pdf")) {
      return reply.code(400).send({ error: "Apenas arquivos PDF são aceitos" });
    }

    const buffer = await data.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.code(400).send({ error: "Arquivo muito grande (máximo 5MB)" });
    }

    const parsed = await parseResumeFromBuffer(buffer);
    if (!parsed.textContent.trim() || !parsed.technologies.length) {
      return reply.code(422).send({ error: "O PDF não contém tecnologias reconhecíveis no texto." });
    }

    const fileName = `${randomUUID()}-${path.basename(data.filename)}`;
    const uploadDir = path.join(__dirname, "..", "..", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    await fs.promises.writeFile(path.join(uploadDir, fileName), buffer, { mode: 0o600 });

    const [, resume] = await prisma.$transaction([
      prisma.resume.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      prisma.resume.create({
        data: {
          fileName,
          originalName: data.filename,
          textContent: parsed.textContent,
          technologies: JSON.stringify(parsed.technologies),
          experience: JSON.stringify(parsed.experience),
          education: JSON.stringify(parsed.education),
          skills: JSON.stringify(parsed.skills),
          isActive: true,
        },
      }),
    ]).catch(async (error) => {
      await fs.promises.unlink(path.join(uploadDir, fileName)).catch(() => {});
      throw error;
    });

    invalidate("technology-gaps:");
    invalidate("/api/resume");
    invalidate("/api/settings");

    logger.info(`[resume] Currículo uploaded: ${data.filename} - ${parsed.technologies.length} tecnologias detectadas`);

    return {
      ok: true,
      resume: {
        id: resume.id,
        originalName: resume.originalName,
        technologies: parsed.technologies,
        experience: parsed.experience,
        education: parsed.education,
        skills: parsed.skills,
      },
    };
  } catch (err) {
    logger.error(`[resume] Erro no upload: ${(err as Error).message}`);
    return reply.code(500).send({ error: "Erro ao processar currículo" });
  }
});

app.delete("/api/resume/:id", async (req, reply) => {
  const { id } = req.params as { id: string };

  const resume = await prisma.resume.findUnique({ where: { id } });
  if (!resume) {
    return reply.code(404).send({ error: "Currículo não encontrado" });
  }

  // Remover arquivo físico
  const filePath = path.join(__dirname, "..", "..", "uploads", resume.fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await prisma.resume.delete({ where: { id } });

  // Se era o ativo, ativar o mais recente
  if (resume.isActive) {
    const latest = await prisma.resume.findFirst({
      orderBy: { createdAt: "desc" },
    });
    if (latest) {
      await prisma.resume.update({
        where: { id: latest.id },
        data: { isActive: true },
      });
    }
  }

  invalidate("technology-gaps:");
  invalidate("/api/resume");
  invalidate("/api/settings");

  return { ok: true };
});

app.post("/api/resume/:id/activate", async (req, reply) => {
  const { id } = req.params as { id: string };

  const resume = await prisma.resume.findUnique({ where: { id } });
  if (!resume) {
    return reply.code(404).send({ error: "Currículo não encontrado" });
  }

  await prisma.resume.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  await prisma.resume.update({
    where: { id },
    data: { isActive: true },
  });

  invalidate("technology-gaps:");
  invalidate("/api/resume");
  invalidate("/api/settings");

  return { ok: true };
});

app.get("/api/reports/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const r = await prisma.dailyReport.findUnique({ where: { id } });
  if (!r) return reply.code(404).send({ error: "not found" });
  const topIds: string[] = JSON.parse(r.topJobIds || "[]");
  const jobs = await prisma.job.findMany({ where: { id: { in: topIds }, postingLanguage: { in: allowedPostingLanguages(req.query) } } });
  return {
    ...r,
    byClassification: JSON.parse(r.byClassification || "{}"),
    topJobs: jobs.map((j) => ({ id: j.id, title: j.title, company: j.company, score: j.score, url: j.url })),
  };
});

const PORT = Number(process.env.DASHBOARD_PORT ?? 3000);
const base = `http://127.0.0.1:${PORT}`;
const keepWarm = () => {
  fetch(`${base}/api/stats`).catch(() => {});
  // Aquece exatamente a consulta que a UI faz ao abrir "Vagas" (limit=50, sem filtros)
  fetch(`${base}/api/jobs?limit=50&offset=0&sort=score&order=desc`).catch(() => {});
};
async function classifySavedPostings() {
  let count = 0;
  for (;;) {
    const rows = await prisma.job.findMany({
      where: { postingLanguage: null },
      select: { id: true, title: true, description: true },
      orderBy: { id: "asc" },
      take: 100,
    });
    if (!rows.length) break;
    await prisma.$transaction(rows.map((row) => prisma.job.updateMany({
      where: { id: row.id, postingLanguage: null },
      data: { postingLanguage: detectPostingLanguage(row.title, row.description) },
    })));
    count += rows.length;
  }
  if (count) logger.info(`Idioma identificado para ${count} vagas existentes.`);
}

classifySavedPostings().then(() => app.listen({ port: PORT, host: "0.0.0.0" })).then(async () => {
  logger.info(`Dashboard em http://localhost:${PORT} (aquecendo cache...)`);
  // Aquece o pool do Supabase e o cache ANTES do primeiro usuario abrir a pagina,
  // para o 1o acesso e o auto-refresh nunca pagarem o custo frio do pooler.
  await keepWarm();
  logger.info(`Cache quente - pronto para uso.`);
  setInterval(keepWarm, 90_000);
}).catch((err) => {
  logger.error(`Falha ao iniciar dashboard: ${(err as Error).message}`);
  process.exit(1);
});
