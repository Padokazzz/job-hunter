import type { RawJob } from "../jobs/normalize.js";
import { logger } from "../shared/logger.js";

// Base comum para coletores que exigem browser (SPA ou anti-bot).
// Reutiliza o padrao do GeekHunter: import dinamico do Playwright, graceful
// degrade se o Playwright faltar, e injecao opcional de cookie de sessao
// (via env) para fontes que exigem login. NUNCA contorna CAPTCHA/anti-bot:
// se um desafio aparecer, a coleta retorna [] com aviso.
export interface BrowserCollectOptions {
  id: string;
  name: string;
  url: string;
  waitSelector: string;
  // Se definido, a fonte so coleta se a env var existir (cookie de sessao).
  authEnvVar?: string;
  // Headers extras (ex.: cookie de sessao cru "k=v; k2=v2").
  authCookie?: string;
  // Textos que indicam bloqueio/captcha -> aborta com [] + aviso.
  antiBotMarkers?: string[];
  userAgent?: string;
  timeout?: number;
  // Funcao roda DENTRO do browser (serializavel). Deve retornar structs
  // simples; o mapeamento para RawJob acontece no Node (testavel).
  extract: (page: unknown) => Promise<Array<Record<string, string>>>;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export async function browserCollect(opts: BrowserCollectOptions): Promise<Array<Record<string, string>>> {
  let cookie = opts.authCookie;
  if (opts.authEnvVar) {
    cookie = process.env[opts.authEnvVar] || cookie;
    if (!cookie) {
      logger.warn(`[${opts.id}] auth ausente (${opts.authEnvVar}); fonte desabilitada.`);
      return [];
    }
  }

  let chromium: typeof import("playwright")["chromium"] | null = null;
  try {
    chromium = (await import("playwright")).chromium;
  } catch {
    logger.warn(`[${opts.id}] Playwright indisponivel; fonte desabilitada (retorna vazio).`);
    return [];
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
  } catch (e) {
    logger.warn(`[${opts.id}] falha ao iniciar o browser: ${(e as Error).message}`);
    return [];
  }

  try {
    const context = await browser.newContext({
      userAgent: opts.userAgent || DEFAULT_UA,
      locale: "pt-BR",
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: cookie ? { Cookie: cookie } : {},
    });
    const page = await context.newPage();
    // Reduz deteccao de automacao (webdriver).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: opts.timeout || 60000 });

    if (opts.antiBotMarkers?.length) {
      const html = await page.content();
      if (opts.antiBotMarkers.some((m) => html.toLowerCase().includes(m.toLowerCase()))) {
        logger.warn(`[${opts.id}] desafio anti-bot/captcha detectado; abortando coleta (sem contornar).`);
        return [];
      }
    }

    try {
      await page.waitForSelector(opts.waitSelector, { timeout: 30000 });
    } catch {
      logger.warn(`[${opts.id}] seletor de vagas nao apareceu (possivel bloqueio ou estrutura mudou).`);
    }

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);
    }

    const structs = await opts.extract(page);
    logger.info(`[${opts.id}] ${structs.length} itens extraidos (browser)`);
    return structs;
  } catch (e) {
    logger.warn(`[${opts.id}] erro na coleta: ${(e as Error).message}`);
    return [];
  } finally {
    await browser.close();
  }
}
