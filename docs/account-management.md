# Contas e organizacoes — instalacao controlada

## Estado desta entrega

Header com atualizar/confirmacao, scroll por rota, podio desktop, email proprio confirmado via `auth.getUser()`, nome proprio do ADMIN e troca de senha propria independem da migration nova.

**Backend instalado em producao:** migration 020 aplicada com `COMMIT` e `V2_020_APPLIED_AND_VERIFIED`; Edge Function `manage-user-account` publicada como versao 1, `ACTIVE`, com `verify_jwt=true`. A funcao antiga permaneceu inalterada. A ativacao do frontend foi autorizada separadamente: `VITE_ACCOUNT_MANAGEMENT_ENABLED=true` esta configurada na Vercel para os builds de Production desta entrega. O valor ausente continua desabilitando os recursos em outros ambientes.

A aplicacao da 020 comparou contagens e fingerprints de 21 tabelas antes/depois, sem alteracao de dados: tres profiles, tres usuarios Auth, um ADMIN ativo, uma organizacao e dois acampamentos preservados. Nenhuma organizacao foi excluida nem conta real alterada nos testes.

Depois do deploy, seis verificacoes HTTP em producao passaram: sem sessao, JWT invalido e chave anon como Bearer retornaram 401; origem nao autorizada retornou 403; GET retornou 405; OPTIONS da origem oficial retornou 204 com CORS correto. Oito testes focados do handler passaram localmente com adapters.

Validacao posterior com sessoes reais e login interativo local: ADMIN ativo recebeu 200 em `capabilities` e `list-users`; GESTOR ativo recebeu 200 em `capabilities` e 403 em `list-users`. A listagem real retornou tres contas e nenhum GESTOR suspenso; o cenario de conta desativada ficou pendente, sem suspender ou criar usuarios para testa-lo. A resposta real do GESTOR confirmou `selfEmailEnabled=false`. O verificador chamou somente acoes de leitura, sem alterar profiles, nomes, emails, senhas ou organizacoes; logins normais criam sessoes Auth. Credenciais, JWTs, dados pessoais e o conteudo da listagem nao foram gravados no relatorio. Mutacoes Auth, concorrencia e entrega de email continuam sem validacao funcional real.

Ativacao autorizada: nao foi encontrada incompatibilidade nas assinaturas de frontend/Edge/RPC e as leituras autenticadas funcionaram. `VITE_ACCOUNT_MANAGEMENT_ENABLED=true` libera nome proprio do GESTOR, ferramentas ADMIN de contas e exclusao protegida de organizacoes. Senha propria ja utiliza o Auth. A troca propria de email permanece bloqueada explicitamente por `accountSelfEmailEnabled=false` no frontend, mesmo que a resposta de capacidades do backend seja alterada. Manter tambem `ACCOUNT_SELF_EMAIL_ENABLED=false` enquanto SMTP/Secure Email Change e entrega nao forem comprovados. A alternativa existente e correcao assistida pelo ADMIN. Nenhum SQL, deploy de Edge Function ou mutacao administrativa em dados reais foi realizado durante a ativacao do frontend.

Os testes desta ativacao usam exclusivamente fixtures para salvar nome/senha, corrigir email administrativamente, confirmar/cancelar operacoes e excluir/bloquear organizacoes. Nao comprovam essas escritas no Supabase real. A verificacao de navegacao visual aguarda a rota de destino e a rolagem zerada, com prazo limitado, em vez de assumir que o WebKit conclui a transicao em 150 ms. A navegacao da aplicacao nao foi alterada.

Validacao da ativacao: 158 testes da aplicacao e 10 integracoes em memoria aprovados; um teste real opcional ignorado. Lint e build com a flag ligada aprovados. Fluxos de contas/organizacoes aprovados em Chromium e WebKit com API simulada; 276 estados de layout em 23 rotas, 390/768/1440 px e temas claro/escuro aprovados, sem erros JavaScript nao tratados. Inspecao do build nao detectou chaves privilegiadas nem JWT `service_role`. Permanece o aviso conhecido do bundle ExcelJS maior que 500 kB.

Consulta publica de Auth em 19/11/2026: `disable_signup=true`, `mailer_autoconfirm=true`, `external.email=true`. O endpoint nao comprova SMTP, entrega de mensagens nem a configuracao de Secure Email Change. Nao ativar cadastros nem mudar essas configuracoes como parte desta instalacao.

## Instalacao, com autorizacao separada

Preparacao automatizada, sem aplicar SQL de instalacao:

```powershell
powershell -NoProfile -File .\scripts\prepare-account-management.ps1
```

O comando solicita o usuario exato do Pooler e duas senhas exclusivamente nos prompts locais: primeiro `psql`, depois `pg_dump`. Usa SSL `verify-full` e o CA oficial ja instalado. Executa o preflight em conexao somente leitura, bloqueia indicadores falsos/ADMIN ausente/orfaos/conflitos e chama o backup existente apenas se aprovado. Relatorios ficam em `%LOCALAPPDATA%\AcampGestor\migration-020-runs`; dumps ficam em `%LOCALAPPDATA%\AcampGestor\backups`, fora do repositorio. Nao existe modo de aplicacao nesse script. Revisar tambem as definicoes de FKs, triggers e policies do relatorio antes de autorizar a instalacao.

Depois de autorizacao especifica, em PowerShell com `PGSSLMODE=verify-full` e `PGSSLROOTCERT=C:\Users\andre\Downloads\prod-ca-2021.crt`, aplicar apenas a 020 e consultar as verificacoes na mesma conexao:

```powershell
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = 'C:\Users\andre\Downloads\prod-ca-2021.crt'
$poolerUser = Read-Host 'Usuario EXATO do Session Pooler (painel Connect)'
if ($poolerUser -cne 'postgres.zuxndxchkeynvjqustxk') { throw 'Projeto incorreto' }
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -W `
  --host=aws-1-sa-east-1.pooler.supabase.com --port=5432 `
  --username=$poolerUser --dbname=postgres --set=ON_ERROR_STOP=1 `
  --file=.\supabase\sql\020_account_and_organization_management.sql `
  --file=.\supabase\tests\020_account_management_checks.sql
if ($LASTEXITCODE -ne 0) { throw 'Interromper: nao repetir a migration automaticamente' }
```

`ON_ERROR_STOP` interrompe erros SQL, mas um resultado booleano falso nas consultas exige interrupcao operacional: nao publicar a funcao nem ativar a interface. O `COMMIT` da migration ocorre antes das verificacoes; falha posterior nao desfaz a instalacao. Nao confundir leitura integral/listagem do dump com um teste de restauracao.

1. Gerar backup atualizado pelo procedimento seguro existente. Manter senhas apenas nos prompts locais. Nao incluir dumps no Git.
2. Executar manualmente `supabase/tests/020_account_management_preflight.sql` (somente leitura). Exigir ADMIN ativo, duas protecoes 019 instaladas, RLS ativo, indice de email, app_metadata JSONB, ausencia de escrita anonima e zero orfaos/conflitos de mirrors. Inspecionar triggers extras e FKs desconhecidas antes de prosseguir. Nao reaplicar 001–019.
3. Aplicar `supabase/sql/020_account_and_organization_management.sql` inteiro: transacao explicita e timeouts; qualquer erro exige interrupcao. Nenhuma atualizacao historica em massa. Novos nomes sao restritos ao proprio UID ativo. Role/status/UID nao podem ser alterados por GESTOR. A protecao serializada do ultimo ADMIN permanece.
4. Executar `supabase/tests/020_account_management_checks.sql`. Esperar todos os indicadores instalados/RLS verdadeiros e ao menos um ADMIN ativo. `anon_execute=false` para todas as funcoes. `authenticated_execute=true` somente para `delete_empty_organization`; essa RPC exige ADMIN ativo internamente.
5. Publicar a funcao, somente apos autorizacao. Comando utilizado nesta instalacao: `npx --yes supabase@3.2.0 functions deploy manage-user-account --remote=zuxndxchkeynvjqustxk --use-api --yes`. O bundle e feito no servidor, sem Docker e sem adicionar dependencias ao projeto. Usar a verificacao JWT padrao; nao usar `--no-verify-jwt`. Se o gateway rejeitar a chave do projeto, interromper e investigar, nao desabilitar seguranca por tentativa. URL/anon/service_role vem dos secrets nativos do runtime, exclusivamente no servidor. Nunca definir secrets `VITE_*` privilegiados. Deploy ja concluido: nao repetir sem necessidade e autorizacao.
6. Validar com sessoes de contas existentes autorizadas, sem alterar o ADMIN: POST autenticado `{"action":"capabilities"}` e `{"action":"list-users"}` sao somente leitura. As leituras ADMIN/GESTOR ja passaram conforme registrado acima. Bloqueios de `reset-password`/`update-email` foram cobertos localmente, nao exercitados em producao nesta rodada. ADMIN ativo pode listar perfis com emails reais do Auth e corrigir apenas GESTOR existente por UID. Nao existe endpoint de cadastro ou exclusao Auth.
7. Somente apos banco e funcao conferidos, configurar `VITE_ACCOUNT_MANAGEMENT_ENABLED=true` na Vercel e publicar novo frontend. Ativacao autorizada para Production nesta entrega. Esta e uma flag de instalacao, nao uma barreira de seguranca. JWT, profiles ativos, RLS e triggers continuam obrigatorios no backend. Para desabilitar a interface, alterar a flag para `false` e gerar novo deployment; isso nao desfaz a migration nem altera dados.

## Email e senha

- Auth e a fonte de identidade; `profiles.email` e um mirror nullable, nunca criterio de associacao.
- O trigger novo copia apenas o email efetivamente alterado em `auth.users`. Email pendente nao e copiado. Conflito no indice do profile aborta a operacao inteira de Auth, sem roubar email nem associar pessoas. Corrigir a inconsistencia manualmente apos revisar os UIDs, nunca sobrescrever outra conta automaticamente.
- Sem SMTP verificado, manter `ACCOUNT_SELF_EMAIL_ENABLED` ausente/false na Edge Function. Troca propria de email permanece indisponivel. Validar no painel SMTP, Secure Email Change e entrega real para contas controladas antes de habilitar. A autoconfirmacao de cadastro NAO comprova a viabilidade da troca de email.
- Com envio verificado, o gestor usa `auth.updateUser({email})`; mostrar pendencia ate o Auth confirmar. Cadastrar as URLs de retorno de Conta na allowlist oficial do Auth, sem curingas globais ou dominos arbitrarios.
- ADMIN pode corrigir o email de um GESTOR via `updateUserById`, com `email_confirm:true`, apos verificar sua identidade fora do sistema. Essa operacao nao depende de SMTP e exige confirmacao explicita. UID, role, status e historico permanecem. O proprio email ADMIN fica somente leitura na interface.
- Redefinicao administrativa substitui a senha pelo Auth Admin API. Nao exibe senha antiga nem registra nova senha, payload ou token em logs. A senha nova e apagada do estado apos sucesso/cancelamento. Nao existe infraestrutura de troca obrigatoria no primeiro acesso; nao prometer essa garantia. Entregar a credencial por canal seguro e orientar troca propria imediata.
- Cada mutacao privilegiada leva um intent de 60 segundos em `app_metadata`, campo que o usuario comum nao pode editar: UID do ADMIN verificado, UID do alvo, acao e identificador aleatorio, sem senha/email/token. O trigger `acampgestor_guard_admin_auth_operation` valida esses dados dentro da transacao Auth, serializando com a protecao 019 e bloqueando o perfil do alvo. Promocao do alvo a ADMIN ou suspensao do autor durante a espera abortam a operacao. As permissoes nunca sao copiadas de `user_metadata`. O handler se recusa a operar se `account_management_ready()` nao confirmar os guards instalados.
- A listagem administrativa pagina Auth e profiles e reconcilia exclusivamente por UID. Contas sem profile aparecem sem papel/acesso e sem acoes de edicao; profiles sem Auth tambem ficam sem acoes. Nao se cria profile automaticamente para corrigir inconsistencias.
- Contas com historico usam **Desativar acesso**. Nao ha exclusao definitiva de Auth/profile nesta entrega. ADMIN nao pode ser suspenso/removido por essa tela, e a protecao do ultimo ADMIN permanece no banco.

## Organizacoes

RPC ADMIN transacional, com locks do perfil ativo do autor, da organizacao e dos vinculos antes da verificacao de dependencias. Qualquer FK existente para acampamentos ou historico, inclusive futuras tabelas, bloqueia a exclusao. Tambem verifica referencias aos IDs dos vinculos administrativos. Relacionamentos desconhecidos/compostos bloqueiam por seguranca. Apenas os vinculos administrativos de uma organizacao vazia sao removidos explicitamente antes dela; nao ha DELETE CASCADE adicionado nem grants amplos de DELETE.

## Validacao e limites

Testes locais de handler usam adapters; testes Chromium/WebKit usam Supabase ficticio e interceptacao de rede. Contratos SQL nao executam os triggers. A instalacao da 020 foi executada em PostgreSQL de producao e suas verificacoes estruturais, de permissoes e preservacao passaram. Isso nao valida funcionalmente os triggers: concorrencia e conflitos reais ainda precisam de testes autorizados. Nao considerar entrega SMTP, autorizacao funcional por RLS ou recuperacao de uma conta real comprovados por mocks ou consultas de catalogo.

Deno local nao esta disponivel; o handler JavaScript foi exercitado no Node. O entrypoint foi publicado e respondeu no runtime Supabase durante as verificacoes HTTP negativas, CORS e leituras autenticadas ADMIN/GESTOR. Operacoes de escrita e cenario com sessao de conta suspensa nao foram validados em producao.

Na preparacao da 020, os clientes PostgreSQL 17.12 respondem, mas a instalacao local continua sem `lib/dict_snowball.dll`; o daemon Docker tambem esta indisponivel. Nao houve teste funcional PostgreSQL isolado da 020. A configuracao publica do Auth foi consultada novamente: cadastro desabilitado, autoconfirmacao habilitada e provedor Email habilitado. SMTP e Secure Email Change permanecem nao comprovados; nao habilitar troca propria de email com base nesses tres indicadores.

A [implementacao oficial GoTrue de adminUserUpdate](https://github.com/supabase/auth/blob/master/internal/api/admin.go) envolve alteracoes de senha/email e app_metadata em `db.Transaction`. Esse comportamento fundamenta o guard. Permanecem pendentes os testes funcionais e concorrentes na versao instalada: autor suspenso/alvo promovido durante a operacao, bloqueio/rollback por conflito no mirror e preservacao de metadados de aplicativo anteriores. A autorizacao para ativar a interface nao comprova esses cenarios. Nunca executar esses testes concorrentes no unico ADMIN real.

Validacao local anterior ao deploy: 157 testes da aplicacao aprovados; 10 integracoes em memoria aprovadas e 1 verificacao real ignorada. Chromium e WebKit: 828 estados em 23 rotas, 9 larguras e 2 temas, mais os fluxos de conta/organizacao com a flag ligada e desligada, todos com fixtures e sem erros JavaScript nao tratados. Lint e build aprovados naquela rodada; permanece somente o aviso conhecido do bundle ExcelJS. A instalacao SQL posterior foi conferida conforme registrado acima, sem execucao dos cenarios funcionais ou concorrentes dos triggers.

O aviso de alteracoes nao salvas protege o botao Atualizar e a saida/reload nativos do navegador. Formularios removidos ou valores revertidos deixam de contar; senhas nao sao retidas no snapshot. A mudanca de rota SPA zera o rastreamento, mas nao implementa bloqueio geral de navegacao entre links. O reset de rolagem depende apenas do pathname, nao de filtros ou expansoes na mesma rota.

Referencias oficiais: [Auth updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [Auth Admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
