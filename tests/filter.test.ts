import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateGlobalFilter } from "../src/jobs/filter.js";
import type { NormalizedJob } from "../src/jobs/types.js";

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: "programathor",
    externalId: "1",
    url: "https://example.com/1",
    company: "Acme",
    title: "Desenvolvedor Node.js",
    description: "Vaga remota de Node.js",
    location: "Remoto",
    workModel: "REMOTE",
    employmentType: "PJ",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    technologies: ["node.js", "typescript"],
    seniority: "PLENO",
    english: "NONE",
    publishedAt: new Date(),
    ...overrides,
  };
}

const opts = { techOnly: true, remoteOnly: true, targetKeywords: ["node", "desenvolvedor"] };

describe("evaluateGlobalFilter (tech + remoto)", () => {
  test("vagas tech e remotas passam", () => {
    assert.equal(evaluateGlobalFilter(makeJob(), opts).pass, true);
  });

  test("vagas nao-remotas sao filtradas", () => {
    const r = evaluateGlobalFilter(makeJob({ workModel: "ONSITE" }), opts);
    assert.equal(r.pass, false);
    assert.equal(r.reason, "non-remote");
  });

  test("vagas hibridas sao filtradas (remoteOnly)", () => {
    const r = evaluateGlobalFilter(makeJob({ workModel: "HYBRID" }), opts);
    assert.equal(r.pass, false);
    assert.equal(r.reason, "non-remote");
  });

  test("vagas nao-tech sao filtradas", () => {
    const r = evaluateGlobalFilter(
      makeJob({ title: "Controller Financeiro", technologies: [] }),
      opts,
    );
    assert.equal(r.pass, false);
    assert.equal(r.reason, "non-tech");
  });

  test("tech via keyword no titulo (sem technologies) ainda passa", () => {
    const r = evaluateGlobalFilter(makeJob({ technologies: [] }), opts);
    assert.equal(r.pass, true);
  });

  test("remoteOnly=false libera vagas presenciais", () => {
    const r = evaluateGlobalFilter(makeJob({ workModel: "ONSITE" }), { ...opts, remoteOnly: false });
    assert.equal(r.pass, true);
  });

  test("techOnly=false libera vagas nao-tech", () => {
    const r = evaluateGlobalFilter(
      makeJob({ title: "Controller Financeiro", technologies: [] }),
      { ...opts, techOnly: false },
    );
    assert.equal(r.pass, true);
  });
});
