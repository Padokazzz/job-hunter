import type { RawJob } from "../jobs/normalize.js";
import type { SourceAdapter } from "./types.js";
import { logger } from "../shared/logger.js";

// GeekHunter: SPA (React/Next) — o HTML estatico nao contem os cards.
// Usamos Playwright (browser headless) para renderizar e extrair os cards.
// O envio por browser nunca contorna CAPTCHA/anti-bot e e somente leitura.
const BASE = "https://www.geekhunter.com/pt/vagas";

interface RawCard {
  href: string;
  title: string;
  ps: string[];
  text: string[];
}

function humanizeCompany(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function parseCard(c: RawCard): RawJob | null {
  if (!c.href || !c.title) return null;
  const slugMatch = c.href.match(/\/pt\/([^/]+)\/jobs\//);
  const companySlug = slugMatch ? slugMatch[1] : "";
  const externalIdMatch = c.href.match(/\/jobs\/(.+?)(?:[\?#]|$)/);
  const externalId = externalIdMatch && externalIdMatch[1] ? externalIdMatch[1] : c.href;

  const senRx = /est[aá]gio|trainee|j[uú]nior|pleno|s[eê]nior|gerente|tech\s*lead|coordenador|diretor|head|especialista|s[ée]nior/i;
  const modelRx = /remoto|h[íi]brido|presencial/i;
  const locRx = /brasil|,?\s*[a-z]{2},?\s*brasil| - /i;

  let seniority = "";
  let workModel = "";
  let location = "";
  for (const p of c.ps) {
    if (!seniority && senRx.test(p)) seniority = p;
    else if (!workModel && modelRx.test(p)) workModel = p;
    else if (!location && locRx.test(p) && !modelRx.test(p)) location = p;
  }

  // Habilidades: itens apos o cabecalho "Requisitos" ate "Publicada" (ou fim).
  const skills: string[] = [];
  const reqIdx = c.text.findIndex((t) => /requisitos/i.test(t));
  if (reqIdx >= 0) {
    for (let i = reqIdx + 1; i < c.text.length; i++) {
      const t = c.text[i];
      if (!t) continue;
      if (/publicada/i.test(t)) break;
      if (/^\+\d+/.test(t)) continue; // ex.: "+10"
      if (t.length <= 40) skills.push(t);
    }
  }

  // Descricao: paragrafo apos "Tarefas e Responsabilidades" ate "Requisitos".
  let description = c.ps.find((p) => p.length > 60) || c.title;
  const tasksIdx = c.text.findIndex((t) => /tarefas e responsabilidades/i.test(t));
  const reqIdx2 = c.text.findIndex((t) => /requisitos/i.test(t));
  if (tasksIdx >= 0 && reqIdx2 > tasksIdx) {
    description = c.text.slice(tasksIdx + 1, reqIdx2).join(" ");
  }

  const company = companySlug ? humanizeCompany(companySlug) : "Desconhecida";
  const techLine = skills.length ? "\nHabilidades: " + skills.join(", ") : "";
  // RawJob nao tem campos de senioridade/modelo/local, entao incluimos no
  // texto para que o normalize os detecte a partir da descricao.
  const metaLine = [seniority, workModel, location].filter(Boolean).join(". ");
  const descriptionFull = [metaLine, description, techLine].filter(Boolean).join(". ").trim();

  return {
    source: "geekhunter",
    externalId,
    url: c.href,
    company,
    title: c.title,
    description: descriptionFull,
    location: location || undefined,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    publishedAt: null,
  };
}

export class GeekHunterSource implements SourceAdapter {
  readonly id = "geekhunter";
  readonly name = "GeekHunter";
  readonly enabled = true;
  note = "Coletor baseado em browser (Playwright) do GeekHunter (SPA).";

  async collect(): Promise<RawJob[]> {
    let chromium: typeof import("playwright")["chromium"] | null = null;
    try {
      chromium = (await import("playwright")).chromium;
    } catch (e) {
      this.note = "Playwright nao instalado — GeekHunter desabilitado.";
      logger.warn("[geekhunter] Playwright indisponivel; fonte desabilitada (retorna vazio).");
      return [];
    }

    let browser;
    try {
      browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    } catch (e) {
      logger.warn(`[geekhunter] falha ao iniciar o browser: ${(e as Error).message}`);
      return [];
    }

    try {
      const page = await browser.newPage({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      });
      await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForSelector('li[id^="job-"]', { timeout: 30000 });

      // Rola a pagina para tentar carregar mais cards (lazy/infinite scroll).
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(800);
      }

      const cards: RawCard[] = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('li[id^="job-"]')) as Array<HTMLElement>;
        return nodes.map((card) => {
          const a = card.querySelector("h3 a") as HTMLElement | null;
          const href = a ? (a.getAttribute("href") || "") : "";
          const title = a ? a.innerText.trim() : "";
          const ps = Array.from(card.querySelectorAll("p") as NodeListOf<HTMLElement>).map((p) => p.innerText.trim()).filter(Boolean);
          const text = card.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
          return { href, title, ps, text };
        });
      });

      const jobs = cards.map(parseCard).filter((j): j is RawJob => j !== null);
      logger.info(`[geekhunter] ${jobs.length} vagas extraidas (browser)`);
      return jobs;
    } catch (e) {
      logger.warn(`[geekhunter] erro na coleta: ${(e as Error).message}`);
      return [];
    } finally {
      await browser.close();
    }
  }
}
