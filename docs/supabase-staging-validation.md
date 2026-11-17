# Validacao do modelo unificado no Supabase Staging

Estado: scripts preparados, **ainda nao executados em PostgreSQL/Supabase**. Os testes JavaScript em memoria nao comprovam constraints, RPCs ou RLS. Nao aplicar 015/016/017 em producao antes desta validacao.

## 1. Criar o ambiente

Crie um projeto Supabase separado, identificado como `acampgestor-staging`, preferencialmente PostgreSQL 17. Nao use o projeto `zuxndxchkeynvjqustxk`. Confira o project ref no painel antes de cada execucao. Nao copie usuarios, dados, secrets, backups completos ou configuracoes de producao.

Use o SQL Editor do Staging, conectado como `postgres`. Nao e necessario Docker, PostgreSQL local ou CLI. Mantenha o frontend publicado apontando para producao: esta etapa testa apenas o banco separado. Um futuro frontend de teste devera usar exclusivamente URL/chave publica do Staging.

As migrations 001-014 dependem de seis tabelas anteriores sem CREATE TABLE versionado: `tribes`, `participants`, `score_events`, `gymkhana_events`, `gymkhana_settings` e `room_inspections`. O arquivo de baseline abaixo reproduz suas colunas, checks e FKs originais, conferidos **somente no schema** do backup local de 2026-11-13. Nao e um clone certificado do schema atual: alteracoes manuais posteriores, grants e policies adicionais precisam ser comparados antes de liberar producao.

## 2. Instalacao no Staging vazio

Execute cada arquivo inteiro, em uma consulta separada; pare no primeiro erro. Nao execute comentarios com exemplos de atualizacao de dados. Nao execute apenas uma selecao do arquivo.

1. `supabase/tests/staging/000_legacy_baseline.sql`: substitua `REPLACE_WITH_STAGING_PROJECT_REF` pelo ref do novo projeto. Exige public vazio e nenhum usuario Auth; cria marcador exclusivo para os testes. O marcador e uma protecao operacional, nao uma descoberta automatica da identidade do servidor: confira o painel.
2. `supabase/sql/001_create_access_requests.sql`
3. `supabase/sql/002_create_camps.sql`
4. `supabase/sql/003_add_camp_id_to_operational_tables.sql`
5. `supabase/sql/004_add_public_slug_to_camps.sql`
6. `supabase/sql/005_create_profiles_and_roles.sql`
7. `supabase/sql/006_add_profile_email.sql`
8. `supabase/sql/007_create_invitations.sql`
9. `supabase/sql/008_create_invitation_acceptance_functions.sql`
10. `supabase/sql/009_add_invitation_delivery_fields.sql`
11. `supabase/sql/010_create_organizations.sql`
12. `supabase/sql/011_manage_organization_members.sql`
13. `supabase/sql/012_organization_security_hardening.sql`
14. `supabase/sql/013_create_competition_teams.sql`
15. `supabase/sql/014_public_gestor_registration.sql`
16. `supabase/tests/017_unified_preflight.sql`: conferir tipos, constraints e ausencia de dados (contagens zero neste banco vazio).
17. `supabase/sql/015_enforce_participant_group_camp.sql`
18. `supabase/sql/016_prepare_score_integrity.sql`
19. `supabase/tests/016_score_integrity_checks.sql`: executar **antes da 017**. Esperado: `aggregate_mismatches = 0`, anon sem totais privados e com totais publicos. Em banco vazio isso verifica estrutura, nao a matematica com dados.
20. `supabase/sql/017_unified_teams_rooms_and_results.sql`

Os arquivos 015/016/017 possuem transacoes individuais: falhar na 017 nao desfaz a 015 ou a 016 ja confirmadas. Se ocorrer erro de transacao, execute `rollback;` no Staging e registre arquivo/mensagem/SQLSTATE antes de continuar. Nao tente corrigir com remocoes de constraints ou desativacao de RLS.

## 3. Testes transacionais

Execute **todo** `supabase/tests/017_unified_model.sql` como postgres no SQL Editor. Nao ha comandos exclusivos de psql nem dependencia de PGOPTIONS. O script exige o marcador de Staging, cria identidades sinteticas `example.invalid`, acampamentos e fixtures, assume `authenticated`/`anon` com claims locais e termina em ROLLBACK.

Resultado esperado: `PASS: SQL assertions completed; all fixtures rolled back`. Uma excecao significa falha; nao continuar para producao. Execute `rollback;` caso a sessao fique em transacao abortada. Nenhuma fixture deve persistir. Sequencias podem avancar mesmo com rollback; isso nao representa dados residuais.

Cobertura preparada:

- cadastro autenticado de equipe, quarto e participante, edicao e exclusao sem historico;
- INSERT e UPDATE de participante rejeitando equipe diferente da equipe do quarto;
- valores positivos/negativos, mais de 1000 lancamentos sem truncamento e totais publicos/privados;
- gincana com varias equipes, edicao/anulacao conservando historico;
- inspecoes positivas e penalidades atribuidas a equipe do quarto;
- falha injetada ao gravar pontos desfazendo a gincana, com nova tentativa posterior;
- mesma chave/requisicao sem duplicacao; mesma chave/dados diferentes rejeitada;
- autoria autenticada e auditoria de alteracoes;
- RLS: gestor nao lista outro acampamento, nao cadastra equipe nele nem usa RPC estrangeira;
- ADMIN preservado e acampamento privado ausente no ranking publico anonimo;
- escrita direta no historico bloqueada e participante/quarto com historico protegidos.

Sao testes SQL de roles/claims simuladas, **nao testes de login, entrega de email ou JWT emitido pelo Auth**. Concorrencia real entre sessoes e repeticao apos falha de rede continuam pendentes. Antes de liberar, teste duas chamadas simultaneas da mesma RPC/chave em sessoes diferentes e confirme um unico resultado; teste tambem insercao de participante concorrendo com troca de equipe do quarto. Fixtures precisam ser persistidas exclusivamente no Staging para esse ensaio; nao reaproveite IDs de producao. Este ensaio nao esta automatizado no script transacional de sessao unica.

## 4. Verificar RLS e permissoes

Execute `supabase/tests/017_unified_security_checks.sql` (somente leitura).

- As nove tabelas listadas devem ter RLS ativo.
- Nenhum `anon` ou `authenticated` deve ter INSERT/UPDATE/DELETE, inclusive grants de coluna, nas tres tabelas de resultados ou nos recibos.
- Somente authenticated executa `save_camp_score`/`save_camp_result`; nenhum deles executa o helper interno.
- Anon nao le totais privados; ambos leem totais publicos.
- Policies operacionais devem condicionar acesso a `can_manage_camp`; confira policies adicionais permissivas, que se combinam por OR. Metadados corretos nao substituem os testes de acesso com duas identidades.

Depois do ROLLBACK, confirme no Staging: `select count(*) from auth.users where email like '%@example.invalid';` e `select count(*) from public.camps where slug in ('fixture-v2-a', 'fixture-v2-b');`: ambos zero.

## 5. Producao: somente leitura

No projeto de producao, execute **apenas** `supabase/tests/017_unified_preflight.sql`. Funciona antes da 017 e nao altera registros. Retorna schema/constraints, contagens e IDs de quartos/pontos pendentes, sem contatos ou nomes de participantes. A coluna ausente de equipe do quarto e tratada como NULL.

Quartos sem equipe exigem associacao explicita; participantes com equipes diferentes no mesmo quarto precisam ser reconciliados. Pontos sem quarto e sem equipe exigem decisao individual; nao associar por nome nem inferir automaticamente. Pontos historicos nao associados nao podem ser considerados no ranking definitivo. Preserve IDs e historico.

## 6. Criterio de liberacao

Bloqueado para producao enquanto instalacao e assertions nao forem executadas com sucesso no Staging, diferencas do schema real nao forem resolvidas e os ensaios de concorrencia/fluxo real nao forem concluidos. A baseline e proveniente de snapshot, nao da leitura atual de producao.

Depois dos testes, com backup atualizado e aprovacao do responsavel: reservar janela sem usuarios, aplicar 015 -> 016 -> 017 manualmente, publicar o frontend correspondente e reconciliar quartos antigos antes de considerar os rankings definitivos. A 017 revoga escritas usadas pelo frontend antigo: nao manter usuarios operando entre banco e frontend. Retornar apenas o frontend antigo nao desfaz a alteracao de permissoes do banco.

Nenhuma aplicacao remota, publicacao ou push faz parte desta preparacao.
