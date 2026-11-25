import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPostingLanguage } from "../src/jobs/posting-language.js";

test("descrição em português pode ter título em inglês e exigir inglês", () => {
  assert.equal(detectPostingLanguage("Software Engineer", "Buscamos uma pessoa para atuar com nossa equipe. Desejável inglês fluente."), "pt");
});

test("descrição inglesa prevalece sobre título e localidade em português", () => {
  assert.equal(detectPostingLanguage("Pessoa desenvolvedora", "Remoto Brasil. Join our team. You will help us make the product better for our customers."), "en");
});

test("reconhece títulos locais e separa anúncios ambíguos ou em outros idiomas", () => {
  assert.equal(detectPostingLanguage("Desenvolvedor React", "React, TypeScript"), "pt");
  assert.equal(detectPostingLanguage("React / TypeScript", "Full Stack, remoto, Brasil"), "unknown");
  assert.equal(detectPostingLanguage("Desarrollador de software", "Buscamos desarrollador para nuestro equipo con tres años de experiencia y conocimientos."), "other");
});
