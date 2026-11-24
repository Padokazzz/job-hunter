# Job Hunter

Ferramenta pessoal para coletar, organizar e analisar oportunidades de trabalho em tecnologia.

O sistema reúne vagas de diferentes fontes, normaliza os dados, remove duplicidades e calcula uma pontuação de compatibilidade com o perfil configurado. Um dashboard permite explorar oportunidades, acompanhar seu status e preparar materiais de candidatura.

**Princípio do projeto:** automatizar a pesquisa e a organização, sem retirar do candidato a decisão sobre onde e quando se candidatar. O sistema não envia candidaturas automaticamente.

## Funcionalidades

- **Coleta multifonte:** integração com sete fontes, usando APIs, parsers e adaptadores específicos.
- **Normalização e deduplicação:** padronização dos dados e identificação de oportunidades repetidas.
- **Scoring configurável:** pontuação de 0 a 100 considerando tecnologias, senioridade, modelo de trabalho, idioma, localização e aderência ao currículo.
- **Dashboard:** busca, filtros, favoritos, status, relatórios e detalhes de cada oportunidade.
- **Análise de compatibilidade:** exibe motivos de aderência e pontos de atenção.
- **Candidatura assistida:** prepara cartas, mensagens e respostas para revisão.
- **Coleta agendada:** scheduler executa o processo periodicamente.
- **Execução containerizada:** ambiente com Docker Compose e PostgreSQL.

## Tecnologias

- TypeScript e Node.js
- Fastify
- Prisma ORM
- PostgreSQL
- Docker e Docker Compose
- Playwright e parsers para fontes que exigem extração de páginas
- Integrações MCP para fontes compatíveis

## Fluxo de processamento

```text
Fontes externas
      │
      ▼
Adaptadores de coleta
      │
      ▼
Normalização dos dados
      │
      ▼
Deduplicação
      │
      ▼
Motor de scoring
      │
      ├──────────────> Persistência
      │                     │
      ▼                     ▼
Relatórios              Dashboard
                            │
                            ▼
                  Preparação de candidatura
                            │
                            ▼
                    Revisão pelo usuário
```

A pontuação serve como apoio à triagem. Ela não representa uma garantia de compatibilidade ou de retorno em processos seletivos.

## Fontes de vagas

O projeto possui adaptadores para:

| Fonte | Estratégia |
| --- | --- |
| RemoteOK | API pública |
| Remotive | API pública |
| Jobicy | API pública |
| Programathor | Extração de páginas |
| GeekHunter | Automação de navegador |
| Gupy | Integração via MCP/API |
| Indeed | Integração via Bright Data, quando configurada |

A disponibilidade e o formato dos dados podem variar conforme cada serviço externo. Algumas integrações dependem de credenciais ou serviços de terceiros.

## Scoring

O motor calcula uma pontuação de compatibilidade de 0 a 100. Entre os critérios considerados estão:

- Compatibilidade de tecnologias.
- Modelo de trabalho.
- Senioridade.
- Experiência identificada na descrição.
- Localização.
- Requisitos de idioma.
- Informações adicionais da vaga.
- Correspondência com o currículo configurado.

As categorias e pesos são regras de triagem definidas no projeto, não uma avaliação objetiva do candidato nem uma previsão de contratação.

## Dashboard

A interface permite:

- Consultar e filtrar oportunidades.
- Ordenar vagas por pontuação e outros atributos.
- Favoritar e atualizar o status de vagas.
- Visualizar detalhes, motivos de compatibilidade e pontos de atenção.
- Acompanhar fontes e execuções de coleta.
- Consultar relatórios.
- Enviar um currículo em PDF para extração de informações, conforme os limites implementados.
- Preparar materiais de candidatura para revisão.

## Candidaturas e controle humano

O fluxo padrão é manual:

1. O sistema coleta e classifica as oportunidades.
2. O usuário analisa as vagas no dashboard.
3. O usuário escolhe quais materiais deseja preparar.
4. O sistema gera rascunhos e respostas de apoio.
5. O usuário revisa, ajusta e realiza o envio fora do sistema.

A opção `AUTO_PREPARE`, quando habilitada, pode preparar materiais para vagas que atendam aos critérios configurados. Ela não autoriza o envio automático de candidaturas.

O projeto não tem como objetivo contornar CAPTCHA, autenticação multifator ou mecanismos anti-bot.

## Executar com Docker

### Pré-requisitos

- Docker.
- Docker Compose.

Clone o repositório e configure o ambiente:

```bash
git clone https://github.com/Padokazzz/job-hunter.git
cd job-hunter
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações. Defina uma senha forte para o PostgreSQL e informe os dados de candidato exigidos pelo fluxo de preparação de candidaturas.

Inicie os serviços:

```bash
docker compose up -d
```

O dashboard fica disponível em:

```text
http://localhost:3000
```

Para acompanhar os logs:

```bash
docker compose logs -f dashboard
docker compose logs -f scheduler
```

Para executar uma coleta manual pelo serviço configurado:

```bash
docker compose --profile run-bot run --rm bot
```

Para encerrar:

```bash
docker compose down
```

## Configuração

As principais variáveis documentadas no projeto incluem:

| Variável | Uso |
| --- | --- |
| `CANDIDATE_NAME` | Nome utilizado na preparação de materiais. |
| `CANDIDATE_EMAIL` | Email utilizado na preparação de materiais. |
| `POSTGRES_PASSWORD` | Senha do PostgreSQL. |
| `DASHBOARD_PORT` | Porta publicada pelo dashboard. |
| `BRIGHTDATA_API_TOKEN` | Credencial opcional para a integração com Indeed. |
| `OPENAI_API_KEY` | Credencial opcional para recursos de análise com IA. |
| `AUTO_PREPARE` | Habilita a preparação automática segundo as regras configuradas. |
| `DATABASE_URL` | String de conexão com o banco. |
| `JOBHUNTER_DB_CONFIRMED` | Confirmação exigida pela configuração de banco do projeto. |

Consulte o `.env.example` para os nomes e formatos esperados. Não compartilhe nem versione credenciais reais.

## Desenvolvimento

Com Node.js instalado, os comandos disponíveis incluem:

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Executa o processo de coleta. |
| `npm run dashboard` | Inicia o dashboard. |
| `npm test` | Executa os testes. |
| `npm run db:push` | Aplica o schema ao banco. |
| `npm run db:generate` | Gera o cliente Prisma. |
| `npm run prisma:studio` | Abre o Prisma Studio. |

A configuração local pode exigir as mesmas variáveis de ambiente usadas pelo Docker.

## Testes

Execute:

```bash
npm test
```

A suíte existente cobre áreas como:

- Pontuação e classificação.
- Normalização de atributos de vagas.
- Filtros.
- Deduplicação.
- Adaptadores e parsers de fontes.
- Preparação de candidaturas e regras de execução.

## Estrutura principal

```text
bot/
├── src/
│   ├── main.ts
│   ├── config/
│   ├── shared/
│   ├── jobs/
│   ├── sources/
│   ├── scoring/
│   ├── applications/
│   ├── mcp/
│   ├── dashboard/
│   └── report/
├── public/
├── prisma/
├── scripts/
└── tests/
```

## Banco de dados e execução

O ambiente Docker utiliza PostgreSQL. O projeto também documenta a possibilidade de utilizar PostgreSQL gerenciado, como Supabase, por meio de uma string de conexão configurada no ambiente.

Antes de utilizar um banco externo, revise as instruções e o schema apropriado no repositório. Nunca use dados sensíveis reais em ambientes de teste sem necessidade.

## Limitações

- Fontes externas podem mudar suas APIs, HTML, limites ou políticas de acesso.
- A qualidade da pontuação depende das informações disponíveis na descrição da vaga e do perfil configurado.
- A coleta não garante que todas as vagas disponíveis serão encontradas.
- A preparação de candidatura exige revisão humana antes do envio.

## Licença

MIT
