import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCard as parseProgramathor } from "../src/sources/programathor.js";
import { parseCard as parseGeekHunter } from "../src/sources/geekhunter.js";
import { parseIndeedCard } from "../src/sources/indeed.js";
import { parseGupyJob } from "../src/sources/gupy.js";
import { parseRemotiveJob } from "../src/sources/remotive.js";
import { parseJobicyJob } from "../src/sources/jobicy.js";

describe("Programathor parseCard (empresa)", () => {
  const innerWithBriefcase = `
    <div class='logo-list'><img alt="LOLDESIGN Soluções Digitais LTDA" src="x"/></div>
    <h3 class='text-24 line-height-30'>Desenvolvedor Back-End Senior (AI Engineer)</h3>
    <div class='cell-list-content-icon'>
      <span><i class='fa fa-briefcase'></i>LOLDESIGN Soluções Digitais LTDA</span>
      <span><i class='fas fa-map-marker-alt'></i>Remoto</span>
      <span><i class='fa fa-building'></i>Pequena/média empresa</span>
      <span><i class='far fa-chart-bar'></i>Sênior</span>
      <span><i class='far fa-file-alt'></i>PJ</span>
    </div>
    <div><span class='tag-list background-gray'>API</span><span class='tag-list background-gray'>Flask</span></div>`;

  test("extrai empresa do span fa-briefcase", () => {
    const j = parseProgramathor("/jobs/33685-x", innerWithBriefcase);
    assert.ok(j);
    assert.equal(j!.company, "LOLDESIGN Soluções Digitais LTDA");
    assert.equal(j!.location, "Remoto");
    assert.ok(j!.description.includes("Sênior"));
    assert.ok(j!.description.includes("PJ"));
    assert.equal(j!.title, "Desenvolvedor Back-End Senior (AI Engineer)");
  });

  test("fallback para alt do img quando nao ha briefcase", () => {
    const inner = `<img alt="Empresa X LTDA"/><h3 class='x'>Dev</h3>
      <span><i class='fas fa-map-marker-alt'></i>São Paulo</span>
      <span><i class='far fa-chart-bar'></i>Pleno</span>
      <span><i class='far fa-file-alt'></i>CLT</span>`;
    const j = parseProgramathor("/jobs/1-y", inner);
    assert.ok(j);
    assert.equal(j!.company, "Empresa X LTDA");
  });

  test("Desconhecida quando nao ha nome da empresa", () => {
    const inner = `<h3 class='x'>Dev</h3><span><i class='fas fa-map-marker-alt'></i>Remoto</span>`;
    const j = parseProgramathor("/jobs/2-z", inner);
    assert.ok(j);
    assert.equal(j!.company, "Desconhecida");
  });
});

describe("GeekHunter parseCard (browser)", () => {
  const card = {
    href: "https://www.geekhunter.com/pt/suprema-group/jobs/head-de-dados-1",
    title: "Head de Dados",
    ps: [
      "GERENTE", "PRESENCIAL", "Sorocaba, SP, Brasil",
      "Tarefas e Responsabilidades",
      "Sobre nós Somos uma empresa de iGaming.",
      "Requisitos", "Data Warehouse", "LGPD", "Streaming", "IaC", "SQL", "Python", "+10",
      "Publicada há 1 hora",
    ],
    text: [
      "Head de Dados", "GERENTE", "PRESENCIAL", "Sorocaba, SP, Brasil",
      "Tarefas e Responsabilidades",
      "Sobre nós Somos uma empresa de iGaming.",
      "Requisitos", "Data Warehouse", "LGPD", "Streaming", "IaC", "SQL", "Python", "+10",
      "Publicada há 1 hora",
    ],
  };

  test("mapeia campos do card renderizado", () => {
    const j = parseGeekHunter(card);
    assert.ok(j);
    assert.equal(j!.company, "Suprema Group");
    assert.equal(j!.externalId, "head-de-dados-1");
    assert.equal(j!.location, "Sorocaba, SP, Brasil");
    assert.ok(j!.description.includes("GERENTE"));
    assert.ok(j!.description.includes("Sobre nós"));
    assert.ok(j!.description.includes("Habilidades: Data Warehouse, LGPD"));
    assert.ok(!j!.description.includes("+10"));
  });

  test("ignora card sem titulo", () => {
    assert.equal(parseGeekHunter({ href: "", title: "", ps: [], text: [] }), null);
  });
});

describe("Indeed parseIndeedCard", () => {
  test("monta url de view a partir do jk", () => {
    const j = parseIndeedCard({
      title: "Desenvolvedor Node.js Remoto",
      href: "/rc/clk?jk=ABC123&x=1",
      company: "Acme",
      location: "Remoto",
      description: "Node, TypeScript",
    });
    assert.ok(j);
    assert.equal(j!.source, "indeed");
    assert.equal(j!.externalId, "https://br.indeed.com/jobs/view?jk=ABC123");
    assert.equal(j!.url, "https://br.indeed.com/jobs/view?jk=ABC123");
    assert.equal(j!.company, "Acme");
    assert.ok(j!.description.includes("Remoto"));
    assert.ok(j!.description.includes("TypeScript"));
  });

  test("ignora sem titulo/href", () => {
    assert.equal(parseIndeedCard({ title: "", href: "", company: "", location: "", description: "" }), null);
  });
});

describe("Gupy parseGupyJob (MCP)", () => {
  test("mapeia vaga do MCP", () => {
    const j = parseGupyJob({
      id: 123,
      name: "Dev .NET",
      careerPageName: "Empresa X",
      jobUrl: "https://vagas.exemplo.gupy.io/job/abc",
      city: "São Paulo",
      state: "São Paulo",
      workplaceType: "remote",
      description: "C# e .NET",
      type: "vacancy_type_effective",
      publishedDate: "2024-01-01T00:00:00.000Z",
    });
    assert.ok(j);
    assert.equal(j!.source, "gupy");
    assert.equal(j!.externalId, "123");
    assert.equal(j!.url, "https://vagas.exemplo.gupy.io/job/abc");
    assert.equal(j!.company, "Empresa X");
    assert.equal(j!.title, "Dev .NET");
    assert.ok(j!.description.includes("remote"));
    assert.ok(j!.description.includes("São Paulo"));
  });

  test("ignora sem id ou nome", () => {
    assert.equal(parseGupyJob({}), null);
    assert.equal(parseGupyJob({ id: 1 }), null);
  });
});

describe("Remotive parseRemotiveJob", () => {
  test("mapeia vaga remota", () => {
    const j = parseRemotiveJob({
      id: 2091105,
      url: "https://remotive.com/remote-jobs/flutter-dev",
      title: "Flutter Developer",
      company_name: "Acme",
      candidate_required_location: "Brazil",
      salary: "$2000/mo",
      description: "<p>Flutter e Dart</p>",
    });
    assert.ok(j);
    assert.equal(j!.source, "remotive");
    assert.equal(j!.title, "Flutter Developer");
    assert.equal(j!.company, "Acme");
    assert.equal(j!.location, "Brazil");
    assert.ok(j!.description.includes("Flutter"));
  });

  test("ignora sem titulo/url", () => {
    assert.equal(parseRemotiveJob({ title: "", url: "" }), null);
  });
});

describe("Jobicy parseJobicyJob", () => {
  test("mapeia vaga remota", () => {
    const j = parseJobicyJob({
      id: 151565,
      url: "https://jobicy.com/jobs/node-dev",
      jobTitle: "Node.js Engineer",
      companyName: "Globex",
      jobGeo: "Worldwide",
      jobExcerpt: "<p>Node.js e TypeScript</p>",
      jobDescription: "<p>Remote</p>",
    });
    assert.ok(j);
    assert.equal(j!.source, "jobicy");
    assert.equal(j!.title, "Node.js Engineer");
    assert.equal(j!.company, "Globex");
    assert.equal(j!.location, "Worldwide");
    assert.ok(j!.description.includes("Node.js"));
  });

  test("ignora sem titulo/url", () => {
    assert.equal(parseJobicyJob({ jobTitle: "", url: "" }), null);
  });
});
