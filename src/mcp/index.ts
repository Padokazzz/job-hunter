import type { RawJob } from "../jobs/normalize.js";
import { sources } from "../sources/index.js";
import { logger } from "../shared/logger.js";

// ============================================================================
// Camada MCP (Model Context Protocol / ferramentas de coleta) — Fase 2.
//
// REGRA: na Fase 2 o MCP serve APENAS para COLETAR/DESCOBRIR informacao.
// Um MCP NUNCA altera uma candidatura e NUNCA envia aplicacao automatica.
// A automacao de candidatura fica para a Fase 4, fora deste escopo.
// ============================================================================

export interface DiscoveryMCP {
  name: string;
  // Descobre vagas brutas de uma fonte. Read-only.
  discover(sourceId: string): Promise<RawJob[]>;
}

export interface BrowserMCP {
  name: string;
  // Reservado para Fase 4 (navegacao/coleta com renderizacao).
  navigate(_url: string): Promise<never>;
}

export interface AuthMCP {
  name: string;
  // Reservado para fontes que exigem login (Indeed, Vagas.com).
  // Obs.: Gupy agora usa o MCP oficial publico (sem login) em src/sources/gupy.ts.
  login(_sourceId: string): Promise<never>;
}

class DefaultDiscoveryMCP implements DiscoveryMCP {
  readonly name = "discovery";
  async discover(sourceId: string): Promise<RawJob[]> {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) throw new Error(`Fonte nao encontrada: ${sourceId}`);
    logger.debug(`[mcp:discovery] coletando ${sourceId}`);
    return source.collect();
  }
}

class NotImplementedBrowserMCP implements BrowserMCP {
  readonly name = "browser";
  async navigate(_url: string): Promise<never> {
    throw new Error("BrowserMCP nao implementado na Fase 2 (apenas coleta read-only).");
  }
}

class NotImplementedAuthMCP implements AuthMCP {
  readonly name = "auth";
  async login(_sourceId: string): Promise<never> {
    throw new Error("AuthMCP nao implementado na Fase 2 (fontes com auth ficam para Fase futura).");
  }
}

export const discoveryMCP: DiscoveryMCP = new DefaultDiscoveryMCP();
export const browserMCP: BrowserMCP = new NotImplementedBrowserMCP();
export const authMCP: AuthMCP = new NotImplementedAuthMCP();

export const mcpRegistry = {
  discovery: discoveryMCP,
  browser: browserMCP,
  auth: authMCP,
};
