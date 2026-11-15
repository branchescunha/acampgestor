# AcampGestor

Plataforma web para gestão de acampamentos, retiros e eventos, com controle de organizações, acampamentos, Equipes/Quartos, Times competitivos, participantes, pontuações, gincanas, inspeções, ranking público e exportação em Excel.

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
- cadastro de Equipes/Quartos;
- cadastro de Times competitivos;
- cadastro de participantes;
- vínculos opcionais com Equipe/Quarto e Time competitivo;
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

O projeto separa organização operacional de competição.

**Equipe/Quarto** representa alojamento, organização interna e referência operacional do acampamento.

**Time competitivo** representa a disputa de pontos, ranking e gincanas.

Exemplo:

```text
Participante: Maria
Equipe/Quarto: Levi
Time competitivo: Azul
```

Um participante pode possuir os dois vínculos, mas ambos são opcionais. Inspeções usam Equipes/Quartos. Pontuação, gincanas e ranking usam Times competitivos.

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

O incremento local da V2 usa `/cadastro`, senha mínima de 6 caracteres e sessão imediata do Supabase Auth, sem aprovação administrativa ou confirmação de e-mail. Uma conta de responsável ou diretoria pode criar vários acampamentos independentes em Meus Acampamentos. A migration 014 foi aplicada em produção e suas verificações passaram, conforme informado pelo responsável. O frontend V2 ainda não foi publicado; cadastro e isolamento reais continuam pendentes de teste.

Solicitações, aprovações, convites e associação de membros por e-mail são desativados na V2, preservando os dados históricos. A Edge Function antiga foi desativada e validada com HTTP 410, conforme informado pelo responsável. A recuperação pública mostra um canal HTTPS somente quando configurado por `VITE_SUPPORT_URL`; sem configuração, informa que a recuperação assistida está indisponível. Consulte os riscos e a sequência de publicação em [cadastro V2](docs/v2-registration.md).

## Ranking Público

O ranking público fica disponível por slug do acampamento, sem exigir login.

O acesso utiliza views públicas específicas para retornar somente os dados mínimos necessários, sem expor informações pessoais completas dos participantes.

## Exportação

A exportação é feita por acampamento e gera um arquivo Excel com dados de:

- acampamento;
- Times competitivos;
- Equipes/Quartos;
- participantes;
- histórico;
- pontos;
- penalidades;
- gincanas;
- inspeções;
- estatísticas por Time.

## Arquitetura e Segurança

- autenticação com Supabase Auth;
- profiles com roles e status;
- Row Level Security no PostgreSQL;
- isolamento de dados por `camp_id`;
- controle de acesso por organização e acampamento;
- painéis separados para ADMIN e GESTOR;
- views públicas mínimas para ranking;
- Supabase Edge Function para onboarding;
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

A estrutura contempla organizações, acampamentos, profiles, convites, Equipes/Quartos, Times competitivos, participantes, pontuação, gincanas e inspeções.

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

O primeiro incremento da V2 (cadastro público de gestores e criação de acampamentos) está em desenvolvimento local. Consulte [configuração e validação do cadastro V2](docs/v2-registration.md) antes de habilitar o fluxo em um ambiente.

Versão estável `v1.0.0` publicada.

Validações históricas da release V1:

- 66 testes automatizados;
- lint aprovado;
- build de produção aprovado.

## Autor

André Vinícius Branches Cunha
