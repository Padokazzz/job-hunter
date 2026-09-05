import "../shared/env.js";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { prisma } from "../shared/db.js";
import { logger } from "../shared/logger.js";
import { generateApplication } from "../applications/generate.js";
import { parseResumeFromBuffer } from "../shared/resume-parser.js";
import { invalidateResumeCache } from "../scoring/resume-match.js";
import type { NormalizedJob } from "../jobs/types.js";
import type { Job, ScoreBreakdown, Application, Resume } from "@prisma/client";

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
    memCache.set(key, { ts: now, data });
    return data;
  });
}
function invalidate(prefix: string) {
  for (const k of [...memCache.keys()]) if (k.startsWith(prefix)) memCache.delete(k);
}

function toJobDto(job: Job & { breakdown: ScoreBreakdown[]; applications: Application[] }) {
  return {
    id: job.id,
    sourceId: job.sourceId,
    company: job.company,
    title: job.title,
    location: job.location,
    workModel: job.workModel,
    seniority: job.seniority,
    english: job.english,
    technologies: job.technologies ? job.technologies.split(", ").filter(Boolean) : [],
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    score: job.score,
    classification: job.classification,
    status: job.status,
    favorited: job.favorited,
    viewed: job.viewed,
    firstSeenAt: job.firstSeenAt,
    publishedAt: job.publishedAt,
    url: job.url,
    matchReasons: job.matchReasons ? job.matchReasons.split(" | ").filter(Boolean) : [],
    concerns: job.concerns ? job.concerns.split(" | ").filter(Boolean) : [],
    description: job.description,
    breakdown: (job.breakdown ?? []).map((b) => ({ category: b.category, points: b.points, maxPoints: b.maxPoints, detail: b.detail })),
    applications: (job.applications ?? []).map((a) => ({
      id: a.id,
      status: a.status,
      appliedAt: a.appliedAt,
      applicationUrl: a.applicationUrl,
      coverLetter: a.coverLetter,
      resumeVersion: a.resumeVersion,
      notes: a.notes,
    })),
  };
}

app.get("/api/stats", async () => {
  const cacheKey = "stats";
  return cached(cacheKey, 120_000, async () => {
    const total = await prisma.job.count();
    const byClassificationAgg = await prisma.job.groupBy({ by: ["classification"], _count: { _all: true } });
    const bySourceAgg = await prisma.job.groupBy({ by: ["sourceId"], _count: { _all: true } });
    const byStatusAgg = await prisma.job.groupBy({ by: ["status"], _count: { _all: true } });
    const favorited = await prisma.job.count({ where: { favorited: true } });
    const applied = await prisma.application.count();

    const topCompanies = await prisma.job.groupBy({
      by: ["company"],
      _count: { _all: true },
      orderBy: { _count: { company: "desc" } },
      take: 5,
    });

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

app.get("/api/jobs", async (req, reply) => {
  const q = (req.query as Record<string, string>) ?? {};
  const conditions: Record<string, unknown>[] = [];

  if (q.scoreMin) conditions.push({ score: { gte: Number(q.scoreMin) } });

  // Senioridade: busca no campo seniority OU no título (jr, pl, sr, etc.)
  if (q.seniority) {
    const seniorityTerms: Record<string, string[]> = {
      JUNIOR: ["junior", "jr", "júnior"],
      JUNIOR_PLENO: ["junior pleno", "pleno júnior", "pleno junior"],
      PLENO: ["pleno", "mid level", "mid-level", "pl"],
      SENIOR: ["senior", "sr", "sênior", "tech lead", "especialista", "principal"],
    };
    const terms = seniorityTerms[q.seniority] || [q.seniority.toLowerCase()];
    conditions.push({
      OR: [
        { seniority: q.seniority },
        ...terms.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })),
      ],
    });
  }

  if (q.workModel) conditions.push({ workModel: q.workModel });
  if (q.english) conditions.push({ english: q.english });
  if (q.source) conditions.push({ sourceId: q.source });
  if (q.status) conditions.push({ status: q.status });
  if (q.favorited === "true") conditions.push({ favorited: true });
  if (q.viewed === "false") conditions.push({ viewed: false });
  if (q.search) conditions.push({ title: { contains: q.search, mode: "insensitive" } });
  if (q.location) conditions.push({ location: { contains: q.location, mode: "insensitive" } });
  if (q.company) conditions.push({ company: { contains: q.company, mode: "insensitive" } });
  if (q.fromDate) conditions.push({ firstSeenAt: { gte: new Date(q.fromDate) } });

  if (q.stack) {
    const tokens = q.stack.split(",").map((t) => t.trim()).filter(Boolean);
    conditions.push({
      OR: tokens.map((t) => ({ technologies: { contains: t, mode: "insensitive" } })),
    });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  const limit = Math.min(Math.max(Number(q.limit ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(q.offset ?? 0) || 0, 0);
  const sortKey = SORTABLE[q.sort ?? ""] ? q.sort! : "score";
  const order: "asc" | "desc" = q.order === "asc" ? "asc" : "desc";

  const orderBy: Record<string, unknown>[] =
    sortKey === "favorited"
      ? [{ favorited: order }]
      : sortKey === "score"
        ? [{ favorited: "desc" }, { score: order }]
        : [{ favorited: "desc" }, { [sortKey]: order }];

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
          classification: true, status: true, favorited: true, viewed: true,
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

app.get("/api/jobs/recent", async () => {
  return cached("jobs:recent", 30_000, async () => {
    const jobs = await prisma.job.findMany({
      where: {
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

app.get("/api/companies", async () => {
  return cached("/api/companies", 60_000, async () => {
    const rows = await prisma.job.groupBy({
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
    include: { breakdown: true, applications: true },
  });
  if (!job) return reply.code(404).send({ error: "not found" });
  return toJobDto(job as Job & { breakdown: ScoreBreakdown[]; applications: Application[] });
});

app.post("/api/jobs/:id/action", async (req, reply) => {
  const { id } = req.params as { id: string };
  const { action, value } = (req.body ?? {}) as { action: string; value?: boolean | string };

  // Preparar candidatura: gera o pacote (carta/mensagem/respostas) a partir do
  // curriculo REAL e grava em Application. NAO envia — envio e humano.
  if (action === "prepare") {
    const jobRow = await prisma.job.findUnique({ where: { id }, include: { applications: true } });
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

    const existing = jobRow.applications[0];
    let application: Application;
    if (existing) {
      application = await prisma.application.update({
        where: { id: existing.id },
        data: { coverLetter: gen.coverLetter, resumeVersion: gen.resumeVersion, notes: notesPayload, status: "APPLICATION_READY" },
      });
    } else {
      application = await prisma.application.create({
        data: {
          jobId: id,
          coverLetter: gen.coverLetter,
          resumeVersion: gen.resumeVersion,
          notes: notesPayload,
          status: "APPLICATION_READY",
        },
      });
    }

    await prisma.job.update({ where: { id }, data: { status: "APPLICATION_READY" } });
    logger.info(`[aplicacao] preparada para ${jobRow.title} (${jobRow.company}) - pacote gerado`);
    invalidate("/api/jobs"); invalidate("/api/stats");
    return { ok: true, status: "APPLICATION_READY", applicationId: application.id };
  }

  // Confirmacao HUMANA de envio. O bot nunca envia automaticamente nem
  // contorna CAPTCHA/2FA/anti-bot (doc sec. 16).
  if (action === "applied") {
    const jobRow = await prisma.job.findUnique({ where: { id }, include: { applications: true } });
    if (!jobRow) return reply.code(404).send({ error: "not found" });
    const url = typeof value === "string" && value ? value : jobRow.url;

    const existing = jobRow.applications[0];
    if (existing) {
      await prisma.application.update({ where: { id: existing.id }, data: { status: "APPLIED", appliedAt: new Date(), applicationUrl: url } });
    } else {
      await prisma.application.create({ data: { jobId: id, status: "APPLIED", appliedAt: new Date(), applicationUrl: url } });
    }
    await prisma.job.update({ where: { id }, data: { status: "APPLIED" } });
    invalidate("/api/jobs"); invalidate("/api/stats");
    return { ok: true, status: "APPLIED" };
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
    if (current && ["APPLIED", "INTERVIEW", "APPLICATION_READY", "APPROVED", "REJECTED", "CLOSED"].includes(current.status)) {
      delete update.status;
    }
  }

  const job = await prisma.job.update({ where: { id }, data: update });
  invalidate("/api/jobs"); invalidate("/api/stats");
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

app.get("/api/applications", async () => {
  const apps = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    include: { job: { select: { title: true, company: true, url: true } } },
  });
  return apps.map((a) => ({
    id: a.id,
    jobId: a.jobId,
    jobTitle: a.job.title,
    company: a.job.company,
    status: a.status,
    appliedAt: a.appliedAt,
    applicationUrl: a.applicationUrl,
    coverLetter: a.coverLetter,
    resumeVersion: a.resumeVersion,
    notes: a.notes,
    jobUrl: a.job.url,
  }));
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

    const fileName = `${Date.now()}-${data.filename}`;
    const uploadDir = path.join(__dirname, "..", "..", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, fileName), buffer);

    // Desativar currículos anteriores
    await prisma.resume.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const resume = await prisma.resume.create({
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
    });

    invalidate("/api/resume");
    invalidate("/api/settings");
    invalidateResumeCache();

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

  invalidate("/api/resume");
  invalidate("/api/settings");
  invalidateResumeCache();

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

  invalidate("/api/resume");
  invalidate("/api/settings");
  invalidateResumeCache();

  return { ok: true };
});

app.get("/api/reports/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const r = await prisma.dailyReport.findUnique({ where: { id } });
  if (!r) return reply.code(404).send({ error: "not found" });
  const topIds: string[] = JSON.parse(r.topJobIds || "[]");
  const jobs = await prisma.job.findMany({ where: { id: { in: topIds } } });
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
app.listen({ port: PORT, host: "0.0.0.0" }).then(async () => {
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
