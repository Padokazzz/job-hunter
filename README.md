# Job Hunter Bot

Bot de busca e candidatura automatizada a vagas de tecnologia, com scoring inteligente baseado em curriculo e dashboard web para gerenciamento.

## Caracteristicas

- **7 fontes de vagas**: RemoteOK, Remotive, Jobicy, Programathor, GeekHunter, Gupy (MCP), Indeed (Bright Data)
- **Scoring multi-categoria**: Pontuacao de 0-100 baseada em stack, modelo de trabalho, senioridade, idioma, localizacao e match com curriculo
- **Dashboard web**: Interface completa para visualizar, filtrar, favoritar e gerenciar vagas
- **Candidatura assistida**: Gera carta de apresentacao, mensagens e respostas personalizadas
- **Nunca envia automaticamente**: Todo envio e feito pelo humano via dashboard
- **Docker ready**: Setup completo com PostgreSQL, scheduler automatico e dashboard

## Pre-requisitos

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/install/)

## Instalacao Rapida

```bash
# 1. Clone o repositorio
git clone https://github.com/seu-usuario/job-hunter-bot.git
cd job-hunter-bot

# 2. Copie o arquivo de exemplo
cp .env.example .env

# 3. Suba os servicos
docker compose up -d
```

O dashboard estara disponivel em `http://localhost:3000`.

## Configuracao

### Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao | Default |
|----------|-------------|-----------|---------|
| `CANDIDATE_NAME` | Sim | Seu nome completo (usado em candidaturas) | (vazio) |
| `CANDIDATE_EMAIL` | Sim | Seu email (usado em candidaturas) | (vazio) |
| `POSTGRES_PASSWORD` | Sim | Senha do PostgreSQL | `CHANGE_ME` |
| `DASHBOARD_PORT` | Nao | Porta do dashboard | `3000` |
| `BRIGHTDATA_API_TOKEN` | Nao | Token Bright Data para Indeed | (vazia = fonte inativa) |
| `OPENAI_API_KEY` | Nao | Chave OpenAI para analise com IA | (vazia = nao usado) |
| `AUTO_PREPARE` | Nao | Auto-preparar candidaturas (score>=85) | `0` |
| `DATABASE_URL` | Nao | URL de conexao com banco | (configurado no docker-compose) |
| `JOBHUNTER_DB_CONFIRMED` | Nao | Confirmacao para uso de Postgres | `1` (no Docker) |

### Arquivo .env

```bash
# Seus dados pessoais (obrigatorio para candidaturas)
CANDIDATE_NAME="Seu Nome Completo"
CANDIDATE_EMAIL="seu@email.com"

# Docker PostgreSQL (configuracao padrao)
# Gere uma senha forte: openssl rand -base64 32
DATABASE_URL="postgresql://jobhunter:SUA_SENHA@postgres:5432/jobhunter"
JOBHUNTER_DB_CONFIRMED="1"

# Senha do PostgreSQL (deve bater com DATABASE_URL)
POSTGRES_PASSWORD="SUA_SENHA"

# Porta do dashboard
DASHBOARD_PORT="3000"

# Bright Data (opcional - ativa Indeed)
# BRIGHTDATA_API_TOKEN="seu-token"

# Auto-preparar candidaturas (opcional)
# AUTO_PREPARE="1"
```

## Uso

### Subir o sistema completo

```bash
docker compose up -d
```

Isso inicia:
- **PostgreSQL** (porta 5432 interna)
- **Dashboard** (porta 3000)
- **Scheduler** (coleta a cada 6 horas)

### Rodar o bot manualmente

```bash
docker compose --profile run-bot run --rm bot
```

### Acessar o dashboard

Abra `http://localhost:3000` no navegador.

### Upload do curriculo

Apos subir o sistema:

1. Acesse `http://localhost:3000`
2. Va em **Configuracoes** (menu lateral)
3. Envie seu curriculo em **PDF** (max 5MB)
4. O sistema extraira automaticamente: tecnologias, experiencia, formacao
5. O curriculo ativo sera usado para scoring e geracao de candidaturas

### Parar tudo

```bash
docker compose down
```

### Ver logs

```bash
# Logs do dashboard
docker compose logs -f dashboard

# Logs do scheduler
docker compose logs -f scheduler

# Logs de um execucao manual do bot
docker compose --profile run-bot logs bot
```

## Supabase (Producao)

Para usar PostgreSQL gerenciado do Supabase em vez do Docker:

### 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Clique em **New Project**
3. Escolha nome, senha e regiao
4. Aguarde a criacao (leva ~2 minutos)

### 2. Obter a connection string

1. Va em **Settings** > **Database**
2. Na aba **Connection string**, selecione **Transaction** (porta 5432)
3. Copie a URI e substitua `[YOUR-PASSWORD]` pela senha definida

### 3. Configurar o .env

```bash
# Suba o .env.example como base
cp .env.example .env

# Edite o .env com a connection string do Supabase
DATABASE_URL="postgresql://postgres.[projeto]:[senha]@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
JOBHUNTER_DB_CONFIRMED="1"
```

### 4. Aplicar o schema

```bash
# Gerar cliente Prisma
npx prisma generate

# Aplicar schema no banco
npx prisma db push
```

Ou use o schema especifico do Supabase:

```bash
npx prisma db push --schema prisma/supabase/schema.prisma
```

### 5. Rodar com Supabase (sem Docker)

```bash
# Coletar vagas
npm run run

# Iniciar dashboard
npm run dashboard
```

### Schema do banco

O schema e o mesmo para SQLite e PostgreSQL. Tabelas:

| Tabela | Descricao |
|--------|-----------|
| `Source` | Fontes de coleta (7 registros) |
| `Job` | Vagas coletadas e pontuadas |
| `ScoreBreakdown` | Detalhamento da pontuacao por categoria |
| `CollectionRun` | Historico de execucoes de coleta |
| `Application` | Pacotes de candidatura gerados |
| `DailyReport` | Relatorios diarios agregados |
| `Resume` | Curriculos uploadados |

## Fontes de Vagas

| Fonte | Metodo | Auth | Vagas | Notas |
|-------|--------|------|-------|-------|
| RemoteOK | API publica | Nenhuma | ~200 | Vagas remotas, salarios em USD |
| Remotive | API publica | Nenhuma | ~100 | 100% remotas, USD |
| Jobicy | API publica | Nenhuma | ~100 | 100% remotas |
| Programathor | HTML scraping | Nenhuma | ~50 | Vagas BR, BRL |
| GeekHunter | Playwright (SPA) | Nenhuma | ~10 | Vagas BR, extrai senioridade |
| Gupy | MCP oficial | Nenhuma | ~600 | Via API publica Gupy, BR |
| Indeed | Bright Data MCP | `BRIGHTDATA_API_TOKEN` | Variavel | Vagas US remotas |

### Habilitar/desabilitar fontes

Edite `src/sources/index.ts` e altere o campo `enabled`:

```typescript
export const sources: SourceAdapter[] = [
  new RemoteOkSource(),    // enabled: true
  new ProgramathorSource(), // enabled: true
  // ...
];
```

## Dashboard

Interface web com 6 paginas:

### Dashboard (principal)
- Cards de estatisticas (total vagas, favoritas, candidaturas, relevantes)
- Graficos de barras (classificacao, status, fontes, empresas)
- Tabela de vagas recentes com badges de score

### Vagas
- Tabela completa com 15 filtros (score, stack, senioridade, modelo trabalho, localizacao, fonte, idioma, status, busca, empresa, favoritos)
- Chips rapidos: Favoritas, Novas, Candidatadas, Remotas
- Colunas ordenaveis (titulo, empresa, score, classificacao, status)
- Carregamento lazy (botao "Carregar mais")
- Estrela inline para favoritar

### Drawer de detalhe
- Descricao completa da vaga
- Motivos de match e preocupacoes
- Breakdown visual da pontuacao (barras por categoria)
- Botoes: Favoritar, Marcar visualizada, Aprovar, Ignorar, Preparar candidatura, Marcar como candidatada
- Editor de notas
- Preview da candidatura (carta, mensagem, destaques, perguntas/respostas)

### Fontes
- Tabela de todas as 7 fontes com status, ultima execucao e erros

### Relatorios
- Relatorios diarios com detalhe de classificacao e top vagas

### Configuracoes
- Modo do banco de dados
- Upload de curriculo (PDF, drag-and-drop, max 5MB)
- Historico de curriculos (ativar/remover)

## Sistema de Scoring

Pontuacao de 0 a 100 pontos, distribuida em 8 categorias:

| Categoria | Pontos Maximos | Logica |
|-----------|----------------|--------|
| **Stack** | 40 | Soma dos pontos das tecnologias compatíveis (ex: Node=10, TypeScript=8, React=8). Penaliza -8 se todas sao low-priority |
| **Modelo Trabalho** | 15 | REMOTE=15, HYBRID=8, ONSITE=2, UNKNOWN=0 |
| **Senioridade** | 15 | JUNIOR=15, JUNIOR_PLENO=12, PLENO=7, SENIOR=0-5 (adaptativo), UNKNOWN=5 |
| **Experiencia** | 10 | ~1.5pt por palavra-chave encontrada (projeto, api, frontend, backend, etc.) |
| **Localizacao** | 5 | REMOTE=5, local preferido=4, senao=1 |
| **Idioma** | 5 | NONE=5, TECHNICAL=4, INTERMEDIATE=2, ADVANCED=-5 (penalidade) |
| **Outros** | 10 | Salario(+2), beneficios(+1), crescimento(+1), junior(+1), descricao longa(+1), techs premium(+2) |
| **Match Curriculo** | 20 | Bonus por tecnologias do curriculo, nivel de experiencia e areas relevantes |

### Classificacoes

| Classificacao | Pontos | Acao |
|---------------|--------|------|
| PRIORITARY | 85-100 | Candidatura prioritaria |
| GOOD | 70-84 | Boa aderencia |
| SECONDARY | 55-69 | Secundaria |
| LOW | 40-54 | Baixa prioridade |
| DISCARD | 0-39 | Descartada |

## Candidatura

### Modo 1 (padrao) - Manual

1. Bot coleta e pontua vagas
2. Usuario visualiza no dashboard
3. Clica "Preparar" na vaga desejada
4. Sistema gera pacote (carta, mensagem, respostas)
5. Usuario revisa e envia manualmente

### Modo 2 (auto-prepare) - Semi-automatico

Ative com `AUTO_PREPARE=1` no `.env`.

1. Bot coleta e pontua vagas
2. Vagas com score>=85 e sem risco sao preparadas automaticamente
3. Usuario revisa no dashboard
4. Envio continua manual

**Regras de seguranca:**
- NUNCA envia candidaturas automaticamente
- NUNCA contorna CAPTCHA, 2FA ou anti-bot
- Preparacao e opcional e reversivel

## Desenvolvimento

### Scripts npm

| Comando | Descricao |
|---------|-----------|
| `npm run dev` | Roda o bot (coleta) |
| `npm run dashboard` | Inicia o dashboard |
| `npm test` | Executa os testes |
| `npm run db:push` | Aplica schema no banco |
| `npm run db:generate` | Gera cliente Prisma |
| `npm run db:purge` | Remove vagas que nao passam no filtro (dry-run) |
| `npm run prisma:studio` | Abre Prisma Studio |

### Testes

```bash
npm test
```

7 arquivos de teste cobrindo:
- `score.test.ts` - Pontuacao e classificacoes
- `normalize.test.ts` - Deteccao de modelo trabalho, senioridade, idioma, tecnologias
- `filter.test.ts` - Filtro global tech+remote
- `dedup.test.ts` - Deduplicacao
- `sources.test.ts` - Adaptadores de fontes
- `sources-parse.test.ts` - Parsers de cada fonte
- `applications.test.ts` - Geracao de candidatura e politica auto-prepare

### Estrutura do Projeto

```
bot/
  src/
    main.ts              # Pipeline principal de coleta
    config/              # Perfil do candidato e curriculo
    shared/              # Utilitarios (env, db, logger, parser PDF)
    jobs/                # Normalizacao, filtro e deduplicacao
    sources/             # 7 adaptadores de fontes
    scoring/             # Motor de pontuacao
    applications/        # Geracao de candidatura
    mcp/                 # Clients MCP (Gupy, Bright Data)
    dashboard/           # Servidor Fastify
    report/              # Relatorio de console
  public/                # Frontend SPA (HTML/JS/CSS)
  prisma/                # Schema do banco
  scripts/               # Scripts auxiliares
  tests/                 # Suite de testes
  curriculo/             # Curriculo em PDF
```

## Arquitetura Docker

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┐    ┌─────────────┐                 │
│  │  PostgreSQL  │    │   init-db   │                 │
│  │  (port 5432) │◄───│ prisma push │                 │
│  └──────┬──────┘    └─────────────┘                 │
│         │                                            │
│         ▼                                            │
│  ┌─────────────┐    ┌─────────────┐                 │
│  │  Dashboard   │    │  Scheduler  │                 │
│  │  (port 3000) │    │  (6h cycle) │                 │
│  └─────────────┘    └──────┬──────┘                 │
│                            │                         │
│                            ▼                         │
│                     ┌─────────────┐                 │
│                     │  Bot (run)  │                 │
│                     │  coleta     │                 │
│                     └─────────────┘                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Servicos

| Servico | Imagem | Porta | Descricao |
|---------|--------|-------|-----------|
| `postgres` | postgres:16-alpine | 5432 (interna) | Banco de dados |
| `init-db` | build local | - | Aplica schema na primeira execucao |
| `dashboard` | build local | 3000 | Interface web (sempre rodando) |
| `scheduler` | build local | - | Coleta automatica a cada 6 horas |
| `bot` | build local | - | Execucao manual (profile: run-bot) |

## Licença

MIT
