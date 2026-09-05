// EXEMPLO de perfil de curriculo para referencia.
//
// IMPORTANTE: Este arquivo NAO e usado em runtime. O curriculo e carregado
// do banco de dados (upload via dashboard). Este arquivo serve como
// documentacao da estrutura de dados esperada.
//
// Para usar o bot:
// 1. Acesse o dashboard (http://localhost:3000)
// 2. Va em Configuracoes > Upload de Curriculo
// 3. Envie seu curriculo em PDF
// 4. O sistema extraira automaticamente: tecnologias, experiencia, formacao

export interface ResumeExperience {
  company: string;
  role: string;
  period: string;
  highlights: string[];
}

export interface ResumeProfile {
  name: string;
  email: string;
  skills: string[];
  experiences: ResumeExperience[];
  languages: string[];
  certifications: string[];
  education: string[];
  strengths: string[];
}

// Exemplo de estrutura (dados ficticios para documentacao)
export const resumeProfile: ResumeProfile = {
  name: "SEU NOME",
  email: "seu@email.com",
  skills: [
    "typescript",
    "javascript",
    "react",
    "node.js",
    "sql",
    "docker",
    "git",
  ],
  experiences: [
    {
      company: "Empresa Anterior",
      role: "Desenvolvedor",
      period: "Jan/2023 - Atual",
      highlights: [
        "Desenvolvimento de APIs REST",
        "Implementacao de CI/CD",
      ],
    },
  ],
  languages: ["Portugues (nativo)", "Ingles (tecnico)"],
  certifications: ["AWS Cloud Practitioner"],
  education: ["Ciencia da Computacao"],
  strengths: [
    "Experiencia com desenvolvimento full stack",
    "Conhecimento em cloud e DevOps",
  ],
};
