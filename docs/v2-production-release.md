# Publicacao direta do modelo unificado

## Estado atual: migrations aplicadas, nao reaplicar

O PostgreSQL confirmou COMMIT e V2_MIGRATIONS_COMMITTED em 2026-11-17. A verificacao posterior falhou na montagem de argumentos nativos do PowerShell, nao durante o pacote transacional. A verificacao independente foi concluida posteriormente em PostgreSQL 17.6 com transaction_read_only=on, exit code zero e V2_READ_ONLY_VERIFICATION_COMPLETE: colunas, relacionamentos, triggers, RPCs, views, RLS e grants passaram nas assertions. Isso nao comprova operacoes reais de escrita ou login.

Execute apenas `powershell -NoProfile -File .\scripts\verify-unified-production.ps1`. O script usa argumentos separados, ON_ERROR_STOP, SSL verify-full e BEGIN READ ONLY. Nao executa migrations ou fixtures. O antigo apply-unified-production.ps1 agora encaminha somente para essa verificacao, sem reaplicar SQL. Resultado e log ficam privados em `%LOCALAPPDATA%\AcampGestor\verification-runs`.

O marcador V2_READ_ONLY_VERIFICATION_COMPLETE e exit code zero confirmam as verificacoes estruturais, nao testes reais de Auth, RPCs de escrita ou isolamento por usuarios autenticados. Nao publicar antes desse gate.

Codigo preservado em `feature/v2-unified-model`, commit `f4cd9b9`; os ajustes posteriores precisam ser versionados. Nao executar baseline de Staging, migrations 001-014 ou fixtures em producao. As secoes 1-3 abaixo documentam o procedimento historico: **nao repetir a aplicacao 015-017**.

## 1. Janela sem uso e backup novo

Combine uma pausa real com os gestores e mantenha-a ate terminar banco, frontend e verificacoes. Nao ha modo de manutencao automatico nesta tarefa. Confirme no painel Connect o host Session Pooler `aws-1-sa-east-1.pooler.supabase.com`, porta 5432, banco postgres e usuario exato do projeto. Se mudaram, interrompa e ajuste os parametros com revisao, nao improvise.

Execute em um PowerShell local interativo, na raiz do repositorio:

```powershell
powershell -NoProfile -File .\scripts\backup-supabase-production.ps1
```

O script usa pg_dump 17 pelo caminho absoluto, formato custom, `-W`, `PGSSLMODE=verify-full` e o CA ja existente em Downloads. A senha e solicitada pelo pg_dump, nunca pelo script nem pela linha de comando. Salva em `%LOCALAPPDATA%\AcampGestor\backups\backup-<id>`, fora do OneDrive/repositorio. Nao reutiliza o backup antigo. Falha se pg_dump/listagem/leitura integral falharem, o arquivo estiver vazio ou faltarem entradas de dados public/Auth.

Confira codigo de saida zero, tamanho, SHA256 e `contents.txt` privado. Revise qualquer aviso de permissao antes de prosseguir. A leitura integral com pg_restore direcionada a NUL testa leitura/descompressao, **nao restaura nem comprova restaurabilidade**. O dump nao cobre papeis globais, secrets/configuracoes da plataforma ou arquivos binarios do Storage. Proteja-o como dado sensivel; herda as permissoes da pasta do usuario, nao e criptografado pelo script.

## 2. Preflight somente leitura em producao

Execute inteiro `supabase/tests/017_unified_preflight.sql` no SQL Editor, como postgres. Envie os resultados para revisao antes da aplicacao; nao envie dumps, senhas ou dados pessoais.

- Dependencias `has_*` devem ser true; tipos UUID/integer/text e constraints devem ser compativeis com o SQL. Conferir unique `(id,camp_id)` em competition_teams e ausencia de checks antigos de winning_team limitados a A/B ou pontos limitados a positivos.
- RLS deve estar ativo nas tabelas operacionais e camps. Conferir policies permissivas adicionais e helper de autorizacao existente. Policies historicas FOR ALL permanecem, mas 017 revoga os grants de escrita nas tabelas de resultados.
- Objetos novos normalmente nao existem; se existirem, compare tipos, funcoes, assinaturas, indices e definicoes de views com 016/017 antes de prosseguir. IF NOT EXISTS nao valida compatibilidade. As views de totais existentes, se houver, precisam ter as mesmas cinco colunas iniciais/tipos da 016; 017 acrescenta participants_count no final.
- `invalid_existing_room_teams`, `participant_room_camp_conflicts` e `duplicate_score_operation_keys` devem ser zero. Conflitos de participantes podem nao impedir DDL, mas impedem uso correto e precisam de resolucao explicita.
- Quartos sem equipe e pontos sem associacao sao pendencias de reconciliacao, nao motivo para apagar dados. O relatorio identifica os IDs. Quartos com participantes em equipes diferentes precisam de separacao/movimentacao explicita, sem inferencia por nome. Pontos sem quarto nem equipe requerem decisao individual. Autoria antiga desconhecida permanece NULL.

Sem estes resultados atuais, a compatibilidade real continua **pendente**. Nao afirmar aprovacao com base apenas nos testes JavaScript.

## 3. Pacote transacional 015 -> 016 -> 017 (historico, ja aplicado)

Depois de aprovar o preflight, gere o pacote localmente (nao conecta ao banco):

```powershell
powershell -NoProfile -File .\scripts\prepare-unified-production-sql.ps1
```

O comando imprime o caminho privado `015-017-production.sql` e seu SHA256. O conteudo e gerado dos tres arquivos SQL atuais, na ordem, substituindo somente BEGIN/COMMIT externos por uma transacao unica, com lock_timeout 5s e statement_timeout 120s. Nao ha migrations novas nem modificacoes em 001-014.

Abra o arquivo gerado, confira as tres secoes SOURCE e execute **todo o conteudo de uma vez** no SQL Editor da producao. Nao executar partes selecionadas nem tambem reaplicar os arquivos individuais. Se qualquer instrucao falhar, a transacao inteira nao pode confirmar; execute `rollback;` se a sessao continuar abortada. Nao contorne locks/timeouts desativando constraints ou RLS: mantenha usuarios fora, investigue e repita apenas depois de resolver.

O pacote nao altera dados historicos por DML nem associa quartos automaticamente. Ele acrescenta colunas/views/RPCs/triggers, remove a restricao antiga de tipos de quarto e troca permissoes de escrita. **Criar as funcoes nao executa todos os caminhos internos das RPCs**; sem ensaio PostgreSQL previo, permanecem riscos de runtime. Publicacao direta aceita esse risco adicional, nao o elimina.

Depois do COMMIT, execute somente `supabase/tests/017_unified_security_checks.sql`. Espere RLS true, escrita direta false inclusive em colunas, RPCs publicas apenas para authenticated, helper interno false e anon sem totais privados. Se falhar, nao liberar usuarios nem publicar cegamente. Nao executar os testes 017_unified_model.sql ou a baseline em producao.

## 4. Frontend e verificacao minima

Nao publicar antes de concluir a etapa anterior. Registre o commit/deployment atualmente em producao. Com autorizacao de publicacao, revise e versione os ajustes locais da preparacao; entao integre a feature em main somente se o fast-forward for possivel. Exemplo (nao executado nesta preparacao):

```powershell
git diff --check
git add -- scripts/backup-supabase-production.ps1 scripts/prepare-unified-production-sql.ps1 docs/v2-production-release.md docs/v2-unified-model.md supabase/tests/017_unified_preflight.sql
git commit -m "chore: prepare unified model production release"
git fetch origin
git switch main
git merge --ff-only origin/main
git merge --ff-only feature/v2-unified-model
git push origin main
```

Se houver divergencia ou conflito, pare; nao force push. O push main aciona a Vercel existente. Confirme deployment Ready e dominio oficial antes de liberar usuarios.

Checklist manual com operacoes reais apenas aprovadas pelo responsavel:

1. Login de gestor e ADMIN; listagem/criacao de acampamento com created_by correto.
2. Equipe -> quarto dessa equipe -> participante; rejeitar vinculo cruzado.
3. Pontos positivos e penalidade com motivo; conferir saldo e autoria no historico.
4. Gincana premiando duas equipes; editar resultado e conferir anulacao dos pontos anteriores.
5. Inspecao do quarto pontuando sua equipe uma unica vez.
6. Dashboard/ranking publico com os mesmos totais; exportacao Excel e historico preservados.
7. Segunda conta sem acesso ao acampamento privado da primeira; ADMIN mantendo suporte.
8. Reconciliar quartos/pontos antigos antes de declarar o ranking definitivo.

Nao executar fixtures, testes de falha ou concorrencia destrutiva em producao. Nao apagar registros usados no checklist. Se aparecer erro, suspenda novas escritas e registre mensagem/SQLSTATE, sem expor tokens.

**Rollback:** antes do COMMIT, a transacao reverte o pacote em caso de erro. Depois do COMMIT, voltar apenas o deployment antigo NAO restaura grants/schema e pode quebrar suas escritas. Nao ha down-migration automatica preparada; correcao progressiva ou restauracao requer plano e autorizacao separados, considerando dados novos. Nao promover frontend antigo como rollback completo.

Referencias: [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [limites dos backups Supabase](https://supabase.com/docs/guides/platform/backups).
