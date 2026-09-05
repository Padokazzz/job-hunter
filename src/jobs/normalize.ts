import type { NormalizedJob, WorkModel, Seniority, English } from "./types.js";

export interface RawJob {
  source: string;
  externalId: string;
  url: string;
  company: string;
  title: string;
  description: string;
  location?: string;
  workModel?: WorkModel;
  employmentType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  publishedAt?: Date | null;
}

// Dicionario canonico de tecnologias -> regex de deteccao (case-insensitive).
const TECH_DICT: Array<[string, RegExp]> = [
  ["node.js", /\bnode(\.js)?\b|\bnodejs\b/i],
  ["typescript", /\btypescript\b|\bts\b/i],
  ["javascript", /\bjavascript\b|\bjs\b/i],
  ["react", /\breact(js)?\b/i],
  ["next.js", /\bnext\.?js\b/i],
  ["react native", /\breact native\b/i],
  ["flutter", /\bflutter\b/i],
  [".net", /\b\.?net\b|\bdotnet\b/i],
  ["c#", /\bc#\b|\bcsharp\b/i],
  ["sql", /\bsql\b/i],
  ["sql server", /\bsql server\b|\bmssql\b/i],
  ["postgresql", /\bpostgre?s?ql\b|\bpostgres\b/i],
  ["mongodb", /\bmongo(db)?\b/i],
  ["redis", /\bredis\b/i],
  ["rest", /\brest\b|\brestful\b|\brest api\b/i],
  ["graphql", /\bgraphql\b/i],
  ["docker", /\bdocker\b/i],
  ["aws", /\baws\b|\bamazon web services\b/i],
  ["azure", /\bazure\b/i],
  ["gcp", /\bgcp\b|\bgoogle cloud\b/i],
  ["ci/cd", /\bci\/cd\b|\bci cd\b/i],
  ["git", /\bgit\b|\bgithub\b|\bgitlab\b/i],
  ["signalr", /\bsignalr\b/i],
  ["websockets", /\bwebsocket/i],
  ["java", /\bjava\b(?!script)/i],
  ["php", /\bphp\b/i],
  ["go", /\bgo(lang)?\b/i],
  ["rust", /\brust\b/i],
  ["python", /\bpython\b/i],
  ["kubernetes", /\bkubernetes\b|\bk8s\b/i],
];

function detectTechs(text: string): string[] {
  const found = new Set<string>();
  for (const [name, re] of TECH_DICT) {
    if (re.test(text)) found.add(name);
  }
  return [...found];
}

function detectWorkModel(title: string, description: string, location: string): WorkModel {
  const combined = `${location} ${description} ${title}`;
  if (/\bremot[aoe]?\b|\b100%\s*remot/i.test(combined)) return "REMOTE";
  if (/\bh[íi]brid[oa]\b|\bhybrid\b/i.test(combined)) return "HYBRID";
  if (/\bpresencial\b|\bonsite\b|\bin.loc?al\b|\bno escrit[óo]rio\b/i.test(combined)) return "ONSITE";
  return "UNKNOWN";
}

function detectSeniority(title: string, description: string): Seniority {
  const t = `${title} ${description}`;
  const hasJunior = /\bj[uú]nior\b|\bjr\b|\bjúnior\b/i.test(t);
  const hasPleno = /\bpleno\b|\bmid.level\b|\bmid level\b|\bpl\b/i.test(t);
  const hasSenior = /\bs[eê]nior\b|\bsr\b|\bsênior\b|\btech lead\b|\bespecialista\b|\bprincipal\b/i.test(t);

  if (hasJunior && hasPleno) return "JUNIOR_PLENO";
  if (hasSenior && !hasJunior) return "SENIOR";
  if (hasJunior) return "JUNIOR";
  if (hasPleno) return "PLENO";
  return "UNKNOWN";
}

function detectEnglish(text: string): English {
  if (/\bingl[eê]s avan[çc]ado\b|\badvanced english\b|\bfluent( english| in english)?\b|\bnative english\b|\benglish fluency\b|\bfull professional english\b/i.test(text)) {
    return "ADVANCED";
  }
  if (/\bingl[eê]s intermedi[áa]rio\b|\bintermediate english\b/i.test(text)) {
    return "INTERMEDIATE";
  }
  if (/\bingl[eê]s t[ée]cnico\b|\bleitura\b.*\bingl[eê]s\b|\benglish (technical|reading|documentation)\b|\benglish (is a |as a )?plus\b|\benglish desej[áa]vel\b|\bdiferencial\b.*\bingl[eê]s\b/i.test(text)) {
    return "TECHNICAL";
  }
  if (/\bingl[eê]s\b|\benglish\b/i.test(text)) {
    return "TECHNICAL";
  }
  return "NONE";
}

function detectSalary(description: string): { salaryMin: number | null; salaryMax: number | null; currency: string | null } {
  const text = description;

  // Padrões BRL (R$)
  const brlPatterns = [
    /R\$\s*([\d.,]+)\s*[-–a]\s*R\$\s*([\d.,]+)/i,
    /R\$\s*([\d.,]+)/i,
    /sal[aá]rio\s*(?:de\s*)?R\$\s*([\d.,]+)/i,
  ];

  // Padrões USD ($)
  const usdPatterns = [
    /\$\s*([\d.,]+)\s*[-–a]\s*\$\s*([\d.,]+)/i,
    /\$\s*([\d.,]+)\s*(?:k|mil)?/i,
    /(?:salary|compensation|pay)\s*(?:of\s*)?\$\s*([\d.,]+)/i,
  ];

  // Padrões genéricos (ex: "15.000 - 20.000" ou "15k - 20k")
  const genericPatterns = [
    /([\d.,]+)\s*(?:k|mil)\s*[-–a]\s*([\d.,]+)\s*(?:k|mil)?/i,
    /(?:sal[aá]rio|remunera[çc][ãa]o|compensa[çc][ãa]o)\s*(?:de\s*)?([\d.,]+)\s*[-–a]\s*([\d.,]+)/i,
  ];

  // Tenta BRL
  for (const pattern of brlPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const parse = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
      if (match[2]) {
        return { salaryMin: parse(match[1]), salaryMax: parse(match[2]), currency: "BRL" };
      }
      return { salaryMin: parse(match[1]), salaryMax: null, currency: "BRL" };
    }
  }

  // Tenta USD
  for (const pattern of usdPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const parse = (s: string) => {
        let num = parseFloat(s.replace(/,/g, ""));
        if (match![0].toLowerCase().includes("k")) num *= 1000;
        return num;
      };
      if (match[2]) {
        return { salaryMin: parse(match[1]), salaryMax: parse(match[2]), currency: "USD" };
      }
      return { salaryMin: parse(match[1]), salaryMax: null, currency: "USD" };
    }
  }

  // Tenta genérico
  for (const pattern of genericPatterns) {
    const match = text.match(pattern);
    if (match?.[1] && match[2]) {
      const parse = (s: string) => {
        let num = parseFloat(s.replace(/\./g, "").replace(",", "."));
        if (match![0].toLowerCase().includes("k")) num *= 1000;
        return num;
      };
      return { salaryMin: parse(match[1]), salaryMax: parse(match[2]), currency: "BRL" };
    }
  }

  return { salaryMin: null, salaryMax: null, currency: null };
}

export function normalize(raw: RawJob): NormalizedJob {
  const title = raw.title ?? "";
  const description = raw.description ?? "";
  const location = raw.location ?? "";
  const text = `${title} ${description}`;

  // Tenta extrair salário dos dados diretos ou da descrição
  let salaryMin = raw.salaryMin ?? null;
  let salaryMax = raw.salaryMax ?? null;
  let currency = raw.currency ?? null;

  // Se não tem salário dos dados diretos, tenta extrair da descrição
  if (!salaryMin && !salaryMax) {
    const detected = detectSalary(description);
    salaryMin = detected.salaryMin;
    salaryMax = detected.salaryMax;
    currency = detected.currency;
  }

  // Ignora salários 0 (inválidos)
  if (salaryMin === 0 && salaryMax === 0) {
    salaryMin = null;
    salaryMax = null;
  }

  return {
    source: raw.source,
    externalId: raw.externalId,
    url: raw.url,
    company: raw.company,
    title: title.trim(),
    description: description.trim(),
    location: location.trim(),
    workModel: raw.workModel ?? detectWorkModel(title, description, location),
    employmentType: raw.employmentType ?? null,
    salaryMin,
    salaryMax,
    currency,
    technologies: detectTechs(text),
    seniority: detectSeniority(title, description),
    english: detectEnglish(text),
    publishedAt: raw.publishedAt ?? null,
  };
}
