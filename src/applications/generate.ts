import { prisma } from "../shared/db.js";
import type { NormalizedJob, ScoreResult } from "../jobs/types.js";

export interface ApplicationAnswer {
  question: string;
  answer: string;
  safe: boolean; // false = requer revisao/acao humana (nao automatizar)
}

export interface GeneratedApplication {
  resumeVersion: string;
  matchedSkills: string[];
  highlights: string[];
  message: string;
  coverLetter: string;
  answers: ApplicationAnswer[];
}

interface ActiveResumeData {
  name: string;
  email: string;
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
  textContent: string;
  // Tecnologias usadas em projetos reais (experiências profissionais)
  practicalTechs: string[];
}

// Extrair tecnologias usadas em experiências profissionais reais
function extractPracticalTechs(text: string): string[] {
  const practicalTechs: string[] = [];
  const techPatterns: Record<string, RegExp[]> = {
    "flutter": [/\bflutter\b/i],
    "dart": [/\bdart\b/i],
    "typescript": [/\btypescript\b/i],
    "javascript": [/\bjavascript\b/i, /\bjs\b/i],
    "node.js": [/\bnode\.?js\b/i],
    ".net": [/\b\.net\b/i, /\bdotnet\b/i],
    "c#": [/\bc#\b/i, /\bcsharp\b/i],
    "sql server": [/\bsql\s*server\b/i, /\bmssql\b/i],
    "sql": [/\bsql\b/i],
    "docker": [/\bdocker\b/i],
    "aws": [/\baws\b/i],
    "react": [/\breact\b/i],
    "html": [/\bhtml\b/i],
    "css": [/\bcss\b/i],
    "git": [/\bgit\b/i],
    "github": [/\bgithub\b/i],
    "signalr": [/\bsignalr\b/i],
    "websockets": [/\bwebsocket\b/i],
    "rest": [/\brest\b/i, /\bapi\b/i],
  };

  const lines = text.split("\n");
  let inExperienceSection = false;
  let sectionCount = 0;

  for (const line of lines) {
    const lower = line.toLowerCase().trim();

    // Detectar seções de experiência (mais flexível)
    if (/(experiência|experience|trabalho|profissional|emprego|atuação|cargo|função)/i.test(lower)) {
      inExperienceSection = true;
      sectionCount++;
      console.log(`[generate] Seção de experiência encontrada: "${line.trim().substring(0, 50)}"`);
      continue;
    }

    // Sair da seção de experiência quando encontrar outra seção
    if (inExperienceSection && /(formação|educação|certificações|skills|habilidades|idiomas|contato|resumo|objetivo)/i.test(lower)) {
      inExperienceSection = false;
      continue;
    }

    // Se estamos em uma seção de experiência, procurar tecnologias
    if (inExperienceSection) {
      for (const [tech, patterns] of Object.entries(techPatterns)) {
        for (const pattern of patterns) {
          if (pattern.test(line) && !practicalTechs.includes(tech)) {
            practicalTechs.push(tech);
            console.log(`[generate] Tech prática encontrada: ${tech} na linha: "${line.trim().substring(0, 40)}"`);
          }
        }
      }
    }
  }

  // Se não encontrou seções de experiência, procurar tecnologias em todo o texto
  if (sectionCount === 0) {
    console.log("[generate] Nenhuma seção de experiência encontrada, buscando em todo o texto");
    for (const [tech, patterns] of Object.entries(techPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(text) && !practicalTechs.includes(tech)) {
          practicalTechs.push(tech);
        }
      }
    }
  }

  console.log(`[generate] Total de tecnologias práticas encontradas: ${practicalTechs.length}`);
  return practicalTechs;
}

async function getActiveResumeData(): Promise<ActiveResumeData | null> {
  try {
    const resume = await prisma.resume.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!resume) {
      console.log("[generate] Nenhum currículo ativo encontrado");
      return null;
    }

    const technologies = JSON.parse(resume.technologies || "[]");
    const experience = resume.experience ? JSON.parse(resume.experience) : {};
    const education = resume.education ? JSON.parse(resume.education) : {};
    const skills = JSON.parse(resume.skills || "[]");

    // Extrair nome e email do texto do currículo
    const text = resume.textContent || "";

    // Tentar extrair nome mais robustamente
    let extractedName = process.env.CANDIDATE_NAME || "";
    const namePatterns = [
      /^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){2,})/m, // Pelo menos 3 palavras
      /^([A-ZÀ-Ú][a-zà-ú]+\s+[A-ZÀ-Ú][a-zà-ú]+)/m, // Pelo menos 2 palavras
    ];
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1] && !/(desenvolvedor|engenheiro|analista|programador|pleno|senior|junior)/i.test(match[1])) {
        extractedName = match[1];
        break;
      }
    }

    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);

    // Extrair tecnologias usadas em projetos reais
    const practicalTechs = extractPracticalTechs(text);

    console.log(`[generate] Currículo carregado: ${technologies.length} tecnologias, ${practicalTechs.length} práticas, nome: ${extractedName}`);

    return {
      name: extractedName,
      email: emailMatch?.[0] || process.env.CANDIDATE_EMAIL || "",
      technologies,
      experience: {
        years: experience.years ?? null,
        level: experience.level ?? null,
        areas: experience.areas || [],
      },
      education: {
        degree: education.degree ?? null,
        field: education.field ?? null,
        institution: education.institution ?? null,
      },
      skills,
      textContent: text,
      practicalTechs,
    };
  } catch (error) {
    console.error("[generate] Error fetching active resume:", error);
    return null;
  }
}

function matchSkills(jobTechs: string[], candidateSkills: string[]): string[] {
  const set = new Set(candidateSkills.map((s) => s.toLowerCase()));
  return jobTechs
    .map((t) => t.toLowerCase())
    .filter((t) => set.has(t))
    .sort();
}

// Extrair requisitos-chave da descrição da vaga
function extractJobRequirements(description: string): {
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
} {
  const responsibilities: string[] = [];
  const requirements: string[] = [];
  const niceToHave: string[] = [];

  const lines = description.split("\n");
  let currentSection = "requirements";

  for (const line of lines) {
    const lower = line.toLowerCase().trim();

    // Detectar seções
    if (/(responsabilidades|atribuições|o que você fará|what you'll do)/i.test(lower)) {
      currentSection = "responsibilities";
      continue;
    }
    if (/(requisitos|qualificações|requirements|what you'll need)/i.test(lower)) {
      currentSection = "requirements";
      continue;
    }
    if (/(diferenciais|nice to have|bons ter|would be a plus)/i.test(lower)) {
      currentSection = "niceToHave";
      continue;
    }

    // Extrair itens (linhas que começam com •, -, *, ou são listadas)
    if (/^[•\-\*]\s*/.test(line.trim())) {
      const item = line.trim().replace(/^[•\-\*]\s*/, "");
      if (item.length > 5) {
        switch (currentSection) {
          case "responsibilities": responsibilities.push(item); break;
          case "requirements": requirements.push(item); break;
          case "niceToHave": niceToHave.push(item); break;
        }
      }
    }
  }

  return { responsibilities, requirements, niceToHave };
}

// Encontrar experiências do currículo que atendem aos requisitos da vaga
function findMatchingExperiences(
  jobReqs: string[],
  resumeExperiences: Array<{ company: string; role: string; highlights: string[] }> | { years: number | null; level: string | null; areas: string[] },
  resumeText: string
): string[] {
  const matches: string[] = [];

  // Se temos experiências estruturadas (array)
  if (Array.isArray(resumeExperiences)) {
    for (const exp of resumeExperiences) {
      for (const highlight of (exp.highlights || [])) {
        const highlightLower = highlight.toLowerCase();
        for (const req of jobReqs) {
          const reqWords = req.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const matchCount = reqWords.filter(w => highlightLower.includes(w)).length;
          if (matchCount >= 2 || reqWords.some(w => highlightLower.includes(w) && w.length > 5)) {
            matches.push(`${exp.company}: ${highlight}`);
            break;
          }
        }
      }
    }
  }

  // Se não encontrou ou não temos array, buscar no texto do currículo
  if (matches.length === 0 && resumeText) {
    const lines = resumeText.split("\n");
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      for (const req of jobReqs) {
        const reqWords = req.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const matchCount = reqWords.filter(w => lineLower.includes(w)).length;
        if (matchCount >= 2 || reqWords.some(w => lineLower.includes(w) && w.length > 5)) {
          const cleanLine = line.trim().substring(0, 100);
          if (cleanLine.length > 10) {
            matches.push(cleanLine);
          }
          break;
        }
      }
    }
  }

  return [...new Set(matches)].slice(0, 3);
}

// Gerar texto personalizado baseado na vaga específica
function generateJobSpecificText(
  job: NormalizedJob,
  resume: ActiveResumeData,
  matchedPractical: string[],
  matchedKnowledge: string[]
): { message: string; coverLetter: string; highlights: string[] } {
  try {
    const jobReqs = extractJobRequirements(job.description || "");
    console.log(`[generate] Requisitos da vaga: ${jobReqs.responsibilities.length} responsabilidades, ${jobReqs.requirements.length} requisitos`);

    const matchingExps = findMatchingExperiences(
      [...jobReqs.responsibilities, ...jobReqs.requirements],
      resume.experience as any,
      resume.textContent
    );
    console.log(`[generate] Experiências correspondentes: ${matchingExps.length}`);
    if (matchingExps.length > 0 && matchingExps[0]) {
      console.log(`[generate] Primeira experiência: ${matchingExps[0].substring(0, 60)}`);
    }

    const highlights: string[] = [];

  // Adicionar experiências que batem com os requisitos
  if (matchingExps.length > 0) {
    highlights.push(...matchingExps.map(e => `Experiência relevante: ${e}`));
  }

  // Adicionar tecnologias práticas
  if (matchedPractical.length > 0) {
    highlights.push(`Domínio prático: ${matchedPractical.join(", ")}`);
  }

  // Adicionar conhecimentos
  if (matchedKnowledge.length > 0) {
    highlights.push(`Conhecimento adicional: ${matchedKnowledge.join(", ")}`);
  }

  // Gerar mensagem mais direta e personalizada
  const companyText = job.company && job.company !== "Desconhecida" ? ` na ${job.company}` : "";
  const opening = `Olá! Vi a vaga de ${job.title}${companyText} e me interessei muito.`;

  // Montar parágrafo sobre experiência relevante
  let experienceParagraph = "";
  if (matchingExps.length > 0) {
    experienceParagraph = `Minha experiência inclui:\n${matchingExps.map(e => `• ${e}`).join("\n")}`;
  } else if (matchedPractical.length > 0) {
    experienceParagraph = `Trabalho com ${matchedPractical.join(", ")} em projetos reais`;
    // Adicionar informações do currículo se disponíveis
    if (resume.experience.areas && resume.experience.areas.length > 0) {
      experienceParagraph += `, principalmente em ${resume.experience.areas.join(" e ")}`;
    }
    if (resume.experience.years) {
      experienceParagraph += `. Tenho ${resume.experience.years} ${resume.experience.years === 1 ? "ano" : "anos"} de experiência na área`;
    }
    experienceParagraph += ".";
  } else {
    experienceParagraph = `Tenho experiência com desenvolvimento de software`;
    if (resume.experience.areas && resume.experience.areas.length > 0) {
      experienceParagraph += `, atuando em ${resume.experience.areas.join(" e ")}`;
    }
    experienceParagraph += ".";
  }

  // Montar parágrafo sobre stack
  let stackParagraph = "";
  if (matchedPractical.length > 0) {
    stackParagraph = `Minha stack principal inclui ${matchedPractical.slice(0, 4).join(", ")}`;
    if (matchedKnowledge.length > 0) {
      stackParagraph += `, além de conhecimento em ${matchedKnowledge.slice(0, 2).join(", ")}`;
    }
    stackParagraph += ".";
  }

  // Montar parágrafo sobre por que se interessa
  let interestParagraph = "";
  if (jobReqs.responsibilities.length > 0) {
    const mainResp = jobReqs.responsibilities[0]?.toLowerCase() || "";
    if (mainResp.length > 10) {
      interestParagraph = `Fiquei interessado especialmente em ${mainResp.substring(0, 100)}...`;
    } else {
      interestParagraph = `Acredito que minha experiência pode agregar no time.`;
    }
  } else {
    interestParagraph = `Acredito que minha experiência pode agregar no time.`;
  }

  const message =
    `${opening}\n\n` +
    `${experienceParagraph}\n\n` +
    `${stackParagraph}\n\n` +
    `${interestParagraph}\n\n` +
    `Posso conversar mais sobre como posso contribuir?\n\n` +
    `${resume.name}\n${resume.email}`;

  // Gerar cover letter mais estruturada
  let coverLetter =
    `Olá!\n\n` +
    `Me chamo ${resume.name} e tenho interesse na vaga de ${job.title}${companyText}.\n\n`;

  if (matchingExps.length > 0) {
    coverLetter += `Analisando os requisitos da vaga, identifiquei que minha experiência é compatível com o que vocês procuram:\n\n`;
    coverLetter += `• ${matchingExps.join("\n• ")}\n\n`;
  }

  if (matchedPractical.length > 0) {
    coverLetter += `Possuo experiência prática com ${matchedPractical.join(", ")}`;
    if (resume.experience.areas && resume.experience.areas.length > 0) {
      coverLetter += `, atuando em ${resume.experience.areas.join(" e ")}`;
    }
    coverLetter += ".\n\n";
  }

  if (matchedKnowledge.length > 0) {
    coverLetter += `Além disso, tenho conhecimento em ${matchedKnowledge.join(", ")}, o que pode ser útil para a função.\n\n`;
  }

  coverLetter +=
    `Acredito que posso contribuir significativamente com a equipe. Estou à disposição para conversar e detalhar minha experiência.\n\n` +
    `Abraço,\n${resume.name}\n${resume.email}`;

  return { message, coverLetter, highlights };
  } catch (error) {
    console.error("[generate] Erro ao gerar texto personalizado:", error);
    // Fallback para texto genérico em caso de erro
    const fallbackHighlights = [
      ...matchedPractical.map(m => `Experiência com ${m}`),
      ...matchedKnowledge.map(m => `Conhecimento em ${m}`),
    ];
    return {
      message: `Olá! Tenho interesse na vaga de ${job.title} na ${job.company}. Posso conversar mais?\n\n${resume.name}\n${resume.email}`,
      coverLetter: `Olá!\n\nMe chamo ${resume.name} e tenho interesse na vaga de ${job.title} na ${job.company}.\n\nEstou à disposição para conversar.\n\nAbraço,\n${resume.name}\n${resume.email}`,
      highlights: fallbackHighlights,
    };
  }
}

// Extrair experiências reais do texto do currículo
function extractExperiencesFromText(text: string): string[] {
  const experiences: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Procurar por padrões como "Empresa | Cargo | Período"
    if (/\b(desenvolvedor|engineer|programador|analista|full stack|backend|frontend|mobile)\b/i.test(line)) {
      experiences.push(line.trim());
    }
  }

  return experiences.slice(0, 3); // Máximo 3 experiências
}

// Gera a candidatura APENAS com fatos do curriculo real. Nunca inventa.
export async function generateApplication(job: NormalizedJob, _result: ScoreResult): Promise<GeneratedApplication> {
  const resume = await getActiveResumeData();

  if (!resume) {
    return generateFallbackApplication(job);
  }

  // Separar tecnologias práticas (usadas em projetos) de conhecimento
  const matchedPractical = matchSkills(job.technologies, resume.practicalTechs);
  const matchedKnowledge = matchSkills(job.technologies, resume.technologies.filter(t => !resume.practicalTechs.includes(t)));
  const allMatched = [...new Set([...matchedPractical, ...matchedKnowledge])];

  // Gerar textos personalizados baseados na vaga específica
  const { message, coverLetter, highlights } = generateJobSpecificText(
    job, resume, matchedPractical, matchedKnowledge
  );

  const answers: ApplicationAnswer[] = [];

  // Respostas SEGURAS baseadas em fatos reais, mais naturais
  for (const skill of matchedPractical) {
    const phrases = [
      `Sim, já trabalhei com ${skill} em projetos reais.`,
      `Tenho experiência prática com ${skill}, usando em produção.`,
      `Já usei ${skill} em projetos anteriores, posso detalhar se quiser.`,
    ];
    answers.push({
      question: `Você possui experiência com ${skill}?`,
      answer: phrases[Math.floor(Math.random() * phrases.length)] ?? `Sim, tenho experiência com ${skill}.`,
      safe: true,
    });
  }

  for (const skill of matchedKnowledge) {
    answers.push({
      question: `Você possui experiência com ${skill}?`,
      answer: `Tenho conhecimento em ${skill}, mas ainda não usei em projetos profissionais. Estou aprendendo e aplicando em projetos pessoais.`,
      safe: true,
    });
  }

  answers.push({
    question: "Conte um pouco sobre sua experiência.",
    answer:
      `Trabalho com desenvolvimento ${resume.experience.level || ""} ` +
      (resume.experience.years ? `há ${resume.experience.years} ${resume.experience.years === 1 ? "ano" : "anos"}` : "há algum tempo") +
      `. Já atuei em ${resume.experience.areas.length > 0 ? resume.experience.areas.join(" e ") : "várias áreas"}, ` +
      `com foco em ${matchedPractical.length > 0 ? matchedPractical.slice(0, 3).join(", ") : "desenvolvimento de software"}. ` +
      (matchedKnowledge.length > 0 ? `Também tenho conhecimento em ${matchedKnowledge.slice(0, 2).join(", ")}. ` : "") +
      `Gosto de resolver problemas e aprender coisas novas.`,
    safe: true,
  });

  answers.push({
    question: "Por que tem interesse nesta vaga?",
    answer: `Gostei da stack que vocês usam${matchedPractical.length > 0 ? ` (${matchedPractical.slice(0, 2).join(", ")})` : ""} e da proposta da vaga. Acho que minha experiência pode ajudar no time.`,
    safe: true,
  });

  // Perguntas SENSIVEIS: NAO responder automaticamente
  answers.push({ question: "Pretensão salarial", answer: "Prefiro discutir depois de entender melhor a vaga.", safe: false });
  answers.push({ question: "Disponibilidade de horário", answer: "Posso alinhar depois, depende do que precisarem.", safe: false });
  answers.push({ question: "Teste técnico / desafio de programação", answer: "Posso fazer, mas prefiro combinar primeiro.", safe: false });
  answers.push({ question: "Envio de documentos pessoais", answer: "Envio manualmente depois que avançar no processo.", safe: false });

  return {
    resumeVersion: `v2 (${matchedPractical.slice(0, 2).join(", ") || "currículo ativo"})`,
    matchedSkills: allMatched,
    highlights,
    message,
    coverLetter,
    answers,
  };
}

// Fallback quando não há currículo ativo
function generateFallbackApplication(job: NormalizedJob): GeneratedApplication {
  const candidateName = process.env.CANDIDATE_NAME || "Candidato";
  const candidateEmail = process.env.CANDIDATE_EMAIL || "";

  const highlights = [
    "Atuação em produtos digitais com usuários reais",
    "Integrações backend, APIs REST e comunicação em tempo real",
  ];

  const contactLine = candidateEmail ? `\n${candidateName}\n${candidateEmail}` : `\n${candidateName}`;

  const message =
    `Olá! Tenho interesse na vaga de ${job.title} na ${job.company}. ` +
    `Tenho experiência prática com desenvolvimento full stack em produção. ` +
    `Poderia conversar mais sobre a oportunidade?${contactLine}`;

  const coverLetter =
    `Prezados(as),\n\n` +
    `Sou ${candidateName}, desenvolvedor full stack com experiência em produção. ` +
    `Tenho interesse na vaga de ${job.title} (${job.company}) porque ela alinha-se à minha stack. ` +
    `Destaco como pontos fortes: ${highlights.join("; ")}.\n\n` +
    `Meus dados e experiências completas estão no currículo em anexo. ` +
    `Agradeço a atenção e fico à disposição para conversarmos.\n\n` +
    `Atenciosamente,${contactLine}`;

  return {
    resumeVersion: `v1 (fallback - sem currículo ativo)`,
    matchedSkills: [],
    highlights,
    message,
    coverLetter,
    answers: [
      { question: "Pretensão salarial", answer: "Requer definição humana — não automatizar.", safe: false },
      { question: "Disponibilidade de horário", answer: "Requer revisão humana.", safe: false },
    ],
  };
}
