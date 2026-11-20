# Exclusão definitiva

Implementação local dependente da migration 021 e de uma nova publicação de `manage-user-account`. Nada deste procedimento foi executado em produção. Migrations 001–020 permanecem intactas.

## Comportamento

- Acampamentos: ADMIN ativo ou GESTOR ativo cujo UID seja `camps.created_by`. Participação na organização não concede exclusão. Exige digitar exatamente o nome do acampamento.
- Um trigger novo impede que um usuário autenticado não ADMIN altere `created_by` para tomar posse de um acampamento compartilhado. Não modifica as policies já aplicadas. A autorização rejeita também expressões SQL nulas: um suspenso sem exclusão pendente não pode iniciar uma operação nova.
- Uma única RPC transacional remove pontuações e penalidades, inspeções, gincanas, configurações, participantes, quartos, equipes, recibos operacionais, auditoria exclusiva e o acampamento. Views/ranking deixam de retornar seus dados. Contas e organizações não são removidas.
- Triggers de auditoria continuam habilitados; seus registros gerados durante a remoção são apagados por último. Dependências desconhecidas ou entre acampamentos abortam toda a transação, inclusive FKs com CASCADE/SET NULL.
- Equipes, quartos e participantes mantêm o CRUD atual e seus bloqueios por dependências. Pontuação, gincanas e inspeções continuam usando anulação/correção, não exclusão física isolada de histórico.
- Organizações continuam usando `delete_empty_organization`, somente ADMIN, com bloqueio por acampamentos/histórico. Não há nova cascata de organizações.

## Contas

`manage-user-account` verifica a sessão com Auth e passa exclusivamente o UID verificado às RPCs acessíveis somente a `service_role`.

1. Prévia somente leitura: lista acampamentos próprios, quantidades e impedimentos. ADMIN escolhe explicitamente um GESTOR; exclusão própria ignora qualquer UID alternativo do cliente.
2. Confirmação `EXCLUIR CONTA` e lista explícita dos acampamentos. A lista é comparada novamente sob lock. Exclusão própria também exige senha atual; um cliente Auth separado reautentica o mesmo UID, sem compartilhar sessão com outras requisições.
3. Uma transação remove dados exclusivos, vínculos de membership permitidos e suspende o GESTOR. Registra `account_deletion_jobs.state = pending_auth` sem excluir o Auth ou profile.
4. O backend chama `auth.admin.deleteUser(uid, false)`. Um trigger exige a preparação, o alvo GESTOR suspenso e a autorização ainda válida. A cascata existente Auth → profile é preservada. O trigger de conclusão grava `completed` na mesma transação do Auth.
5. O backend consulta o recibo após a chamada, inclusive após timeout/erro. Só informa sucesso com `completed`. Repetições não repetem a limpeza e podem concluir uma operação pendente.

Não são armazenados senhas, JWTs ou e-mails nos recibos. Permanecem UUIDs, nomes dos acampamentos, quantidades e datas para controle de repetição. Autoria por UUID e histórico de outros acampamentos permanecem intactos.

O guard do Auth repete a verificação das FKs no momento da remoção, bloqueando dependências surgidas depois da preparação. A consulta do recibo também exige ausência do Auth e do profile antes de reconhecer conclusão.

ADMIN nunca é alvo desse fluxo. Os guards do último ADMIN das migrations 019/020 permanecem ativos. Um alvo pendente não pode ser reativado, promovido, ter credenciais alteradas ou receber novos acampamentos. Sessões antigas perdem acesso operacional por falta de profile ativo; após a remoção, o UID já não existe no Auth.

Se o Auth falhar, os dados exclusivos já removidos NÃO são restaurados automaticamente. O profile permanece suspenso. O ADMIN retoma pelo mesmo botão na listagem de usuários. Se a própria conta já não consegue abrir a tela Conta, a conclusão precisa do ADMIN; não reativar o profile manualmente. A própria conta bem-sucedida encerra a sessão local e volta à página pública. `/gestor/conta` também funciona sem acampamentos.

### Dependências bloqueantes

Organizações criadas pelo alvo, propriedade exclusiva de organização, organizações compartilhadas nos acampamentos, referências legadas de convites/revisões, arquivos Storage e relacionamentos não reconhecidos bloqueiam a preparação. Não há transferência silenciosa nem exclusão desses dados. O ADMIN deve resolver os vínculos legitimamente ou excluir primeiro acampamentos próprios e depois organizações vazias. A prévia explica os impedimentos.

## Instalação controlada

Não executar sem autorização específica. Manter os gestores fora do sistema durante a instalação. Nenhum comando abaixo habilita cadastros públicos.

1. Executar `supabase/tests/021_permanent_deletion_preflight.sql` (somente leitura). Esperado: 020 pronta, pelo menos um ADMIN ativo, RLS/guards ativos, 021 ausente. Revisar FKs/triggers reais; a lista `unreviewed_child` deve estar vazia. Qualquer divergência bloqueia a aplicação.
2. Fazer backup lógico ATUALIZADO fora do repositório/OneDrive, via procedimento seguro existente: cliente PostgreSQL 17, senha interativa, `PGSSLMODE=verify-full` e CA oficial. Conferir saída, tamanho, `pg_restore --list` e leitura completa do arquivo. Isso não substitui teste de restauração.
3. Validar `supabase/tests/021_permanent_deletion_isolated.sql` exclusivamente em banco isolado com o marcador de Staging já previsto pelo projeto e schema compatível. O arquivo termina com ROLLBACK e recusa a ausência do marcador. Nunca criar esse marcador em produção.
4. Após aprovação do responsável, executar somente `supabase/sql/021_permanent_deletion.sql`: BEGIN/COMMIT internos, timeout e interrupção no primeiro erro. Não repetir automaticamente em caso de falha.
5. Executar `supabase/tests/021_permanent_deletion_checks.sql` (somente leitura). Esperado: readiness/020/guards verdadeiros, ADMIN preservado, RPC de acampamento para authenticated e não para anon; helpers/account RPCs inacessíveis a ambos; recibos com RLS e sem privilégios de clientes. Comparar contagens existentes antes/depois da instalação: a migration não contém limpeza/backfill.
6. Com autorização separada, publicar apenas a função atualizada, mantendo `verify_jwt=true`:

```powershell
npx --yes supabase@3.2.0 functions deploy manage-user-account --remote=zuxndxchkeynvjqustxk --use-api --yes
```

7. Configurar `ACCOUNT_DELETION_ENABLED=true` no ambiente da função somente após verificar a 021. A flag é desligada por padrão. Não alterar `ACCOUNT_SELF_EMAIL_ENABLED`, signup, SMTP ou outras configurações.
8. Validar bloqueios sem escrita: sessão ausente/inválida, GESTOR tentando prévia administrativa, ADMIN tentando prévia de ADMIN. Validar a integração Auth Admin e concorrência com contas sintéticas apenas no ambiente isolado. Não executar exclusões reais como teste de autorização.
9. Só então autorizar `VITE_PERMANENT_DELETION_ENABLED=true` e publicar o frontend. Sem a flag, não aparecem as novas exclusões. `VITE_ACCOUNT_MANAGEMENT_ENABLED` continua independente.

Exemplo de aplicação manual após autorização, em PowerShell local, usando o usuário EXATO obtido no Connect (não armazenar a senha):

```powershell
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = 'C:\Users\andre\Downloads\prod-ca-2021.crt'
$poolerUser = Read-Host 'Usuário exato do Session Pooler'
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -W -h aws-1-sa-east-1.pooler.supabase.com -p 5432 -U $poolerUser -d postgres -v ON_ERROR_STOP=1 -f 'supabase/sql/021_permanent_deletion.sql'
if ($LASTEXITCODE -ne 0) { throw 'Aplicação interrompida. Não repetir automaticamente.' }
```

Não usar `PGPASSWORD`, arquivo de senha ou transcrição contendo credenciais. Não reaplicar 001–020. Rollback do frontend não desfaz exclusões nem alterações do banco.

## Limitações de validação

Testes de handlers/adapters, contratos SQL e navegador com API simulada não comprovam execução dos triggers, concorrência ou Auth Admin em PostgreSQL real. O PostgreSQL local conhecido está incompleto e o Docker indisponível; a suite SQL foi preparada, não declarada aprovada. Antes da ativação, falta executar essa validação isolada e revisar o preflight real autorizado.

A limpeza usa locks de tabela de curta duração para impedir movimentações concorrentes inclusive por fluxos legados. Executar com usuários fora do sistema; timeout/deadlock aborta integralmente a preparação e deve ser investigado antes de uma nova tentativa. Não há transação distribuída entre a preparação SQL e a API Auth; o recibo persistente torna esse intervalo explícito e recuperável.

Validação local concluída: 171 testes da aplicação, 14 integrações em memória e um teste real opcional ignorado. Chromium e WebKit passaram nas 24 combinações de ADMIN/GESTOR, 390/768/1440px e temas claro/escuro, além da regressão de contas/organizações. As APIs foram inteiramente simuladas; nenhuma conta ou organização real foi alterada. A exclusão própria foi verificada até a página pública e a remoção da sessão local. Não houve teste em iPhone/Android físico, execução da 021 ou teste real de Auth Admin.
