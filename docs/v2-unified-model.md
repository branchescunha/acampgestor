# Equipes e quartos unificados

Implementação dependente das migrations 015, 016 e 017. O PostgreSQL confirmou o COMMIT do pacote em produção em 2026-11-17; a verificação independente pós-migration passou em transação somente leitura no PostgreSQL 17.6, incluindo estrutura, RLS e grants. Não reaplicar o pacote. Os fluxos de escrita das RPCs e o isolamento com usuários reais não foram comprovados por essa verificação estrutural ou pelos testes JavaScript.

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

O responsável optou pela aplicação direta no projeto existente, sem Staging. O procedimento atual é [publicação direta em produção](v2-production-release.md): backup atualizado, preflight somente leitura, pacote transacional 015 → 016 → 017, verificação de permissões e publicação coordenada do frontend. Não executar baseline, fixtures nem reaplicar 001–014 em produção.

O [procedimento de Staging](supabase-staging-validation.md) permanece apenas como alternativa documentada, não executada. Sem ensaio em PostgreSQL, os testes SQL, a concorrência e os caminhos internos das RPCs continuam não validados. A opção por produção direta não comprova essas propriedades.

Se o pacote falhar antes do COMMIT, interrompa e reverta a transação inteira. Não publique o frontend dependente de uma migration que falhou. Após COMMIT, rollback apenas do frontend não desfaz permissões ou schema. Mantenha a janela sem usuários até concluir banco, frontend e verificações; reconcilie os quartos antigos antes de considerar o ranking definitivo.
