// Perfil do candidato para scoring e geracao de candidaturas.
//
// Preferências de coleta e pontuação. A stack deste perfil é usada quando não há PDF base.
// Para dados pessoais (nome, email), use variaveis de ambiente:
//   CANDIDATE_NAME="Seu Nome"
//   CANDIDATE_EMAIL="seu@email.com"
//
// Para customizar stack points, crie um arquivo candidate.local.ts (gitignored)
// ou altere os valores diretamente aqui apos clonar o repo.

export interface CandidateProfile {
  name: string;
  email: string;
  // Tecnologias que agregam pontos de stack, com peso.
  stackPoints: Record<string, number>;
  // Tecnologias que reduzem pontuacao se forem o requisito CENTRAL.
  lowPriorityTechs: string[];
  // Modelo de trabalho preferencial ordenado.
  workModelPreference: Array<"REMOTE" | "HYBRID" | "ONSITE">;
  // Locais considerados aderentes (regex sobre location normalizado).
  preferredLocations: RegExp[];
  // Idioma: ingles avancado obrigatorio elimina/penaliza forte.
  englishAdvancedBlocked: boolean;
  // Palavras-chave de relevancia usadas para prefiltrar vagas.
  targetKeywords: string[];
  // Filtros globais aplicados a TODAS as fontes.
  filters: {
    techOnly: boolean;
    remoteOnly: boolean;
  };
}

function env(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const candidate: CandidateProfile = {
  // Dados pessoais: configure via variaveis de ambiente
  name: env("CANDIDATE_NAME", ""),
  email: env("CANDIDATE_EMAIL", ""),

  // Stack points: customize conforme seu perfil
  stackPoints: {
    "node.js": 10,
    "typescript": 8,
    "react": 8,
    "next.js": 5,
    "sql": 5,
    "rest": 4,
    ".net": 8,
    "c#": 6,
    "flutter": 6,
    "sql server": 5,
    "javascript": 4,
    "docker": 3,
    "aws": 3,
    "react native": 4,
    "mongodb": 2,
    "redis": 2,
    "signalr": 2,
    "websockets": 2,
  },

  lowPriorityTechs: ["java", "php", "go", "rust"],
  workModelPreference: ["REMOTE", "HYBRID", "ONSITE"],
  preferredLocations: [/remot/i, /s[aã]o paulo/i, /sp\b/i, /brasil/i],
  englishAdvancedBlocked: false,

  targetKeywords: [
    "node", "typescript", "javascript", "react", "next", ".net", "c#", "flutter",
    "full stack", "fullstack", "backend", "back-end", "frontend", "front-end",
    "desenvolvedor", "developer", "software", "web", "api", "sql",
    "engineer", "engenheiro", "programmer", "programador", "devops", "arquiteto",
    "architect", "sre", "mobile", "tech lead",
  ],

  filters: {
    techOnly: true,
    remoteOnly: true,
  },
};
