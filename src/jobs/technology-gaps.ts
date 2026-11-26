import { detectTechs } from "./normalize.js";

const supplemental: Record<string, RegExp> = {
  angular: /\bangular(?:js)?\b/i,
  vue: /\bvue(?:\.?js)?\b/i,
  svelte: /\bsvelte(?:kit)?\b/i,
  tailwind: /\btailwind(?:\s*css)?\b/i,
  html: /\bhtml5?\b/i,
  css: /\bcss3?\b/i,
  sass: /\bs[ac]ss\b/i,
  nestjs: /\bnest\.?js\b/i,
  express: /\bexpress\.?js\b/i,
  fastify: /\bfastify\b/i,
  "spring boot": /\bspring\s+boot\b/i,
  laravel: /\blaravel\b/i,
  fastapi: /\bfastapi\b/i,
  flask: /\bflask\b/i,
  ruby: /\bruby\b/i,
  "ruby on rails": /\bruby\s+on\s+rails\b/i,
  kotlin: /\bkotlin\b/i,
  swift: /\bswift\b/i,
  mysql: /\bmysql\b/i,
  sqlite: /\bsqlite\b/i,
  supabase: /\bsupabase\b/i,
  firebase: /\bfirebase\b/i,
  prisma: /\bprisma\s+orm\b|\bprisma\b/i,
  terraform: /\bterraform\b/i,
  ansible: /\bansible\b/i,
  "github actions": /\bgithub\s+actions\b/i,
  jenkins: /\bjenkins\b/i,
  kafka: /\b(?:apache\s+)?kafka\b/i,
  rabbitmq: /\brabbitmq\b/i,
  elasticsearch: /\belasticsearch\b/i,
  prometheus: /\bprometheus\b/i,
  grafana: /\bgrafana\b/i,
  opentelemetry: /\bopentelemetry\b/i,
  playwright: /\bplaywright\b/i,
  cypress: /\bcypress\b/i,
  jest: /\bjest\b/i,
  vitest: /\bvitest\b/i,
  pytest: /\bpytest\b/i,
  junit: /\bjunit\b/i,
  xunit: /\bxunit\b/i,
  "c++": /\bc\+\+(?!\w)/i,
};

function technologyMentions(text: string): Set<string> {
  // Keep the evidence for this report narrower than the signals used in ranking.
  const core = detectTechs(text.replace(/\breact(?:\s+|-)native\b/gi, "ReactNative"));
  const technologies = new Set(core.filter((technology) => !["devops", "javascript", "go"].includes(technology)));
  if (/\bjavascript\b|(?:^|[,;(])\s*JS(?=\s*[,;)]|$)/im.test(text)) technologies.add("javascript");
  if (/\b(?:golang|go\s+language|go\s+programming|linguagem\s+go)\b/i.test(text) || /(?:^|[,;(])\s*Go(?=\s*[,;)]|$)/m.test(text)) {
    technologies.add("go");
  }
  if (/\breact(?:\s+|-)native\b/i.test(text)) technologies.add("react native");
  for (const [name, match] of Object.entries(supplemental)) {
    if (match.test(text)) technologies.add(name);
  }
  return technologies;
}

interface GapJob {
  id: string;
  title: string;
  company: string;
  description: string;
  score: number;
}

export function analyzeTechnologyGaps(resumeText: string, jobs: readonly GapJob[]) {
  const known = technologyMentions(resumeText);
  const byTechnology = new Map<string, {
    technology: string;
    jobCount: number;
    examples: Omit<GapJob, "description">[];
  }>();

  for (const { description, ...job } of [...jobs].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) {
    for (const technology of technologyMentions(job.title + "\n" + description)) {
      if (known.has(technology)) continue;
      const entry = byTechnology.get(technology) ?? { technology, jobCount: 0, examples: [] };
      entry.jobCount++;
      if (entry.examples.length < 3) entry.examples.push(job);
      byTechnology.set(technology, entry);
    }
  }

  return {
    resumeTechnologyCount: known.size,
    jobCount: jobs.length,
    gaps: [...byTechnology.values()]
      .sort((a, b) => b.jobCount - a.jobCount || a.technology.localeCompare(b.technology))
      .map((entry) => ({ ...entry, share: entry.jobCount / jobs.length })),
  };
}
