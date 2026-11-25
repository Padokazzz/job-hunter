export type PostingLanguage = "pt" | "en" | "other" | "unknown";

// Prefer words that distinguish the language of prose from English technology names.
const markers: Record<Exclude<PostingLanguage, "unknown">, Set<string>> = {
  pt: new Set("aos às até através como com das dos dela dele em entre essa esta estão faça enquanto isso mais mesma mesmo nesta neste nossa nosso nós os ou para pela pelo por que são sem será seus sobre suas também tem uma você vocês atuação atividades benefícios buscamos conhecimento conhecimentos contratação desenvolvedor desenvolvedora desenvolvimento equipe está estágio experiência experiências formação habilidade jornada oportunidade profissional requisitos responsabilidades salário seleção trabalho vaga vagas".split(" ")),
  en: new Set("about across also and are as at be been being both can could from for has have how into is its join may more must of on or our should than that the their them then they this through to was we were what where which who will with would you your applicant apply benefits candidate experience looking qualifications requirements responsibilities team years".split(" ")),
  other: new Set("años aprendizaje buscamos cómo conocimientos contratación desarrollar desarrollador equipo esta estos experiencia habilidades hasta jornada nosotros para puesto requisitos sobre su sus también tenemos trabajo tus ustedes vacante vosotros les des avec dans nous vous votre bei für und unser werden".split(" ")),
};

function detect(text: string): PostingLanguage {
  const scores = { pt: 0, en: 0, other: 0 };
  const tokens = new Set(
    text.slice(0, 16000).toLowerCase().normalize("NFC")
      .replace(/https?:\/\/\S+|<[^>]+>/g, " ").match(/\p{L}+/gu) ?? [],
  );
  for (const token of tokens) {
    for (const language of ["pt", "en", "other"] as const) {
      if (markers[language].has(token)) scores[language]++;
    }
  }
  if (scores.pt >= 2 && scores.pt > scores.other && scores.pt > scores.en) return "pt";
  if (scores.en >= 2 && scores.en > scores.pt && scores.en > scores.other) return "en";
  if (scores.other >= 2 && scores.other > scores.pt && scores.other > scores.en) return "other";
  return "unknown";
}

export function detectPostingLanguage(title: string, description: string): PostingLanguage {
  // Many sources prepend metadata to the description. Longer prose takes precedence.
  const descriptionLanguage = detect(description);
  if (descriptionLanguage !== "unknown") return descriptionLanguage;
  if (/\b(?:desenvolvedor[ae]?|engenheir[oa]|estági[oa]|analista de|cientista de)\b/iu.test(title)) return "pt";
  return detect(title);
}
