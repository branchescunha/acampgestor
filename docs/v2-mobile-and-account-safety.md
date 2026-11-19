# Correções mobile e segurança de contas

## Estado atual da migration 019

Aplicada em produção em 19/11/2026. O terminal confirmou `COMMIT` e `V2_019_APPLIED_AND_VERIFIED`; o relatório local registra instalação e verificações estruturais/permissões aprovadas, com o mesmo hash do SQL versionado. O preflight real e o backup atualizado foram concluídos antes da aplicação. Nenhum backup, log, status local ou credencial integra o repositório.

As verificações de instalação não comprovam os cenários funcionais ou concorrentes dos triggers. Esses testes, a restauração do backup e Safari/iPhone real continuam pendentes. A 019 **não deve ser reaplicada** em produção; os procedimentos abaixo documentam sua preparação e reprodução em outro ambiente compatível. Não foram criadas tag nem Release v2.0.0.

## Compatibilidade

O frontend usa o schema 018: exclusões de quartos e participantes respeitam os triggers de preservação de histórico da 017; equipes têm FKs restritivas. Pontuações são anuladas e gincanas/inspeções canceladas pelas RPCs transacionais existentes, com a mesma chave de idempotência em tentativas após erro. Acampamentos são arquivados, sem exclusão em cascata. Arquivar desabilita o ranking público, mas não é um bloqueio adicional de autorização dos dados privados.

Contas existentes podem ter seu nome editado e gestores podem ter o acesso suspenso/reativado por ADMIN. Não se exclui apenas o profile, pois isso não exclui a conta Auth. Não há exclusão física de contas nesta interface. Mudanças de papel e suspensão de ADMIN permanecem indisponíveis até validar a proteção de último administrador no banco e liberar a interface em uma alteração posterior.

O frontend exclui quartos inativos de novas seleções, preservando vínculos de edições antigas. A proteção equivalente no banco foi instalada pela 019. O versionamento desta entrega não executa SQL nem altera o frontend.

## Migration 019 aplicada

`supabase/sql/019_protect_admin_and_inactive_rooms.sql` é transacional e não altera dados existentes nem policies RLS. Revoga privilégios de mutação de `anon` e `PUBLIC` em `profiles`, `tribes` e `participants`, inclusive grants de colunas e TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. SELECT permanece inalterado. A transação aborta se sobreviver escrita anônima herdada ou se a revogação mudar SELECT/DML efetivos de `authenticated` ou `service_role`; não concede novos privilégios para compensar problemas desconhecidos. Adiciona proteção contra remoção/suspensão/rebaixamento do último ADMIN ativo, inclusive em updates de múltiplas linhas e exclusões em cascata do Auth. Escritas em profiles são serializadas e as linhas dos ADMINs ativos são bloqueadas em ordem de ID antes da checagem pós-statement. Um ator autenticado precisa continuar sendo ADMIN ativo depois da espera pelos locks. Operações privilegiadas sem UID (SQL Editor/backend confiável) continuam sujeitas à preservação do último ADMIN; clientes continuam dependendo de RLS e grants.

O advisory lock sozinho não elimina snapshots antigos em REPEATABLE READ. O bloqueio `FOR UPDATE` adicional permite detectar alterações concorrentes dessas linhas; falhas de serialização ou deadlock devem abortar a transação, nunca ser ignoradas. Testes reais de concorrência seguem pendentes. Referências: [isolamento PostgreSQL](https://www.postgresql.org/docs/17/transaction-iso.html) e [visibilidade dos triggers](https://www.postgresql.org/docs/17/trigger-datachanges.html).

Novos vínculos com quartos inativos, reativação de participantes e restauração de inspeções canceladas em quartos inativos são recusados. Edições dos vínculos históricos e cancelamentos continuam possíveis. `is_active = NULL` mantém a compatibilidade atual (somente `false` é inativo). A 017 continua validando equipe/quarto/acampamento; a 018 continua validando dias e turnos. Nenhuma RPC de pontuação é substituída.

A execução em produção e as verificações estruturais foram concluídas. A validação funcional em PostgreSQL isolado (incluindo duas sessões concorrentes removendo administradores diferentes) continua pendente. Para reprodução em outro ambiente, revisar as definições reais, obter backup atualizado e autorização específica. Não reaplicar migrations já instaladas.

Preflight somente leitura, sem dados pessoais:

```sql
select count(*) as active_admins from public.profiles where role = 'admin' and status = 'active';
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and
  ((table_name = 'profiles' and column_name in ('id','role','status')) or
   (table_name = 'tribes' and column_name in ('id','camp_id','is_active')) or
   (table_name = 'participants' and column_name in ('tribe_id','camp_id','is_active')) or
   (table_name = 'room_inspections' and column_name in ('tribe_id','camp_id','deleted_at')));
select c.relname, t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles','participants','tribes','room_inspections') and not t.tgisinternal;
```

Interromper se não houver ADMIN ativo, faltarem colunas ou existir trigger incompatível. A aplicação manual deve utilizar `ON_ERROR_STOP` no psql ou executar o arquivo inteiro no SQL Editor, sem remover `begin`/`commit`.

Verificação estrutural após aplicação, somente leitura:

```sql
select c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgname in ('profiles_lock_access_changes','profiles_require_active_admin',
  'participants_require_active_room','inspections_require_active_room');
select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('lock_profile_access_changes','require_active_platform_admin','require_active_room_assignment');
```

Esperado: quatro triggers habilitados (`O`), três funções SECURITY DEFINER com search_path vazio e sem EXECUTE para anon/authenticated. A listagem comprova instalação, não substitui os testes funcionais/concorrentes em PostgreSQL.

## Validação funcional sem produção

Verificar: cancelamento do modal sem escrita; falha e repetição de anulações com a mesma chave; bloqueio de exclusão com histórico; inativação/reativação preservando os pontos; nomes dos responsáveis via SELECT de `id,name` respeitando RLS (fallback: Conta não identificada); ausência de dados privados no ranking.

Datas mantêm o seletor nativo. Verificar 320, 375, 390, 414 e 768 px, claro/escuro, menu no header, foco/Escape, nomes e símbolos históricos longos. Testes Chromium não comprovam funcionamento em Safari real. WebKit/iPhone devem ser conferidos separadamente quando disponíveis.

## Conexão

Somente leituras GET/HEAD do PostgREST recebem timeout de 15 segundos. Não há repetição automática de escritas, alteração dos endpoints Auth ou cache offline de informações privadas. O botão Tentar novamente repete leituras das telas operacionais sem limpar os formulários. Sem internet antes do primeiro carregamento, o próprio Safari poderá mostrar sua página de erro; JavaScript ainda não carregado não consegue interceptar esse cenário.

## Histórico da entrega do frontend

- Frontend publicado: `00c22ebfdc821fbd2c7680790764d9a92d761e3f` em main.
- Deployment Vercel: `34Z8KQjqzMPMbuzNo9sRNhWgPnGU`, status success; domínio oficial servindo JS/CSS do build local. Rotas `/login`, `/gestor` e `/admin` responderam HTTP 200. Isso não comprova operações autenticadas no banco.
- 134 testes da aplicação aprovados; 10 integrações em memória aprovadas e 1 teste live não executado; lint, build e diff check aprovados. Aviso já existente de tamanho do chunk ExcelJS permanece.
- 132 combinações de tela/largura/tema em Chromium, sem overflow horizontal ou erros JavaScript; mais 10 verificações focadas em datas. Larguras: 320, 375, 390, 414, 768 e 1440 px. Supabase integralmente interceptado com fixtures: nenhuma escrita real. Cobertura adicional: menu/Escape, foco do modal, cancelar sem escrita, repetição de cancelamento com a mesma chave, símbolos inválidos, preservação de formulário, contas existentes e pódio com 1/2/3 equipes.
- WebKit não instalado. Safari/iPhone real e testes funcionais/concorrentes da migration 019 continuam pendentes.
- Naquela entrega do frontend, este roteiro e a 019 permaneceram locais e nenhum SQL foi executado. A aplicação posterior da 019 está registrada no estado atual acima.

## Origem dos erros do Console Ninja

As mensagens abaixo são falhas intencionalmente injetadas em `acampgestor-final-fixes-qa.cjs`, no diretório temporário do usuário:

| Tela | Mensagem | Origem |
| --- | --- | --- |
| Gymkhana | `Network error; simulated` | `failRpc = true`: resposta HTTP 503 simulada ao cancelar resultado; verifica recuperação e reutilização da chave de idempotência. |
| PublicCampRanking | `Simulated server outage` | `failReads = true`: resposta HTTP 503 simulada ao consultar camps; verifica mensagem e botão Tentar novamente. |

O harness intercepta as chamadas Supabase. O Console Ninja espelha o `logError` legítimo da aplicação; isso é diferente de uma exceção JavaScript não tratada (`pageerror`). Não se removeu nem silenciou o logger. Essa conclusão identifica essas mensagens específicas, não descarta outros erros que possam surgir em produção.

## Aplicação controlada da 019

Roteiro preservado para reprodução em ambiente compatível sem a 019. A produção já recebeu a migration; não executar novamente os passos de aplicação.

1. Confirmar o projeto de produção `zuxndxchkeynvjqustxk` no painel e reservar uma janela sem alterações administrativas/operacionais.
2. Executar **somente** `supabase/tests/019_admin_room_preflight.sql`. É READ ONLY, retorna metadados e contagem de ADMINs, sem e-mails ou registros pessoais.
3. Bloquear se houver colunas ausentes/tipos divergentes, nenhum ADMIN ativo, RLS desativado, roles anon/authenticated com superuser/BYPASSRLS, policies anônimas permissivas de escrita, policies que permitam escrita de gestores em profiles ou escrita entre acampamentos, RPCs legadas acessíveis, triggers desabilitados/incompatíveis ou instalação parcial da 019. O esperado antes da primeira aplicação é `existing_019_triggers = 0`; se retornar 4, verificar a instalação em vez de reaplicar.
4. Conferir especialmente que INSERT/UPDATE de profiles exigem ADMIN ativo; participantes/quartos devem exigir `can_manage_camp`. Grants de tabela/coluna não demonstram autorização efetiva: a RLS também precisa autorizar a operação. Uma policy permissiva adicional pode liberar acesso mesmo com outra policy permissiva mais limitada; policies RESTRICTIVE aplicáveis são combinadas por AND. O preflight lista ACLs de tabela/coluna, PUBLIC e roles herdadas. Grants diretos de anon/PUBLIC, sem policies anônimas de escrita, são uma pendência corrigível pela própria 019, não evidência isolada de acesso a linhas. Herança de outras roles ou dependência exclusiva de PUBLIC para DML autenticado bloqueiam a preparação para revisão. TRUNCATE/REFERENCES não são protegidos por RLS e serão revogados, sem tentar executar operações destrutivas. Referências: [RLS PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) e [REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).
5. Obter backup lógico atualizado fora do repositório/OneDrive, com SSL verify-full e CA oficial, verificando código de saída e `pg_restore --list`. Isso não comprova restauração. Não reutilizar automaticamente o backup antigo.
6. Validar a 019 em PostgreSQL isolado quando disponível, incluindo duas sessões concorrentes em READ COMMITTED e REPEATABLE READ. Casos mínimos: suspensão/rebaixamento/exclusão do último ADMIN (inclusive lote), ADMIN desativado enquanto aguardava lock, gestor tentando editar perfis, Auth cascade, novos vínculos/reativação com quarto inativo, edição de vínculos antigos e cancelamento de inspeção. Esses testes envolvem escritas: **não executar fixtures nem testes de falha em produção**.
7. Somente após revisar o preflight, tratar a pendência de validação PostgreSQL e obter autorização explícita, executar o arquivo completo `supabase/sql/019_protect_admin_and_inactive_rooms.sql`. Ele contém BEGIN/COMMIT e limites locais de lock (5s) e execução (120s). Não executar 001–018 nem a baseline de Staging. Se ocorrer erro, interromper: psql com ON_ERROR_STOP encerra a conexão e a transação não confirmada é desfeita; no SQL Editor, não prosseguir em transação abortada.
8. Executar `supabase/tests/019_admin_room_checks.sql`: quatro triggers corretos/habilitados, três funções VOLATILE/SECURITY DEFINER com search_path vazio, sem EXECUTE para anon/authenticated, ADMIN ativo preservado e policies/RLS inalteradas. `anonymous_mutation_privileges_revoked` e `public_mutation_grants_revoked` devem ser true nas três tabelas. Conferir nas definições o `FOR UPDATE`, a autorização após locks e o teste de restauração de inspeções.
9. Consultas pós-migration comprovam a instalação estrutural, não substituem teste real de concorrência ou de autorização. Liberar os fluxos existentes primeiro; editar papel/status de ADMIN na interface continua fora desta publicação até validação específica. Rollback do frontend não desfaz a migration.

Alternativa ao SQL Editor: reutilizar psql 17 pelo caminho absoluto, caso ainda esteja disponível. Informe o usuário **exato** do Session Pooler pelo painel Connect. A senha é solicitada somente pelo prompt local `-W`; não a coloque na connection string ou em arquivo. Os comandos abaixo são para execução manual, não foram executados nesta revisão:

```powershell
$pg = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$ca = 'C:\Users\andre\Downloads\prod-ca-2021.crt'
if (!(Test-Path -LiteralPath $pg) -or !(Test-Path -LiteralPath $ca)) { throw 'Confira psql e o certificado CA oficial.' }
$poolerUser = Read-Host 'Usuário exato do Session Pooler, conforme Connect'
$connection = "host=aws-1-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=$poolerUser sslmode=verify-full sslrootcert='C:/Users/andre/Downloads/prod-ca-2021.crt'"

# Primeiro: somente leitura. Revisar o resultado antes de qualquer escrita.
& $pg -X -W --set=ON_ERROR_STOP=1 --dbname=$connection --file='supabase/tests/019_admin_room_preflight.sql'
if ($LASTEXITCODE -ne 0) { throw 'Preflight falhou. Interrompa.' }

# NÃO executar estas linhas até a validação, backup e autorização específica.
$confirmation = Read-Host 'Após revisão e backup, digite APLICAR_019 para autorizar esta escrita'
if ($confirmation -cne 'APLICAR_019') { throw 'Aplicação não autorizada.' }
& $pg -X -W --set=ON_ERROR_STOP=1 --dbname=$connection --file='supabase/sql/019_protect_admin_and_inactive_rooms.sql'
if ($LASTEXITCODE -ne 0) { throw 'Migration falhou. Não prossiga.' }
& $pg -X -W --set=ON_ERROR_STOP=1 --dbname=$connection --file='supabase/tests/019_admin_room_checks.sql'
if ($LASTEXITCODE -ne 0) { throw 'Verificação falhou. Mantenha a operação interrompida.' }
```

Não executar esse bloco inteiro por conveniência: preflight, backup, autorização e aplicação são etapas separadas. Nunca reduzir a verificação SSL para contornar erro de conexão.

## Histórico da preparação

Os resultados abaixo correspondem à preparação anterior à aplicação, não ao estado atual da migration.

- Reforçada a 019 com bloqueio da tabela de profiles durante a instalação, bloqueio das linhas dos ADMINs ativos, revalidação do ator após locks e bloqueio de restauração de inspeções em quartos inativos. Nenhuma migration anterior foi modificada.
- 139 testes locais aprovados, incluindo cinco verificações estruturais da 019. Essas verificações leem o SQL: não simulam nem executam triggers PostgreSQL.
- 10 integrações em memória aprovadas e um teste live ignorado; lint/build aprovados. Repetidas 132 combinações de interface nos dois temas, em 320/375/390/414/768/1440 px, sem overflow ou pageerror. Duas chamadas de escrita foram simuladas no harness para testar falha/repetição de cancelamento, sem gravação real.
- Confirmadas no harness as duas mensagens de erro injetadas descritas acima. Logger preservado e nenhum ajuste de frontend necessário.
- GitHub e Vercel continuam no commit `00c22eb`; domínio oficial confirmou HTTP 200 e o bundle esperado. Não houve nova publicação, SQL remoto, aplicação de migration, tag ou Release.
- A migration, este roteiro, os dois scripts READ ONLY e os testes de contrato continuam locais. Falta validação funcional/concorrente em PostgreSQL, revisão do preflight real e autorização de aplicação. Safari/iPhone real não foi testado.

## Correção do preflight de ACL

O preflight real de 19/11/2026 confirmou PostgreSQL 17.6, 12 colunas compatíveis, um ADMIN ativo, RLS habilitada, roles anon/authenticated sem bypass e ausência dos objetos da 019. Foram encontrados grants efetivos de escrita para anon, mas as policies de escrita de profiles/tribes/participants eram exclusivas de authenticated. O bloqueio anterior testava somente grants, sem separar a camada RLS. A origem direta/PUBLIC/herdada é detalhada pelo preflight revisado; não se presume que PUBLIC seja a origem sem consultar suas ACLs.

A 019 remove esses grants sem tocar nos dados, Auth ou migrations anteriores. O primeiro procedimento interrompeu antes do backup; a nova preparação concluiu o preflight e gerou um backup atualizado, com hash, listagem e leitura integral conferidos, sem teste de restauração. Credenciais ficaram restritas ao terminal local, SSL verify-full e CA oficial. A preparação não aplicou a migration; a aplicação posterior exigiu autorização separada, confirmação exata, hashes dos arquivos/backup, verificações estruturais e comparação dos dados dentro da transação. Em caso de erro, interromper e consultar o estado somente por leitura, sem reaplicação automática.

O PostgreSQL isolado não inicializou porque falta `$libdir/dict_snowball` na instalação parcial. Os testes locais de contrato não comprovam execução dos triggers, concorrência ou restauração do backup.

O novo preflight real confirmou grants diretos para anon nas três tabelas, nenhuma policy anônima permissiva de escrita, nenhuma herança inesperada e nenhuma dependência de DML autenticado exclusivamente em PUBLIC. Também confirmou TRUNCATE direto para authenticated; a 019 o revoga nas três tabelas, pois ele ignora RLS e triggers de DELETE. O CRUD autenticado continua preservado. A verificação posterior deve retornar `authenticated_truncate_revoked = true`. A revisão adicional da 019 não mudou o schema consultado; seus novos hashes foram registrados explicitamente antes da aplicação, preservando os hashes originais do preflight para rastreabilidade.
