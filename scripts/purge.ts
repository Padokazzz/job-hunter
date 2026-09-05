import "../src/shared/env.js";

// Limpeza pontual: remove do banco as vagas que NAO passam no filtro global
// (tech + remoto) definido em candidate.filters. Reutiliza evaluateGlobalFilter
// para manter o criterio identico ao da coleta.
//
// MODO SEGURO: por padrao faz ONLY dry-run (nao apaga). Para apagar de verdade:
//   $env:PURGE="1"; npx tsx scripts/purge.ts
import { prisma } from "../src/shared/db.js";
import { candidate } from "../src/config/candidate.js";
import { evaluateGlobalFilter } from "../src/jobs/filter.js";
import type { NormalizedJob } from "../src/jobs/types.js";

async function main() {
  const jobs = await prisma.job.findMany({
    select: { id: true, sourceId: true, title: true, workModel: true, technologies: true, company: true },
  });

  const bySource: Record<string, { total: number; del: number }> = {};
  const toDelete: Array<{ id: string; title: string; company: string; workModel: string | null }> = [];

  for (const j of jobs) {
    const techs = j.technologies ? j.technologies.split(", ").filter(Boolean) : [];
    const passes = evaluateGlobalFilter(
      { title: j.title, workModel: (j.workModel as NormalizedJob["workModel"]), technologies: techs } as NormalizedJob,
      {
        techOnly: candidate.filters.techOnly,
        remoteOnly: candidate.filters.remoteOnly,
        targetKeywords: candidate.targetKeywords,
      },
    ).pass;

    bySource[j.sourceId] = bySource[j.sourceId] || { total: 0, del: 0 };
    bySource[j.sourceId].total++;
    if (!passes) {
      toDelete.push({ id: j.id, title: j.title, company: j.company, workModel: j.workModel });
      bySource[j.sourceId].del++;
    }
  }

  console.log(`Total de vagas: ${jobs.length}`);
  console.log(`Removiveis (fora do filtro tech+remoto): ${toDelete.length}`);
  for (const [s, c] of Object.entries(bySource)) {
    console.log(`  ${s}: ${c.del}/${c.total} seriam removidas`);
  }
  console.log("\nAmostras a remover:");
  toDelete.slice(0, 12).forEach((j) => console.log(`  - ${j.title} @ ${j.company} [${j.workModel ?? "?"}]`));

  if (process.env.PURGE !== "1") {
    console.log("\n[DRY-RUN] Nenhuma vaga foi apagada. Para remover de verdade, rode com PURGE=1.");
    return;
  }

  console.log("\nRemovendo vagas e seus filhos (scoreBreakdown, application)...");
  let n = 0;
  for (const j of toDelete) {
    await prisma.scoreBreakdown.deleteMany({ where: { jobId: j.id } });
    await prisma.application.deleteMany({ where: { jobId: j.id } });
    await prisma.job.delete({ where: { id: j.id } });
    n++;
  }
  console.log(`Concluido. ${n} vagas removidas.`);
}

main()
  .catch((e) => {
    console.error("Erro no purge:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
