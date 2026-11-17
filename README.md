# AcampGestor

Plataforma web para gestão de acampamentos, retiros e eventos, com organizações, equipes competitivas, quartos, participantes, pontuações, gincanas, inspeções, ranking público e exportação em Excel.

O AcampGestor separa a administração da plataforma, a gestão operacional de cada acampamento e a visualização pública dos rankings. A aplicação foi desenvolvida para igrejas, escolas e organizações que precisam gerenciar eventos com múltiplos responsáveis, dados isolados por acampamento e regras de acesso bem definidas.

**Produção:** https://acampgestor.vercel.app

## Demonstração

A aplicação está disponível em produção para demonstração dos fluxos públicos e das interfaces autenticadas conforme o perfil de acesso.

Principais fluxos:

- landing pública;
- cadastro de gestores;
- painel ADMIN;
- painel GESTOR;
- ranking público por slug do acampamento.

## Funcionalidades

### Acesso e autenticação

- autenticação com Supabase Auth;
- login por e-mail e senha;
- orientação de recuperação assistida e mecanismos legados de redefinição;
- página de conta;
- perfis `admin` e `gestor`;
- controle de status de acesso.

### Plataforma ADMIN

- dashboard administrativo;
- gestão de usuários;
- gestão de organizações;
- gestão de acampamentos;
- acesso administrativo às operações dos acampamentos.

### Gestão do acampamento

- painel por acampamento;
- cadastro de equipes competitivas;
- cadastro de quartos por equipe;
- cadastro de participantes;
- participantes vinculados à equipe e a um quarto dessa equipe;
- lançamento de pontos e penalidades;
- gincanas;
- inspeções;
- histórico de lançamentos;
- dashboard competitivo;
- exportação em Excel.

### Público

- landing pública;
- cadastro de gestores por e-mail e senha;
- ranking público por slug.

## Modelo de Domínio

O modelo unificado da V2 utiliza as mesmas equipes nas competições e na organização dos quartos.

**Equipe** participa da pontuação, das gincanas e do ranking do acampamento.

**Quarto** pertence a uma equipe. Cada participante é vinculado à equipe e a um quarto dela.

Exemplo:

```text
Participante: Maria
Equipe: Azul
Quarto: Levi
```

Inspeções acontecem nos quartos e pontuam a equipe correspondente. Gincanas podem premiar várias equipes. Dados históricos são preservados; os nomes físicos `competition_teams` e `tribes` continuam no banco por compatibilidade.

## Perfis de Acesso

### ACAMPANTE

- não possui login;
- acessa apenas o ranking público.

### GESTOR

- possui login;
- acessa os acampamentos permitidos;
- opera as rotinas do acampamento.

### ADMIN

- administra a plataforma;
- gerencia usuários, organizações e acampamentos;
- pode acessar operações administrativas dos acampamentos.

ADMIN e GESTOR utilizam painéis separados.

## Cadastro de Gestores

O cadastro V2 usa `/cadastro`, senha mínima de 6 caracteres e sessão imediata do Supabase Auth, sem aprovação administrativa ou confirmação de e-mail. Uma conta de responsável ou diretoria pode criar vários acampamentos independentes em Meus Acampamentos. A migration 014 e o frontend estão publicados; habilitar novos cadastros depende da configuração do Supabase Auth.

Solicitações, aprovações, convites e associação de membros por e-mail são desativados na V2, preservando os dados históricos. A Edge Function antiga foi desativada e validada com HTTP 410, conforme informado pelo responsável. A recuperação pública mostra um canal HTTPS somente quando configurado por `VITE_SUPPORT_URL`; sem configuração, informa que a recuperação assistida está indisponível. Consulte os riscos e a sequência de publicação em [cadastro V2](docs/v2-registration.md).

## Ranking Público

O ranking público fica disponível por slug do acampamento, sem exigir login.

O acesso utiliza views públicas específicas para retornar somente os dados mínimos necessários, sem expor informações pessoais completas dos participantes.

## Exportação

A exportação é feita por acampamento e gera um arquivo Excel com dados de:

- acampamento;
- equipes;
- quartos;
- participantes;
- histórico;
- pontos;
- penalidades;
- gincanas;
- inspeções;
- estatísticas por equipe.

## Arquitetura e Segurança

- autenticação com Supabase Auth;
- profiles com roles e status;
- Row Level Security no PostgreSQL;
- isolamento de dados por `camp_id`;
- controle de acesso por organização e acampamento;
- painéis separados para ADMIN e GESTOR;
- views públicas mínimas para ranking;
- fluxos legados de aprovação e convites bloqueados no backend;
- validação de variáveis públicas no frontend;
- exportação restrita a áreas autenticadas;
- sanitização de textos na geração de Excel;
- headers básicos de segurança em produção.

## Tecnologias Utilizadas

- React
- Vite
- JavaScript
- Tailwind CSS
- React Router
- Supabase
- Supabase Auth
- Supabase Edge Functions
- PostgreSQL
- Row Level Security
- Lucide React
- ExcelJS
- file-saver
- Node.js test runner / `node:test`
- Vercel

## Banco de Dados

O projeto utiliza PostgreSQL por meio do Supabase, com schema e políticas de acesso versionados em `supabase/sql`.

A estrutura contempla organizações, acampamentos, profiles, convites históricos, equipes, quartos, participantes, pontuação, gincanas e inspeções. Novas pontuações e resultados usam RPCs transacionais, autoria e chaves de idempotência.

## Estrutura do Projeto

```text
src/
  components/   Componentes reutilizáveis da interface
  domain/       Regras puras de ranking e pontuação
  features/     Regras e fluxos organizados por funcionalidade
  hooks/        Hooks compartilhados
  lib/          Configuração e integrações
  pages/        Telas da aplicação
  utils/        Utilitários compartilhados

supabase/
  functions/
    approve-access-request/
  sql/

tests/
  integration/
  qa-cleanup/

vercel.json
vite.config.js
package.json
```

## Status

O modelo unificado da V2 está publicado. As migrations 015–017 foram aplicadas, e as verificações estruturais de PostgreSQL, RLS e grants passaram em produção. Isso não substitui testes reais de escrita e isolamento com gestores. Consulte [o registro de publicação](docs/v2-production-release.md).

Interface com temas claro/escuro, destaque dourado e navegação responsiva. A release histórica `v1.0.0` permanece preservada.

Validações locais atuais:

- 109 testes automatizados;
- 10 testes de integração em memória aprovados e 1 teste real ignorado;
- lint aprovado;
- build de produção aprovado.

## Autor

André Vinícius Branches Cunha
