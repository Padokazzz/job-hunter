import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, type RawJob } from "../src/jobs/normalize.js";

function raw(over: Partial<RawJob>): RawJob {
  return {
    source: "test",
    externalId: "x",
    url: "https://example.com",
    company: "C",
    title: "",
    description: "",
    ...over,
  };
}

test("detecta modelo de trabalho remoto/hibrido/presencial", () => {
  assert.equal(normalize(raw({ title: "Dev", description: "vaga remota" })).workModel, "REMOTE");
  assert.equal(normalize(raw({ title: "Dev", description: "modelo hibrido" })).workModel, "HYBRID");
  assert.equal(normalize(raw({ title: "Dev", description: "presencial em SP" })).workModel, "ONSITE");
});

test("detecta senioridade", () => {
  assert.equal(normalize(raw({ title: "Desenvolvedor Junior" })).seniority, "JUNIOR");
  assert.equal(normalize(raw({ title: "Dev Junior/Pleno" })).seniority, "JUNIOR_PLENO");
  assert.equal(normalize(raw({ title: "Engenheiro de Software Pleno" })).seniority, "PLENO");
  assert.equal(normalize(raw({ title: "Arquiteto Senior" })).seniority, "SENIOR");
});

test("detecta ingles avancado vs tecnico", () => {
  assert.equal(normalize(raw({ description: "Fluent English required" })).english, "ADVANCED");
  assert.equal(normalize(raw({ description: "ingles tecnico e leitura" })).english, "TECHNICAL");
  assert.equal(normalize(raw({ description: "sem mencionar idioma" })).english, "NONE");
});

test("detecta stack de tecnologias", () => {
  const t = normalize(raw({ description: "Node.js, TypeScript, React, PostgreSQL e Docker" })).technologies;
  assert.ok(t.includes("node.js"));
  assert.ok(t.includes("typescript"));
  assert.ok(t.includes("react"));
  assert.ok(t.includes("postgresql"));
  assert.ok(t.includes("docker"));
});
