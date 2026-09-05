import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Carrega variaveis de ambiente de .env. Nenhum valor de env e registrado em log.
function loadEnvFileSafe(name: string): void {
  const abs = resolve(process.cwd(), name);
  if (!existsSync(abs)) return;
  const load = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (typeof load === "function") {
    try {
      load(abs);
    } catch {
      // ignore arquivos malformados
    }
  }
}

loadEnvFileSafe(".env");
