import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupHash } from "../src/jobs/dedup.js";

test("dedupHash e estavel para a mesma vaga", () => {
  const a = { company: "Empresa A", title: "Dev Jr", location: "Remote" };
  const b = { company: "Empresa A", title: "Dev Jr", location: "Remote" };
  assert.equal(dedupHash(a), dedupHash(b));
});

test("dedupHash diferencia empresas/titulos", () => {
  const a = dedupHash({ company: "A", title: "Dev", location: "Remote" });
  const b = dedupHash({ company: "B", title: "Dev", location: "Remote" });
  const c = dedupHash({ company: "A", title: "Dev Senior", location: "Remote" });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("dedupHash e case/acento insensivel", () => {
  const a = dedupHash({ company: "Empresa Ação", title: "Desenvolvedor", location: "São Paulo" });
  const b = dedupHash({ company: "empresa acao", title: "desenvolvedor", location: "sao paulo" });
  assert.equal(a, b);
});
