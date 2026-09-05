import type { RawJob } from "../jobs/normalize.js";

// Contrato de uma fonte de vagas. A fonte SO de coleta (source -> raw -> Job).
// Nunca faz scoring nem candidatura (doc Fase 2).
export interface SourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  note?: string;
  // Coleta vagas brutas. Deve lancar erro se a fonte falhar (o pipeline trata
  // a falha de forma isolada, sem derrubar as outras fontes).
  collect(): Promise<RawJob[]>;
}
