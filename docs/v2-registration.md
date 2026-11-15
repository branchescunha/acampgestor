# V2: cadastro público e primeiro acampamento

O frontend deste incremento está implementado localmente e ainda não foi publicado. Conforme informado pelo responsável, a migration 014 foi aplicada em produção, trigger, policies e bloqueios de RPCs foram verificados, a Edge Function retorna HTTP 410 e o ADMIN continua funcionando. Cadastro e isolamento reais ainda não foram testados. Novos cadastros permanecem desativados e Confirm email, habilitado.

## Fluxo

1. O gestor abre `/cadastro` pelo link de login e informa nome, e-mail e senha.
2. Supabase Auth cria a conta com senha de pelo menos 6 caracteres e retorna uma sessão quando **Confirm email** está desabilitado. Não há aprovação administrativa, Google ou convite. Se o serviço continuar exigindo confirmação, a interface informa indisponibilidade do cadastro imediato; não apresenta o cadastro como concluído nem tenta contornar o serviço.
3. O SQL `014_public_gestor_registration.sql` cria um profile quando Auth preenche `email_confirmed_at`, inclusive automaticamente no insert. Esse campo não comprova titularidade da caixa postal. Somente o UID é usado como vínculo confiável; o papel é sempre `gestor`. Sem conflito, o status é `active`; com conflito entre IDs diferentes, é `suspended` e o e-mail fica `null`. Metadados públicos não definem permissões.
4. A sessão imediata é preservada e o login direciona GESTOR a `/gestor` (Meus Acampamentos) e ADMIN a `/admin`. Rotas internas de um acampamento podem ser retomadas; autorizações continuam sujeitas a profile ativo e RLS. O cadastro envia somente e-mail, senha e nome, sem privilégios ou vínculos por e-mail.
5. O gestor cria acampamentos independentes, inicialmente em rascunho, com slug e ranking público habilitado. `created_by` registra o responsável inicial e `organization_id` permanece `null`. O campo igreja/organização é apenas descritivo e não vincula organizações existentes.

Uma diretoria pode compartilhar uma conta e criar vários acampamentos independentes. Compartilhar credenciais reduz rastreabilidade e exige coordenação de senhas; não foram criados múltiplos profiles ou convites para essa finalidade. A autorização usa as policies existentes de GESTOR ativo e titularidade do acampamento. Profiles existentes, incluindo o ADMIN e usuários suspensos, não são atualizados pelo trigger. Não há transferência ou exclusão neste incremento.

## Configuração manual obrigatória

Antes de habilitar o fluxo em qualquer ambiente:

1. Validar o schema atual e os SQLs 001 a 013 no ambiente de teste. O repositório V1 não contém o DDL inicial das seis tabelas operacionais antigas; uma instalação vazia exige uma baseline revisada. Não executar os SQLs antigos indiscriminadamente em produção.
2. A Edge Function `approve-access-request` já foi substituída em produção e validada com `410` e `legacy_access_approval_disabled`, conforme informado pelo responsável.
3. A migration `supabase/sql/014_public_gestor_registration.sql` já foi aplicada e verificada em produção, conforme informado pelo responsável. Não reaplicá-la. Após preview, publicação autorizada e verificação do ADMIN, a configuração de cadastro e confirmação dependerá de autorização separada. O resultado esperado para o cadastro imediato é `mailer_autoconfirm=true`, `disable_signup=false`, `external.email=true`. Signup e login reais ainda precisam ser testados.
4. Em **Authentication > URL Configuration**, configurar a **Site URL** do ambiente e autorizar exatamente o callback de login. Para desenvolvimento: `http://localhost:4000/login`. Para a implantação futura: `https://acampgestor.vercel.app/login`. Não adicionar curingas amplos em produção.
5. O cadastro imediato não utiliza SMTP. Preservar templates, redirects e mecanismos de recuperação legados; não prometer entrega pública de e-mail pelo SMTP padrão. Esse serviço é limitado a destinatários autorizados da equipe Supabase.
6. Manter as variáveis públicas atuais `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Opcionalmente, configurar `VITE_SUPPORT_URL` com uma URL HTTPS pública de atendimento, sem credenciais; a variável é incorporada no build e não deve conter dados secretos. Sem uma URL válida, a tela informa que a recuperação assistida está indisponível. Não adicionar service role ao frontend.

A constraint nova aborta a migration inteira se houver camps com slugs `cadastro`, `gestor`, `forgot-password` ou `reset-password`. Nesse caso, revisar os conflitos manualmente antes de qualquer mudança; a migration não renomeia nem apaga esses camps.

O trigger não preenche profiles retroativamente. Contas antigas confirmadas sem profile continuam no tratamento administrativo anterior. A 014 já foi aplicada em produção; alterações posteriores exigem uma nova migration progressiva.

## Conflitos e criação administrativa

O tratamento de conflito captura somente a violação do índice `profiles_email_unique_idx`. Outros erros de banco continuam abortando a operação. Confirmar antes da aplicação que esse índice único existe em `lower(profiles.email)`, que `email` aceita `null`, que os helpers de autorização exigem profile ativo e que nenhum outro trigger de Auth cria profiles de forma incompatível.

Se outra identidade já ocupa o e-mail, o cadastro no Auth pode concluir, mas o novo profile fica em quarentena (`gestor`, `suspended`, `email = null`). A sessão não dá acesso operacional porque os helpers exigem profile ativo. Não há fusão de identidades ou alteração do profile anterior. A restrição única trata também concorrência; repetição para o mesmo UID não altera perfis ADMIN, suspensos ou já existentes. Remover o conflito depois não reativa a conta automaticamente.

A intervenção deve ser realizada pelo ADMIN autorizado: conferir ambos os UIDs no Auth, os profiles e o histórico administrativo, comprovar a relação do solicitante com a conta e só então corrigir o cadastro correspondente. Nem o e-mail no Auth nem `email_confirmed_at` comprovam titularidade neste modelo. Após a conferência, editar explicitamente o profile do UID correto e ativar como GESTOR. Não promover a ADMIN para solucionar conflitos. Não apagar, transferir ou sobrescrever outra identidade automaticamente. O log do trigger não inclui dados pessoais.

Em Usuários, a criação administrativa consulta primeiro o UID. Se o trigger já criou o profile, a tela carrega os valores reais para revisão e não aplica o payload de criação. Uma alteração de papel/status exige salvar explicitamente a edição, sujeita à RLS ADMIN existente. Se o trigger criar entre consulta e insert, uma violação única é reconsultada pelo mesmo UID; conflito de e-mail sem esse UID continua sendo erro. Não se cria usuário Auth por essa tela.

## Bloqueio dos fluxos legados

O SQL 014 substitui os corpos de `accept_invitation(uuid)`, `get_invitation_by_token(uuid)` e `add_organization_member_by_email(uuid,text,text)` por erro `42501`, sem acesso aos dados. As assinaturas sao preservadas. EXECUTE e revogado de PUBLIC, anon, authenticated e service_role. Mesmo uma chamada pelo dono da funcao encontra apenas a recusa, sem restaurar papéis ou reativar profiles.

Escritas em `access_requests` e `invitations` ficam indisponiveis para PUBLIC, anon e authenticated. A migration retira grants de tabela e de todas as colunas reais, inclusive os grants antigos do SQL 001. SELECT e registros historicos sao preservados, sujeitos a RLS.

Para evitar associacao direta via REST, uma policy INSERT restritiva em `organization_members` aceita somente o proprio criador ativo, como owner inicial de uma organizacao ainda sem membros. A 014 reafirma essa definicao em `can_create_initial_organization_membership(uuid)` e aborta se RLS estiver desativado na tabela. Isso preserva a criacao de organizacoes no ADMIN sem adicionar outras contas. UPDATE e DELETE ficam sem grants para os clientes, incluindo grants de coluna; uma policy UPDATE restritiva tambem impede contornar o bloqueio com as policies antigas. Nao ha edicao, reativacao ou inclusao de outros membros, nem pelo painel ADMIN. Os vinculos existentes e suas permissoes de leitura/acesso continuam preservados; nao ha migracao ou remocao de dados.

A Edge Function e um bloqueio separado e obrigatorio: o codigo anterior usa service role, pode criar contas Auth e ignora RLS. Revogar EXECUTE das RPCs nao neutraliza a versao publicada. A nova funcao responde `410` para toda chamada exceto preflight e nao consulta nenhum servico. O gateway pode recusar credenciais invalidas antes do handler; verificar a versao publicada com uma sessao ADMIN valida e sem expor o token.

`/solicitar-acesso` e `/convite/:token` redirecionam para `/cadastro`. `/admin/solicitacoes` e `/admin/convites` redirecionam para Usuarios; `/admin/organizacoes/:organizationId/membros` redireciona para Organizacoes. Os atalhos, metricas e botoes dos recursos desativados saem da navegacao. Os componentes antigos ficam sem rota/importacao em App; suas presencas no repositorio nao reabrem as permissoes do banco.

## Recuperação assistida

`/recuperar-senha` apresenta recuperação assistida. O suporte não pode validar titularidade somente pelo e-mail, nome, slug público ou `email_confirmed_at`: deve usar evidências independentes já estabelecidas (por exemplo, contato previamente validado e registros administrativos verificáveis). Não solicitar a senha antiga. Sem comprovação suficiente, recusar a alteração; ausência de evidências pode impedir recuperar uma conta. Não foi implementado endpoint público de redefinição ou ferramenta de suporte com poderes administrativos.

O mecanismo antigo de envio de link permanece no código e em `/recuperar-senha?modo=email`, para uso administrativo quando o destinatário estiver autorizado no serviço de e-mail. Esse parâmetro não concede privilégios nem garante entrega. A redefinição depende de uma sessão válida do Supabase; nenhuma senha pode ser alterada somente com e-mail/UID. A identidade do ADMIN não é exibida no fluxo público.

Antes de liberar o cadastro, o responsável deve definir um canal de suporte acessível aos usuários e um procedimento verificável de recuperação. O frontend não restringe o endpoint de recuperação do próprio Supabase; quando SMTP público for habilitado no futuro, o risco de atribuir dados a quem apenas controla o endereço exigirá nova revisão do modelo.

## Riscos aceitos e limites

Sem verificação, alguém pode cadastrar um endereço alheio antes do titular e impedir seu uso legítimo. A conta existente não é sobrescrita nem vinculada automaticamente por e-mail. Contas novas não recebem acesso a organizações ou acampamentos de terceiros: a criação usa `organization_id=null` e RLS por UID. É proibido tratar domínio de e-mail como pertencimento a uma igreja ou permitir suporte baseado somente nesse endereço.

Seis caracteres aumentam o risco de força bruta e reutilização; usar senhas longas e exclusivas, manter os limites do Auth e monitorar abuso. CAPTCHA, se necessário para lançamento público, exige uma etapa própria; não há CAPTCHA implementado aqui e não se deve habilitá-lo no servidor supondo que o formulário já envia token. Não foi criada unicidade global de ADMIN nem alterado o poder administrativo existente; a preservação do único ADMIN e qualquer ação privilegiada precisam ser verificadas no banco.

Comportamento do serviço conferido na [referência de signup](https://supabase.com/docs/reference/javascript/v1/auth-signup), [configuração Auth](https://supabase.com/docs/guides/auth/general-configuration) e [limites do SMTP padrão](https://supabase.com/docs/guides/auth/auth-smtp). Login sem verificação comprova posse da senha da conta, não posse do endereço informado.

## Validação antes de publicação

- Executar `npm test`, `npm run test:integration`, `npm run lint` e `npm run build`.
- `supabase/tests/014_public_gestor_registration.sql` continua sendo um teste de fixtures somente para banco isolado, com rollback. Nao executa-lo em producao. Cobre autoconfirmacao, ADMIN, suspensos, conflitos, isolamento, criacao de camps, bloqueio das tres RPCs, grants de coluna, escrita legada anonima/ADMIN, inclusao direta de outros membros e preservacao do owner inicial. O teste permanece preparado, nao executado.
- Na validação real autorizada, testar cadastro sem e-mail de confirmação, sessão imediata, logout/login, acesso a Meus Acampamentos, senha de 6 caracteres, criação de dois camps e operação pelo slug. Para contas novas, o profile deve surgir no insert do Auth. A migration 014 já foi aplicada; não repeti-la.
- Repetir com outro gestor e verificar que nenhum dos camps privados do primeiro e acessivel. Conferir o login ADMIN e a recusa dos antigos fluxos de solicitacoes/convites/membros. Ranking publico e intencionalmente acessivel e nao serve para medir acesso operacional indevido.
- Verificar criação administrativa com UID já provisionado: a tela Usuários deve abrir revisão, sem duplicar ou sobrescrever. Testar também suspensão, conflito e recuperação assistida somente com contas de teste autorizadas. Não alterar o ADMIN real para simular falhas.

Os testes Node exercitam helpers com Auth substituido na fronteira externa e executam o handler real desativado da Edge Function em um contexto local sem cliente Supabase. Não comprovam execução do trigger, RLS real, login HTTP ou runtime Deno. A aplicação da migration e a validação da Edge Function em produção foram informadas pelo responsável. Sem ambiente isolado, qualquer teste real em produção exige autorização e registros de teste claramente identificados. O backup foi verificado por leitura, sem ensaio de restauração; isso continua sendo uma limitação operacional.

## Sequencia segura de publicacao (somente apos autorizacao)

Os passos 1 a 4 abaixo registram a preparação anterior: o responsável informou que a Edge Function e a migration 014 já foram aplicadas e verificadas. Não repetir a aplicação. Continuar pela validação do frontend em preview e manter novos cadastros bloqueados até autorização separada.

1. Manter Confirm email habilitado e suspender temporariamente novos cadastros no painel Auth durante a janela de publicacao. Preservar sessoes e login existentes. Revisar backup, schema e owners das funcoes antes da 014; ela exige permissoes para substituir as tres RPCs, revogar ACLs, criar trigger em auth.users e criar policies.
2. Publicar exclusivamente a funcao de bloqueio no Supabase, por exemplo `supabase functions deploy approve-access-request --project-ref <ref-do-projeto>`, com CLI ja configurada, ou substituir seu codigo pelo painel. Nao publicar outras funcoes nem alterar secrets. Conferir a versao ativa, obter `410`/`legacy_access_approval_disabled` numa chamada autenticada e confirmar ausencia de efeitos. Se a chamada chegar ao fluxo antigo, interromper.
3. Aplicar manualmente a 014 inteira (`begin`/`commit`). Ela aborta se sobreviverem permissoes efetivas dos roles verificados, se houver conflito de slug reservado ou se faltar uma dependencia. Em caso de erro, confirmar rollback e interromper; nao executar trechos isolados para contornar a falha.
4. Conferir os bloqueios com as consultas somente leitura abaixo, revisar as duas policies restritivas e confirmar que a conta ADMIN e as contagens de dados existentes foram preservadas. Conferir tambem funcoes/policies extras presentes no banco real: o repositorio nao comprova ausencia de caminhos externos. Nao executar as fixtures SQL no banco oficial.
5. Publicar o frontend V2 na Vercel, com cadastro ainda suspenso. Conferir login ADMIN, paginas existentes e redirects antigos. Nao restaurar a Edge Function/RPCs inseguras como rollback do frontend.
6. Somente com todos os bloqueios verificados, desabilitar Confirm email e liberar novos cadastros no Auth. Conferir settings e executar os testes reais de cadastro, sessao imediata, GESTOR, camps e isolamento com contas autorizadas.
7. Se surgir falha, suspender novos cadastros, manter os bloqueios do backend e interromper a liberacao. Nao remover restricoes de identidade nem reativar profiles automaticamente para fazer o teste passar.

Verificacao somente leitura apos aplicar a migration (todos os booleanos abaixo devem ser `false`):

```sql
select r.role_name, f.signature,
  has_function_privilege(r.role_name, f.signature, 'EXECUTE') as can_execute
from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
cross join (values
  ('public.accept_invitation(uuid)'),
  ('public.get_invitation_by_token(uuid)'),
  ('public.add_organization_member_by_email(uuid,text,text)')
) as f(signature);

select r.role_name, t.table_name,
  has_any_column_privilege(r.role_name, t.table_name, 'INSERT') as can_insert,
  has_any_column_privilege(r.role_name, t.table_name, 'UPDATE') as can_update,
  has_table_privilege(r.role_name, t.table_name, 'DELETE') as can_delete
from (values ('anon'), ('authenticated')) as r(role_name)
cross join (values ('public.access_requests'), ('public.invitations')) as t(table_name);

select r.role_name,
  has_any_column_privilege(r.role_name, 'public.organization_members', 'UPDATE') as can_update_members,
  has_table_privilege(r.role_name, 'public.organization_members', 'DELETE') as can_delete_members
from (values ('anon'), ('authenticated')) as r(role_name);

-- Devem retornar exatamente duas policies, ambas RESTRICTIVE, com os guards da 014.
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'organization_members'
  and policyname in (
    'V2 only allows initial organization owner',
    'V2 freezes existing organization memberships'
  );
```

Referencias: [publicacao de Edge Functions](https://supabase.com/docs/guides/functions/deploy), [REVOKE de tabela e coluna](https://www.postgresql.org/docs/17/sql-revoke.html) e [policies restritivas](https://www.postgresql.org/docs/17/sql-createpolicy.html).
