# Contas e organizacoes — instalacao controlada

## Estado desta entrega

Header com atualizar/confirmacao, scroll por rota, podio desktop, email proprio confirmado via `auth.getUser()`, nome proprio do ADMIN e troca de senha propria independem da migration nova.

**Ainda nao instalados:** migration 020 e Edge Function `manage-user-account`. O frontend usa `VITE_ACCOUNT_MANAGEMENT_ENABLED=false` por padrao e nao oferece suas operacoes antes da instalacao. Nenhum SQL, deploy de funcao, exclusao ou alteracao de senha real foi executado nesta tarefa.

Consulta publica de Auth em 19/11/2026: `disable_signup=true`, `mailer_autoconfirm=true`, `external.email=true`. O endpoint nao comprova SMTP, entrega de mensagens nem a configuracao de Secure Email Change. Nao ativar cadastros nem mudar essas configuracoes como parte desta instalacao.

## Instalacao, com autorizacao separada

1. Gerar backup atualizado pelo procedimento seguro existente. Manter senhas apenas nos prompts locais. Nao incluir dumps no Git.
2. Executar manualmente `supabase/tests/020_account_management_preflight.sql` (somente leitura). Exigir ADMIN ativo, duas protecoes 019 instaladas, RLS ativo, indice de email, app_metadata JSONB, ausencia de escrita anonima e zero orfaos/conflitos de mirrors. Inspecionar triggers extras e FKs desconhecidas antes de prosseguir. Nao reaplicar 001–019.
3. Aplicar `supabase/sql/020_account_and_organization_management.sql` inteiro: transacao explicita e timeouts; qualquer erro exige interrupcao. Nenhuma atualizacao historica em massa. Novos nomes sao restritos ao proprio UID ativo. Role/status/UID nao podem ser alterados por GESTOR. A protecao serializada do ultimo ADMIN permanece.
4. Executar `supabase/tests/020_account_management_checks.sql`. Esperar todos os indicadores instalados/RLS verdadeiros e ao menos um ADMIN ativo. `anon_execute=false` para todas as funcoes. `authenticated_execute=true` somente para `delete_empty_organization`; essa RPC exige ADMIN ativo internamente.
5. Publicar a funcao, somente apos autorizacao: `supabase functions deploy manage-user-account --project-ref zuxndxchkeynvjqustxk`. Usar a verificacao JWT padrao; nao usar `--no-verify-jwt`. Se o gateway rejeitar a chave do projeto, interromper e investigar, nao desabilitar seguranca por tentativa. URL/anon/service_role vem dos secrets nativos do runtime, exclusivamente no servidor. Nunca definir secrets `VITE_*` privilegiados.
6. Validar com contas de teste autorizadas, sem alterar o ADMIN: POST autenticado `{"action":"capabilities"}`; GESTOR deve receber 403 em `list-users`, `reset-password`, `update-email`. ADMIN ativo pode listar perfis com emails reais do Auth e corrigir apenas GESTOR existente por UID. Nao existe endpoint de cadastro ou exclusao Auth.
7. Somente apos banco e funcao conferidos, configurar `VITE_ACCOUNT_MANAGEMENT_ENABLED=true` na Vercel e publicar novo frontend. Esta e uma flag de instalacao, nao uma barreira de seguranca. JWT, profiles ativos, RLS e triggers continuam obrigatorios no backend.

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

Testes locais de handler usam adapters; testes Chromium/WebKit usam Supabase ficticio e interceptacao de rede. Contratos SQL nao executam os triggers. A migration 020, concorrencia e conflitos reais ainda precisam de validacao PostgreSQL autorizada. Nao considerar entrega SMTP, RLS real ou recuperacao de uma conta real comprovados por mocks.

Deno nao esta disponivel nesta sessao; o handler JavaScript foi exercitado no Node, mas o entrypoint Deno/SDK precisa de verificacao no runtime isolado antes da ativacao. Nenhum backend novo esta liberado para producao apenas com estes testes locais.

A [implementacao oficial GoTrue de adminUserUpdate](https://github.com/supabase/auth/blob/master/internal/api/admin.go) envolve alteracoes de senha/email e app_metadata em `db.Transaction`. Esse comportamento fundamenta o guard, mas a versao realmente instalada e o rollback integral devem ser comprovados em teste Auth autorizado antes de habilitar a interface. Testar especificamente autor suspenso/alvo promovido durante a operacao, bloqueio/rollback por conflito no mirror e preservacao de metadados de aplicativo anteriores. Nunca executar esses testes concorrentes no unico ADMIN real.

Validacao local final: 157 testes da aplicacao aprovados; 10 integracoes em memoria aprovadas e 1 verificacao real ignorada. Chromium e WebKit: 828 estados em 23 rotas, 9 larguras e 2 temas, mais os fluxos de conta/organizacao com a flag ligada e desligada, todos com fixtures e sem erros JavaScript nao tratados. Lint e build aprovados; permanece somente o aviso conhecido do bundle ExcelJS. O SQL foi revisado estaticamente, nao executado.

O aviso de alteracoes nao salvas protege o botao Atualizar e a saida/reload nativos do navegador. Formularios removidos ou valores revertidos deixam de contar; senhas nao sao retidas no snapshot. A mudanca de rota SPA zera o rastreamento, mas nao implementa bloqueio geral de navegacao entre links. O reset de rolagem depende apenas do pathname, nao de filtros ou expansoes na mesma rota.

Referencias oficiais: [Auth updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [Auth Admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
