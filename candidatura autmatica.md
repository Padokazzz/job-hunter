# Bot de Busca e Candidatura a Vagas

## 1. Objetivo

Criar um bot que execute diariamente uma rotina de prospecção de vagas de tecnologia e ajude a encontrar oportunidades compatíveis com o perfil de Leonardo Padilha Kawashaki.

O bot deve:

1. Buscar vagas novas.
2. Filtrar vagas compatíveis.
3. Avaliar aderência ao perfil.
4. Evitar duplicidades.
5. Registrar oportunidades.
6. Preparar candidaturas personalizadas.
7. Candidatar-se automaticamente somente quando houver autorização/configuração explícita para isso.
8. Registrar o resultado de cada candidatura.
9. Manter histórico para evitar candidaturas repetidas.

> **Regra importante:** o bot não deve inventar informações profissionais, experiências, certificados ou conhecimentos. Também não deve responder avaliações técnicas, testes ou perguntas de seleção em nome do candidato sem aprovação explícita.

---

# 2. Perfil-alvo

## Cargo principal

- Desenvolvedor Full Stack Júnior
- Desenvolvedor Backend Júnior
- Desenvolvedor Node.js Júnior
- Desenvolvedor TypeScript Júnior
- Desenvolvedor React/Node Júnior

## Cargos secundários

- Full Stack Júnior/Pleno inicial
- Backend Júnior/Pleno inicial
- Desenvolvedor .NET Júnior
- Desenvolvedor Front-end Júnior quando houver forte aderência ao perfil

## Prioridade de tecnologias

### Alta prioridade

- TypeScript
- JavaScript
- Node.js
- React
- Next.js
- REST API
- PostgreSQL
- SQL
- Git

### Prioridade média

- C# / .NET
- Docker
- AWS
- CI/CD
- React Native
- Flutter
- MongoDB
- Redis

### Baixa prioridade

- Java
- PHP
- Go
- Rust

Essas tecnologias de baixa prioridade não devem eliminar automaticamente uma vaga. Devem apenas reduzir a pontuação quando forem requisitos centrais.

---

# 3. Modelo de trabalho preferencial

Prioridade:

1. 100% remoto
2. Híbrido em São Paulo e região
3. Presencial somente quando houver forte vantagem

Tipos de contratação:

- CLT
- PJ
- Freelancer/contrato
- Outros, desde que a oportunidade seja relevante

Não eliminar automaticamente uma vaga por não informar salário.

---

# 4. Idioma

O candidato:

- Não fala inglês fluentemente.
- Consegue ler e compreender documentação e conteúdo técnico em inglês.

### Regra

Vagas que exigem:

- inglês avançado obrigatório;
- conversação fluente obrigatória;
- reuniões constantes em inglês;

devem receber forte penalização ou ser classificadas como baixa prioridade.

Vagas que pedem:

- inglês técnico;
- leitura;
- documentação;
- diferencial em inglês;

podem continuar no processo normalmente.

---

# 5. Fontes de vagas

O sistema deve possuir uma camada de adaptadores para diferentes fontes.

Exemplo:

```text
JobSource
├── LinkedIn
├── Indeed
├── Gupy
├── Glassdoor
├── Programathor
├── GeekHunter
├── Wellfound
├── RemoteOK
└── Outras fontes
```

Cada fonte deve implementar uma interface semelhante a:

```ts
interface JobSource {
  search(filters: JobSearchFilters): Promise<Job[]>;
}
```

O sistema não deve depender de uma única plataforma.

---

# 6. Busca

Executar pesquisas utilizando combinações de:

```text
"Desenvolvedor Full Stack Júnior"
"Full Stack Junior"
"Desenvolvedor Backend Júnior"
"Backend Node.js Junior"
"Node.js Junior"
"React Node Junior"
"React TypeScript Junior"
"Full Stack React Node"
"Desenvolvedor TypeScript Júnior"
"Desenvolvedor .NET Júnior"
```

Também devem ser consideradas variações:

```text
Developer
Software Developer
Software Engineer
Web Developer
Full Stack Developer
Backend Developer
```

---

# 7. Filtros

## Filtros positivos

Dar prioridade quando a vaga possuir:

- Node.js
- TypeScript
- React
- Next.js
- PostgreSQL
- REST API
- JavaScript
- Git

## Filtros negativos

Reduzir bastante a prioridade quando:

- exigir 3+ anos de experiência para vaga júnior;
- exigir inglês avançado;
- for exclusivamente mobile;
- for exclusivamente Flutter;
- exigir tecnologia completamente fora do perfil;
- for claramente sênior;
- exigir formação específica que o candidato não possui;
- estiver encerrada;
- estiver duplicada.

---

# 8. Sistema de pontuação

Cada vaga deve receber uma nota de 0 a 100.

## Stack: 40 pontos

| Critério | Pontos |
|---|---:|
| Node.js | +10 |
| TypeScript | +8 |
| React | +8 |
| Next.js | +5 |
| PostgreSQL/SQL | +5 |
| REST API | +4 |

## Modelo de trabalho: 15 pontos

| Critério | Pontos |
|---|---:|
| Remoto | +15 |
| Híbrido | +8 |
| Presencial | +2 |

## Senioridade: 15 pontos

| Critério | Pontos |
|---|---:|
| Júnior | +15 |
| Júnior/Pleno | +12 |
| Pleno | +7 |
| Sênior | 0 |

## Experiência compatível: 10 pontos

Avaliar:

- projetos profissionais;
- APIs;
- frontend;
- backend;
- banco de dados;
- Git;
- experiência com aplicações reais.

## Localização: 5 pontos

| Critério | Pontos |
|---|---:|
| Remoto | +5 |
| SP/região | +4 |
| Outro local | +1 |

## Inglês: 5 pontos

| Critério | Pontos |
|---|---:|
| Não obrigatório | +5 |
| Técnico/leitura | +4 |
| Intermediário | +2 |
| Avançado obrigatório | -5 |

## Outros fatores: 10 pontos

Avaliar:

- salário informado;
- benefícios;
- possibilidade de crescimento;
- empresa compatível com perfil júnior;
- descrição clara;
- tecnologia moderna.

---

# 9. Classificação

## 85-100

**Candidatura prioritária**

O bot deve recomendar fortemente a candidatura.

## 70-84

**Boa oportunidade**

Pode preparar candidatura.

## 55-69

**Oportunidade secundária**

Mostrar para decisão do candidato.

## 40-54

**Baixa prioridade**

Não candidatar automaticamente.

## 0-39

**Descartar**

Não apresentar como recomendação principal.

---

# 10. Detecção de duplicidade

Uma mesma vaga pode aparecer em várias plataformas.

Criar uma chave:

```text
hash(
  company +
  normalized_title +
  location
)
```

Também considerar:

- URL;
- ID externo;
- descrição;
- data de publicação.

O sistema deve evitar:

- registrar a mesma vaga duas vezes;
- preparar duas candidaturas;
- candidatar-se novamente à mesma vaga.

---

# 11. Banco de dados

Sugestão inicial:

```text
PostgreSQL
```

Tabela `jobs`:

```text
id
source
external_id
url
company
title
description
location
work_model
employment_type
salary_min
salary_max
currency
technologies
seniority
english_requirement
published_at
discovered_at
score
status
created_at
updated_at
```

Tabela `applications`:

```text
id
job_id
status
applied_at
application_url
resume_version
cover_letter
notes
created_at
updated_at
```

Status:

```text
FOUND
ANALYZED
APPROVED
APPLICATION_PREPARED
APPLIED
SCREENING
INTERVIEW
TECHNICAL_TEST
OFFER
REJECTED
WITHDRAWN
EXPIRED
```

---

# 12. Arquitetura sugerida

Stack recomendada:

```text
Node.js
TypeScript
PostgreSQL
Prisma
Fastify ou NestJS
Docker
```

Estrutura:

```text
src/
├── modules/
│   ├── jobs/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── jobs.controller.ts
│   │
│   ├── applications/
│   ├── candidates/
│   ├── scoring/
│   ├── notifications/
│   └── automation/
│
├── integrations/
│   ├── linkedin/
│   ├── indeed/
│   ├── gupy/
│   └── other-sources/
│
├── shared/
│   ├── database/
│   ├── logger/
│   └── config/
│
└── main.ts
```

---

# 13. IA para análise

A IA deve receber a descrição da vaga e retornar uma estrutura JSON.

Exemplo:

```json
{
  "score": 87,
  "seniority": "junior",
  "technologies": [
    "React",
    "Node.js",
    "TypeScript",
    "PostgreSQL"
  ],
  "english_required": false,
  "remote": true,
  "match_reasons": [
    "Node.js é requisito principal",
    "React e TypeScript são utilizados",
    "Vaga remota",
    "Senioridade compatível"
  ],
  "concerns": [
    "Docker aparece como requisito desejável"
  ],
  "recommendation": "APPLY"
}
```

A IA nunca deve decidir exclusivamente com base em texto livre. O resultado deve ser validado pelo backend.

---

# 14. Geração de candidatura

Para cada vaga aprovada, gerar uma candidatura específica.

A candidatura pode conter:

- currículo adequado à vaga;
- mensagem de apresentação;
- carta de apresentação quando solicitada;
- respostas para perguntas simples de candidatura.

O texto deve enfatizar somente experiências reais.

Exemplo de prioridades:

### Vaga Node + React

Destacar:

```text
Node.js
TypeScript
React
REST APIs
PostgreSQL
Git
```

### Vaga .NET + React

Destacar:

```text
C#
.NET
React
REST APIs
SQL
Git
```

### Vaga React

Destacar:

```text
React
TypeScript
JavaScript
HTML/CSS
Git
```

---

# 15. Candidatura automática

## Regra recomendada

Não começar com candidatura 100% automática.

Criar três níveis:

### Modo 1: Assistido

```text
Bot encontra
↓
Analisa
↓
Prepara candidatura
↓
Usuário aprova
↓
Bot envia
```

### Modo 2: Semi-automático

Candidaturas acima de determinado score podem ser enviadas automaticamente quando não houver perguntas críticas.

Exemplo:

```text
score >= 85
AND
sem teste técnico
AND
sem pergunta sensível
AND
sem alteração de dados pessoais
```

### Modo 3: Automático

Somente depois de validar o sistema.

---

# 16. O que nunca deve ser automatizado sem aprovação

O bot deve parar e pedir intervenção humana quando houver:

- teste técnico;
- desafio de programação;
- entrevista;
- gravação de vídeo;
- pergunta sobre pretensão salarial, quando a resposta exigir decisão;
- perguntas sobre disponibilidade;
- perguntas comportamentais relevantes;
- assinatura de documentos;
- envio de documentos pessoais;
- CAPTCHA;
- autenticação 2FA;
- qualquer mecanismo destinado a impedir automação.

O bot não deve tentar burlar CAPTCHA ou sistemas anti-bot.

---

# 17. Agendamento

Executar diariamente.

Exemplo:

```text
08:00
↓
Buscar vagas
↓
Normalizar
↓
Remover duplicadas
↓
Analisar
↓
Pontuar
↓
Salvar
↓
Gerar relatório
↓
Enviar notificação
```

Também pode existir uma segunda execução:

```text
18:00
↓
Verificar novas vagas
↓
Atualizar status
↓
Notificar oportunidades relevantes
```

---

# 18. Relatório diário

Exemplo:

```text
🤖 Relatório de vagas - 25/08/2026

Vagas encontradas: 73
Após filtros: 21
Alta aderência: 6
Boa aderência: 9
Secundárias: 6

🔥 TOP 5

1. Full Stack Jr
   Empresa: Empresa A
   Stack: React + Node + TS
   Modelo: Remoto
   Score: 94/100

2. Backend Jr
   Empresa: Empresa B
   Stack: Node + PostgreSQL
   Modelo: Remoto
   Score: 91/100

3. Full Stack Jr
   Empresa: Empresa C
   Stack: React + Next + Node
   Modelo: Híbrido
   Score: 88/100
```

---

# 19. Dashboard

Criar uma interface simples contendo:

```text
Dashboard
├── Vagas novas
├── Alta aderência
├── Candidaturas
├── Entrevistas
├── Testes técnicos
├── Rejeições
└── Ofertas
```

Filtros:

- score;
- tecnologia;
- empresa;
- modelo;
- salário;
- senioridade;
- data;
- status.

---

# 20. Métricas

O sistema deve acompanhar:

```text
vagas encontradas
vagas qualificadas
candidaturas enviadas
taxa de candidatura
respostas
entrevistas
testes técnicos
ofertas
taxa de conversão
```

Exemplo:

```text
100 vagas encontradas
        ↓
35 compatíveis
        ↓
25 candidaturas
        ↓
7 respostas
        ↓
4 entrevistas
        ↓
2 testes
        ↓
1 oferta
```

Isso permite descobrir quais tipos de vaga realmente geram resultado.

---

# 21. Segurança

Nunca armazenar:

- senha em texto puro;
- tokens diretamente no código;
- dados bancários;
- documentos pessoais desnecessários.

Usar:

```text
.env
secret manager
OAuth quando disponível
criptografia para credenciais sensíveis
```

Exemplo:

```env
DATABASE_URL=
OPENAI_API_KEY=
LINKEDIN_SESSION=
EMAIL_USER=
EMAIL_PASSWORD=
```

As credenciais reais nunca devem entrar no Git.

---

# 22. LGPD

Armazenar somente os dados necessários.

Permitir:

- exportação;
- exclusão;
- alteração;
- auditoria.

Registrar:

```text
quem
quando
qual vaga
qual ação
qual resultado
```

---

# 23. Estratégia de desenvolvimento

Não tentar construir tudo de uma vez.

## Fase 1

MVP somente de busca:

```text
Buscar vagas
↓
Normalizar
↓
Filtrar
↓
Pontuar
↓
Salvar
↓
Relatório
```

## Fase 2

Adicionar:

```text
Dashboard
Histórico
Duplicidade
Notificações
```

## Fase 3

Adicionar:

```text
Geração de candidatura
Currículos personalizados
Mensagens personalizadas
```

## Fase 4

Adicionar automação de candidatura:

```text
Aprovação humana
↓
Envio automático
↓
Registro
```

## Fase 5

Automação avançada:

```text
Regras por score
Auto-aplicação controlada
Monitoramento de respostas
Métricas
```

---

# 24. Critério de sucesso

O objetivo não é encontrar o maior número possível de vagas.

O objetivo é maximizar:

```text
Vagas relevantes
×
qualidade da candidatura
×
taxa de resposta
```

Uma automação que encontra 1.000 vagas ruins é pior do que uma que encontra 20 vagas excelentes.

---

# 25. Regra principal do projeto

> O bot deve funcionar como um recrutador pessoal automatizado, não como uma máquina de spam.

A prioridade deve ser:

```text
QUALIDADE
    ↓
ADERÊNCIA
    ↓
PERSONALIZAÇÃO
    ↓
VOLUME
```

E não:

```text
VOLUME
    ↓
SPAM
    ↓
BAN
```

---

# 26. Primeiro MVP recomendado

Para começar, implementar somente:

```text
Node.js + TypeScript
PostgreSQL
Prisma
Fastify
Docker
```

Funcionalidades:

```text
[1] Buscar vagas
[2] Normalizar vagas
[3] Remover duplicadas
[4] Avaliar aderência
[5] Gerar score
[6] Salvar no PostgreSQL
[7] Exibir dashboard
[8] Gerar relatório diário
```

Somente depois adicionar automação de candidatura.

---

# 27. Prompt base para o agente de desenvolvimento

Use este documento como especificação principal e implemente o projeto incrementalmente.

Regras para o agente:

1. Não fazer refatorações fora do escopo.
2. Implementar uma funcionalidade por vez.
3. Antes de alterar arquitetura, explicar o motivo.
4. Manter TypeScript strict.
5. Criar testes para regras críticas.
6. Nunca colocar secrets no código.
7. Não implementar bypass de CAPTCHA, anti-bot ou mecanismos de segurança.
8. Não inventar dados do candidato.
9. Manter logs claros.
10. Garantir idempotência nas rotinas de busca e candidatura.
11. Criar interfaces para integrações externas.
12. Não acoplar o domínio diretamente a uma plataforma de vagas.
13. Priorizar código simples e fácil de manter.
14. Documentar decisões arquiteturais importantes.

---

# 28. Resultado esperado

Ao final, o sistema deverá permitir:

```text
                    ┌──────────────────┐
                    │  Fontes de vagas │
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │     Collector    │
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │   Normalização   │
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │ Filtro + Score   │
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │    PostgreSQL    │
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │    Dashboard     │
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │ Candidatura IA   │
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │ Aprovação/Envio  │
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │    Histórico     │
                    └──────────────────┘
```

O MVP deve começar pela **coleta + análise + ranking**. A automação de candidatura é uma segunda etapa, depois que a qualidade das vagas encontradas estiver comprovada.
