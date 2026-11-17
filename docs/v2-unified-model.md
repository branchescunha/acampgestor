# Equipes e quartos unificados

Implementação local dependente das migrations 015, 016 e 017. Nenhuma delas foi executada por esta implementação. Testes JavaScript não validam triggers, transações ou RLS reais.

## Modelo

- `competition_teams`: cadastro único de equipes do acampamento, usado em todas as competições.
- `tribes`: quartos, com `competition_team_id` apontando para a equipe do mesmo acampamento. O nome físico foi preservado para manter IDs, referências e histórico.
- `participants`: equipe em `competition_team_id` e quarto dessa equipe em `tribe_id`. Novos vínculos exigem os dois campos. Atualizações sem mudança de vínculo em registros antigos continuam possíveis no banco durante a transição; o formulário exige completar os vínculos ao editar.
- `score_events`: lançamentos por equipe. Inspeções também guardam o quarto de origem. Anulações conservam os valores originais, autoria e motivo; não contribuem para os totais.
- `gymkhana_events.awards`: lista de equipes e pontos inteiros livres por prova. Os campos antigos de vencedor mantêm o primeiro prêmio apenas para compatibilidade; a interface e o Excel usam a lista inteira.
- `room_inspections`: resultados por quarto. A RPC obtém a equipe do próprio quarto, sem distribuição ou multiplicação por participantes.

`/equipes` gerencia equipes; `/quartos` gerencia quartos; `/times` redireciona para equipes. O ranking inclui todas as equipes ativas, inclusive as que ainda não têm participantes ou pontos.

## Histórico e transações

`save_camp_result` grava ou anula gincanas/inspeções e seus pontos na mesma transação. `save_camp_score` faz o mesmo para lançamentos manuais. Edições anulam os pontos anteriores e criam novos lançamentos; resultados são excluídos logicamente. `camp_operation_audit` preserva imagens anteriores, enquanto `camp_operation_receipts` conserva os recibos de idempotência.

As RPCs verificam `auth.uid()` e `can_manage_camp`, validam vínculos e usam uma chave de operação por acampamento. Repetir a mesma chave e requisição devolve o recibo; trocar os dados com a mesma chave é rejeitado. O cliente mantém a chave ao repetir uma tentativa que falhou. Recarregar a página perde essa tentativa em memória: antes de recriar uma operação cujo resultado ficou incerto, confira o histórico.

Escrita direta nas três tabelas de resultados é revogada para `authenticated` e `anon`. Autenticação e definição de ADMIN/GESTOR não mudam. A autoria identifica a conta autenticada; não identifica qual pessoa usou uma conta compartilhada. Autores antigos desconhecidos permanecem nulos.

## Dados antigos

Não há conversão automática de quarto em equipe nem associação por nome. Depois da migration, vincule cada quarto antigo à equipe correta pela interface. Os IDs e os dados permanecem intactos. Se participantes do mesmo quarto estiverem em equipes diferentes, primeiro crie/vincule os quartos corretos e mova esses participantes; só então atribua a equipe ao quarto original.

Pontos antigos vinculados somente ao quarto entram na equipe quando houver essa associação explícita. Quartos sem equipe mantêm seus pontos no histórico, mas eles ficam pendentes de atribuição no ranking. Não considere o ranking definitivo antes de reconciliar esses vínculos. Um quarto já associado que tenha participantes ou histórico não pode trocar de equipe nem ser excluído, evitando deslocar pontos históricos.

## Validação e publicação

1. Confirme o schema atual com `supabase/tests/017_unified_preflight.sql` e faça backup antes de qualquer escrita em produção.
2. Use um Supabase isolado ou PostgreSQL 17 com o schema original, Auth, funções e policies existentes. As migrations 001–013 não recriam sozinhas todas as tabelas originais. Não copie dados pessoais para os testes.
3. Aplique 015, depois 016 e depois 017 nesse ambiente. Execute as verificações da 016 antes da 017; a 017 altera os agregados para também representar equipes sem pontos.
4. Siga [o procedimento de Staging](supabase-staging-validation.md), incluindo a baseline legada. Execute `supabase/tests/017_unified_model.sql` inteiro no SQL Editor do Staging, como postgres. O script exige o marcador de Staging, cria fixtures sintéticas, injeta uma falha e termina com rollback. Verifique também concorrência em duas sessões: uma inserindo participante e outra tentando trocar a equipe do quarto.
5. Faça testes de interface com duas contas e ADMIN: criar equipe/quartos, vincular participante, lançar pontos/penalidades, premiar várias equipes, editar/anular resultados e conferir ranking público e Excel.
6. Somente após a validação, reserve uma janela sem uso para aplicar manualmente 015 → 016 → 017 e publicar o frontend correspondente. O frontend anterior perde permissão de escrita nos resultados após 017; não deixe usuários operando durante essa transição.
7. Reconcilie os quartos antigos e confira os totais antes da utilização real.

Se a aplicação de um arquivo falhar, sua transação deve ser desfeita por completo. Não publique o frontend dependente de uma migration que falhou. O banco isolado e os testes SQL ainda precisam ser executados: a implementação não está aprovada para produção apenas por passar em lint e build.
