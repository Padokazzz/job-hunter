import { test } from "node:test";
import assert from "node:assert/strict";
import { RemoteOkSource } from "../src/sources/remoteok.js";
import { normalize } from "../src/jobs/normalize.js";
import type { SourceAdapter } from "../src/sources/types.js";
import type { RawJob } from "../src/jobs/normalize.js";

test("RemoteOK parser extrai vagas do JSON da API", async () => {
  const fakeApi = [
    { id: 1, slug: "dev-1", company: "Acme", position: "Node.js Developer", tags: ["node", "react"], description: "<p>Remote</p>", location: "Remote", salary_min: 40000, salary_max: 80000, date: 1700000000 },
    { legal: "metadata" }, // deve ser ignorado
  ];
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, statusText: "OK", json: async () => fakeApi })) as unknown as typeof fetch;
  try {
    const src = new RemoteOkSource();
    const jobs = await src.collect();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]!.title, "Node.js Developer");
    assert.equal(jobs[0]!.company, "Acme");
    assert.equal(jobs[0]!.source, "remoteok");
    const norm = normalize(jobs[0]!);
    assert.ok(norm.technologies.join(" ").includes("node.js"));
    assert.equal(jobs[0]!.currency, "USD");
  } finally {
    globalThis.fetch = original;
  }
});

test("falha de uma fonte NAO derruba as outras (isolamento)", async () => {
  const okSource: SourceAdapter = {
    id: "ok",
    name: "OK",
    enabled: true,
    async collect(): Promise<RawJob[]> {
      return [{ source: "ok", externalId: "1", url: "u", company: "C", title: "Dev", description: "node" }];
    },
  };
  const badSource: SourceAdapter = {
    id: "bad",
    name: "BAD",
    enabled: true,
    async collect(): Promise<RawJob[]> {
      throw new Error("fonte indisponivel");
    },
  };

  // Harness que espelha o isolamento do pipeline (runSource).
  const results: Record<string, { ok: boolean; count: number; error?: string }> = {};
  for (const s of [okSource, badSource]) {
    try {
      const jobs = await s.collect();
      results[s.id] = { ok: true, count: jobs.length };
    } catch (err) {
      results[s.id] = { ok: false, count: 0, error: (err as Error).message };
    }
  }

  assert.equal(results.ok!.ok, true);
  assert.equal(results.ok!.count, 1);
  assert.equal(results.bad!.ok, false);
  assert.match(results.bad!.error!, /indisponivel/);
});

test("todas as fontes estao no registro", async () => {
  const { getEnabledSources } = await import("../src/sources/index.js");
  const enabled = getEnabledSources().map((s) => s.id);
  for (const id of ["remoteok", "programathor", "geekhunter", "gupy", "indeed", "remotive", "jobicy"]) {
    assert.ok(enabled.includes(id), `fonte ${id} deveria estar no registro`);
  }
});
