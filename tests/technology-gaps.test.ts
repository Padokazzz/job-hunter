import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeTechnologyGaps } from "../src/jobs/technology-gaps.js";

const job = (id: string, description: string, score = 80) => ({
  id, description, score, title: "Desenvolvimento de software", company: "Empresa",
});

test("conta cada tecnologia uma vez por vaga e ordena exemplos pela aderência", () => {
  const result = analyzeTechnologyGaps("Experiência com Node.js e PostgreSQL", [
    job("a", "NodeJS, PostgreSQL e Docker. Docker é diferencial.", 75),
    job("b", "Docker, Kubernetes e AWS", 93),
    job("c", "Kubernetes, Docker e Next.js", 84),
  ]);
  assert.equal(result.jobCount, 3);
  assert.equal(result.resumeTechnologyCount, 2);
  assert.deepEqual(result.gaps.slice(0, 2).map(({ technology, jobCount, share }) => ({ technology, jobCount, share })), [
    { technology: "docker", jobCount: 3, share: 1 },
    { technology: "kubernetes", jobCount: 2, share: 2 / 3 },
  ]);
  assert.deepEqual(result.gaps[0]!.examples.map(({ id }) => id), ["b", "c", "a"]);
  assert.ok(result.gaps.some((entry) => entry.technology === "next.js"));
  assert.ok(result.gaps.every((entry) => !["node.js", "postgresql", "javascript"].includes(entry.technology)));
});

test("distingue React Native de React e verbos em inglês de Go", () => {
  const result = analyzeTechnologyGaps("React Native, GitHub Actions", [
    job("a", "Go to our site. React and GitHub Actions."),
    job("b", "Go programming and Terraform."),
  ]);
  assert.deepEqual(result.gaps.map((entry) => entry.technology), ["go", "react", "terraform"]);
});

test("retorna uma lista vazia quando não há vagas elegíveis", () => {
  assert.deepEqual(analyzeTechnologyGaps("React", []), { resumeTechnologyCount: 1, jobCount: 0, gaps: [] });
});
