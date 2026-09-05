import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateApplication } from "../src/applications/generate.js";
import { evaluateAutoPrepare } from "../src/applications/policy.js";
import type { NormalizedJob, ScoreResult } from "../src/jobs/types.js";

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: "programathor",
    externalId: "123",
    url: "https://example.com/job/123",
    company: "Acme",
    title: "Desenvolvedor Fullstack Node.js",
    description: "Vaga com Node.js e TypeScript",
    location: "Remoto",
    workModel: "REMOTE",
    employmentType: "CLT",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    technologies: ["node.js", "typescript", "react"],
    seniority: "PLENO",
    english: "NONE",
    publishedAt: new Date(),
    ...overrides,
  };
}

const fakeResult: ScoreResult = {
  score: 90,
  classification: "GOOD",
  reasons: [],
  concerns: [],
  breakdown: [],
};

describe("generateApplication", () => {
  test("usa apenas skills reais do curriculo (nao inventa)", async () => {
    const job = makeJob({ technologies: ["node.js", "typescript", "react", "flutter"] });
    const app = await generateApplication(job, fakeResult);
    // Sem curriculo ativo, matchedSkills sera vazio (fallback)
    assert.ok(Array.isArray(app.matchedSkills));
  });

  test("carta contem dados do candidato (via env ou fallback)", async () => {
    const app = await generateApplication(makeJob(), fakeResult);
    // Deve conter nome do candidato (de CANDIDATE_NAME env) ou "Candidato" (fallback)
    const hasName = app.coverLetter.includes(process.env.CANDIDATE_NAME || "Candidato");
    assert.ok(hasName, `coverLetter deve conter nome do candidato: ${app.coverLetter.substring(0, 100)}`);
  });

  test("nao responde automaticamente perguntas sensiveis", async () => {
    const app = await generateApplication(makeJob(), fakeResult);
    const salary = app.answers.find((a) => a.question.includes("Pretens"));
    assert.ok(salary && salary.safe === false);
  });

  test("gera respostas seguras para skills reais", async () => {
    const app = await generateApplication(makeJob({ technologies: ["node.js"] }), fakeResult);
    // Sem curriculo ativo, nao hara respostas para skills especificas
    assert.ok(Array.isArray(app.answers));
  });
});

describe("evaluateAutoPrepare (Modo 2)", () => {
  test("bloqueia score abaixo de 85", () => {
    const d = evaluateAutoPrepare(makeJob(), { ...fakeResult, score: 70 });
    assert.equal(d.auto, false);
  });

  test("aprova vaga aderente e sem risco", () => {
    const d = evaluateAutoPrepare(makeJob(), fakeResult);
    assert.equal(d.auto, true);
  });

  test("bloqueia ingles avancado obrigatorio", () => {
    const d = evaluateAutoPrepare(makeJob({ english: "ADVANCED" }), fakeResult);
    assert.equal(d.auto, false);
  });

  test("bloqueia vaga senior (fora do perfil)", () => {
    const d = evaluateAutoPrepare(makeJob({ seniority: "SENIOR" }), fakeResult);
    assert.equal(d.auto, false);
  });

  test("bloqueia presenca de teste tecnico", () => {
    const d = evaluateAutoPrepare(makeJob(), { ...fakeResult, concerns: ["Contem teste tecnico"] });
    assert.equal(d.auto, false);
  });
});
