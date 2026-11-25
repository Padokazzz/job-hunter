import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreJob } from "../src/scoring/score.js";
import { candidate } from "../src/config/candidate.js";
import type { NormalizedJob } from "../src/jobs/types.js";

function makeJob(over: Partial<NormalizedJob>): NormalizedJob {
  return {
    source: "test",
    externalId: "1",
    url: "https://example.com/1",
    company: "Empresa A",
    title: "Desenvolvedor Full Stack Junior",
    description: "Trabalhamos com Node.js, TypeScript, React, REST API e PostgreSQL em producao. Git e banco de dados.",
    location: "Remote",
    workModel: "REMOTE",
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    currency: null,
    technologies: ["node.js", "typescript", "react", "rest", "sql"],
    seniority: "JUNIOR",
    english: "NONE",
    publishedAt: null,
    ...over,
  };
}

test("vaga Node+TS+React remota junior pontua alto (PRIORITARY/GOOD)", async () => {
  const r = await scoreJob(makeJob({}), candidate);
  assert.ok(r.score >= 70, `esperado >=70, obteve ${r.score}`);
  assert.ok(r.classification === "PRIORITARY" || r.classification === "GOOD");
});

test("vaga senior em Java e presencial pontua baixo (DISCARD/LOW)", async () => {
  const r = await scoreJob(
    makeJob({
      title: "Desenvolvedor Senior Java",
      description: "Java, Spring, presencial. 8 anos de experiencia.",
      technologies: ["java"],
      seniority: "SENIOR",
      workModel: "ONSITE",
      location: "Sao Paulo",
      english: "NONE",
    }),
    candidate,
  );
  assert.ok(r.score < 55, `esperado <55, obteve ${r.score}`);
});

test("ingles avancado obrigatorio penaliza forte", async () => {
  const semIngles = (await scoreJob(makeJob({ english: "NONE" }), candidate)).score;
  const comIngles = (await scoreJob(makeJob({ english: "ADVANCED", description: "Fluent English required. Node.js, React." }), candidate)).score;
  assert.ok(comIngles < semIngles - 5, `avancado deveria reduzir >5 pontos (${semIngles} vs ${comIngles})`);
});

test("score sempre entre 0 e 100", async () => {
  for (const eng of ["NONE", "TECHNICAL", "INTERMEDIATE", "ADVANCED"] as const) {
    const r = await scoreJob(makeJob({ english: eng }), candidate);
    assert.ok(r.score >= 0 && r.score <= 100);
  }
});

test("o PDF determina a aderência e aliases não inflam a correspondência", async () => {
  const resume = { technologies: ["node", "node.js", "c#"], experienceYears: 2, experienceLevel: "junior" };
  const compatible = await scoreJob(makeJob({ technologies: ["node.js", "node", "c#"] }), candidate, resume);
  const unrelated = await scoreJob(makeJob({ technologies: ["react", "typescript", "sql"] }), candidate, resume);
  assert.equal(compatible.breakdown.find((item) => item.category === "resumeMatch")?.points, 70);
  assert.equal(unrelated.breakdown.find((item) => item.category === "resumeMatch")?.points, 0);
  assert.ok(compatible.score > unrelated.score);
});
