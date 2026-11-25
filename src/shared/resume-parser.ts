import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

export interface ParsedResume {
  textContent: string;
  technologies: string[];
  experience: {
    years: number | null;
    level: string | null;
    areas: string[];
  };
  education: {
    degree: string | null;
    field: string | null;
    institution: string | null;
  };
  skills: string[];
}

const TECH_PATTERNS: Record<string, RegExp[]> = {
  "node.js": [/\bnode\.?js\b/i, /\bnode\b/i],
  "typescript": [/\btypescript\b/i, /\bts\b/],
  "javascript": [/\bjavascript\b/i, /\bjs\b/],
  "react": [/\breact\b/i, /\breactjs\b/i],
  "next.js": [/\bnext\.?js\b/i, /\bnext\b/i],
  "vue": [/\bvue\.?js\b/i, /\bvue\b/i],
  "angular": [/\bangular\b/i],
  ".net": [/(?<![\w.])\.net\b/i, /\bdotnet\b/i],
  "c#": [/\bc#(?!\w)/i, /\bcsharp\b/i],
  "python": [/\bpython\b/i],
  "java": [/\bjava\b/i, /\bjava\b(?!script)/i],
  "php": [/\bphp\b/i],
  "ruby": [/\bruby\b/i],
  "go": [/\bgolang\b/i, /\bgo\b/i],
  "rust": [/\brust\b/i],
  "swift": [/\bswift\b/i],
  "kotlin": [/\bkotlin\b/i],
  "flutter": [/\bflutter\b/i],
  "dart": [/\bdart\b/i],
  "react native": [/\breact\s*native\b/i],
  "sql": [/\bsql\b/i, /\bmysql\b/i, /\bpostgresql\b/i, /\bsql\s*server\b/i],
  "postgresql": [/\bpostgresql\b/i, /\bpostgres\b/i],
  "mysql": [/\bmysql\b/i],
  "mongodb": [/\bmongodb\b/i, /\bmongo\b/i],
  "redis": [/\bredis\b/i],
  "docker": [/\bdocker\b/i],
  "kubernetes": [/\bkubernetes\b/i, /\bk8s\b/i],
  "aws": [/\baws\b/i, /\bamazon\b/i],
  "azure": [/\bazure\b/i],
  "gcp": [/\bgcp\b/i, /\bgoogle\s*cloud\b/i],
  "git": [/\bgit\b/i, /\bgithub\b/i, /\bgitlab\b/i],
  "rest": [/\brest\b/i, /\brestful\b/i, /\bapi\b/i],
  "graphql": [/\bgraphql\b/i],
  "html": [/\bhtml\b/i],
  "css": [/\bcss\b/i, /\bsass\b/i, /\bless\b/i],
  "sass": [/\bsass\b/i, /\bscss\b/i],
  "tailwind": [/\btailwind\b/i],
  "bootstrap": [/\bbootstrap\b/i],
  "jquery": [/\bjquery\b/i],
  "express": [/\bexpress\.?js\b/i, /\bexpress\b/i],
  "nest": [/\bnest\.?js\b/i, /\bnestjs\b/i],
  "fastify": [/\bfastify\b/i],
  "django": [/\bdjango\b/i],
  "flask": [/\bflask\b/i],
  "rails": [/\brails\b/i, /\bruby\s*on\s*rails\b/i],
  "laravel": [/\blaravel\b/i],
  "spring": [/\bspring\b/i, /\bspring\s*boot\b/i],
  "signalr": [/\bsignalr\b/i],
  "websockets": [/\bwebsocket\b/i],
  "cicd": [/\bci\/cd\b/i, /\bcontinuous\s*integration\b/i, /\bcontinuous\s*delivery\b/i],
  "devops": [/\bdevops\b/i],
  "agile": [/\bagile\b/i, /\bscrum\b/i, /\bkanban\b/i],
};

const EXPERIENCE_PATTERNS = [
  /(\d{1,2})\+?\s*anos?\s*(de\s*)?experi[êe]ncia/i,
  /experi[êe]ncia\s*(de\s*)?(\d{1,2})\+?\s*anos?/i,
  /(\d{1,2})\+?\s*years?\s*(of\s*)?experience/i,
  /experience\s*(of\s*)?(\d{1,2})\+?\s*years?/i,
];

const SENIORITY_KEYWORDS: Record<string, RegExp[]> = {
  "junior": [/\bj[úu]nior\b/i, /\bjr\.?\b/i],
  "pleno": [/\bpleno\b/i, /\bmid[\s-]level\b/i, /\bintermediate\b/i],
  "senior": [/\bs[êe]nior\b/i, /\bsr\.?\b/i, /\bsenior\b/i, /\blead\b/i, /\btech\s*lead\b/i],
  "estagiario": [/\bestagi[áa]rio\b/i, /\bintern\b/i, /\bstage\b/i],
};

const EDUCATION_PATTERNS = [
  /(?:bacharel|licenciatura|tecnol[óo]gico|technologist)\s*(?:em|in)\s*([^,\n]+)/i,
  /(?:gradua[çc][ãa]o|curso\s*superior)\s*(?:em|in)\s*([^,\n]+)/i,
  /(?:p[óo]s[\s-]gradua[çc][ãa]o|specializ)[^,\n]*(?:em|in)\s*([^,\n]+)/i,
  /(?:mestrado|master)[^,\n]*(?:em|in)\s*([^,\n]+)/i,
  /(?:doutorado|phd)[^,\n]*(?:em|in)\s*([^,\n]+)/i,
];

function extractTechnologies(text: string): string[] {
  const found: string[] = [];
  for (const [tech, patterns] of Object.entries(TECH_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        found.push(tech);
        break;
      }
    }
  }
  return [...new Set(found)];
}

function extractExperience(text: string): ParsedResume["experience"] {
  let years: number | null = null;
  let level: string | null = null;
  const areas: string[] = [];

  for (const pattern of EXPERIENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const numStr = match[1] ?? match[2];
      if (numStr) {
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num >= 0 && num <= 50) {
          years = num;
          break;
        }
      }
    }
  }

  for (const [lvl, patterns] of Object.entries(SENIORITY_KEYWORDS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        level = lvl;
        break;
      }
    }
    if (level) break;
  }

  const areaPatterns = [
    { area: "frontend", pattern: /front[\s-]?end/i },
    { area: "backend", pattern: /back[\s-]?end/i },
    { area: "fullstack", pattern: /full[\s-]?stack/i },
    { area: "mobile", pattern: /mobile/i },
    { area: "devops", pattern: /devops/i },
    { area: "data", pattern: /data\s*(?:science|analytics|engineering)/i },
    { area: "security", pattern: /seguran[çc]a|security/i },
    { area: "cloud", pattern: /cloud/i },
  ];

  for (const { area, pattern } of areaPatterns) {
    if (pattern.test(text)) {
      areas.push(area);
    }
  }

  return { years, level, areas };
}

function extractEducation(text: string): ParsedResume["education"] {
  let degree: string | null = null;
  let field: string | null = null;
  let institution: string | null = null;

  for (const pattern of EDUCATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      field = match[1]?.trim() || null;
      if (/bacharel|licenciatura|gradua/i.test(match[0])) {
        degree = "graduacao";
      } else if (/p[óo]s|specializ/i.test(match[0])) {
        degree = "pos-graduacao";
      } else if (/mestrado|master/i.test(match[0])) {
        degree = "mestrado";
      } else if (/doutorado|phd/i.test(match[0])) {
        degree = "doutorado";
      } else if (/tecnol/i.test(match[0])) {
        degree = "tecnologo";
      }
      break;
    }
  }

  const institutionPatterns = [
    /(?:universidade|univ\.?|instituto|inst\.?|faculdade|fac\.?|college)\s+(?:de\s+)?([^\n,]+)/i,
    /(?:uf[a-z]{2}|usp|unicamp|unesp|puc|fiap|anhembi|fatec|ifsp)/i,
  ];

  for (const pattern of institutionPatterns) {
    const match = text.match(pattern);
    if (match) {
      institution = match[0]?.trim() || null;
      break;
    }
  }

  return { degree, field, institution };
}

function extractSkills(text: string): string[] {
  const softSkills = [
    /lideran[çc]a/i,
    /comunica[çc][ãa]o/i,
    /trabalho\s*em\s*equipe/i,
    /resolu[çc][ãa]o\s*de\s*problemas/i,
    /pensamento\s*cr[ií]tico/i,
    /criatividade/i,
    /adapta[çc][ãa]o/i,
    /proatividade/i,
    /organiza[çc][ãa]o/i,
    /gest[ãa]o\s*de\s*tempo/i,
  ];

  const found: string[] = [];
  for (const pattern of softSkills) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) found.push(match[0].toLowerCase());
    }
  }

  return [...new Set(found)];
}

export async function parseResumeFromPDF(filePath: string): Promise<ParsedResume> {
  return parseResumeFromBuffer(await fs.promises.readFile(filePath));
}

export async function parseResumeFromBuffer(buffer: Buffer): Promise<ParsedResume> {
  const parser = new PDFParse({ data: buffer });
  const text = await parser.getText().then((result) => result.text).finally(() => parser.destroy());

  return {
    textContent: text,
    technologies: extractTechnologies(text),
    experience: extractExperience(text),
    education: extractEducation(text),
    skills: extractSkills(text),
  };
}