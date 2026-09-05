import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

// Guard de seguranca (Fase 2, regra critica):
// - Nunca opera em Postgres (Supabase) sem confirmacao explicita de que e o
//   NOVO projeto exclusivo do Job Hunter.
// - SQLite e o fallback permitido durante a transicao.
export function assertSafeDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isPostgres = url.startsWith("postgresql://") || url.startsWith("postgres://");

  if (isPostgres) {
    if (process.env.JOBHUNTER_DB_CONFIRMED !== "1") {
      throw new Error(
        "DATABASE_URL aponta para PostgreSQL/Supabase, mas JOBHUNTER_DB_CONFIRMED!=1. " +
          "Confirme que este e o NOVO projeto Supabase exclusivo do Job Hunter antes de prosseguir.",
      );
    }
    logger.warn(
      "SEGURANCA: usando Supabase PostgreSQL. Confirme que este projeto e EXCLUSIVO do Job Hunter " +
        "e que nenhum projeto Supabase existente foi reutilizado/migrado.",
    );
  } else {
    logger.info("Usando SQLite como fallback (transicao). Aponte DATABASE_URL para o novo Supabase para producao.");
  }
}

assertSafeDatabase();

export const prisma = new PrismaClient();
