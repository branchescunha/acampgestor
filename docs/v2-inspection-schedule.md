# Correcoes finais: quartos e inspecoes

Migration 018 **aplicada em producao em 18/11/2026**, em transacao, com SSL `verify-full`. Ausencia dos objetos confirmada por consulta somente leitura antes da aplicacao; checks estruturais e de seguranca aprovados depois. Nao reaplicar 001-018. Operacoes reais de gestores e restauracao do backup continuam sem validacao nesta execucao.

Ranking sem entradas administrativas e quartos com tipo controlado/cor herdada estao no commit independente `2442d8b`. Os formularios de configuracao e inspecoes estao no commit `251f1df`; a dependencia da 018 foi satisfeita antes da integracao/publicacao na main.

Preflight e backup atualizado foram reutilizados na retomada, sem nova exportacao. Backup custom de 536759 bytes, com leitura integral/listagem verificadas; nenhuma restauracao foi realizada. O psql nativo foi aberto diretamente no console, sem pipeline, com senha interativa unica e sem armazenamento. Codigo de saida zero e marcador `V2_INSPECTION_SCHEDULE_VERIFIED` confirmados. Snapshots antes/depois preservaram os dados de acampamentos, quartos, equipes, participantes, inspecoes e pontuacoes, alem das policies e definicoes das RPCs/autorizacao existentes. Nenhum registro sintetico foi criado.

## Modelo e compatibilidade

- `camps.inspection_schedule`: JSONB nullable; lista de pares `{ "day": "Sexta", "period": "Noite" }`. As 21 combinacoes sao independentes; `[]` desativa novos lancamentos, sem apagar resultados.
- NULL preserva exatamente o comportamento anterior: sexta/noite, sabado/manhã-tarde-noite, domingo/manhã-tarde. Nenhum registro historico recebe dia/turno inventado.
- O banco valida pares e duplicidades. Turnos usados, inclusive por inspecoes anuladas, nao podem ser removidos da configuracao. Labels legados fora das 21 combinacoes ficam apenas no historico; nao sao convertidos automaticamente.
- O trigger de inspecoes consulta a configuracao do proprio camp com bloqueio de linha, protegendo contra alteracao concorrente do calendario. Edicoes sem mudar quarto/camp/dia/turno preservam labels legados. A RPC 017 continua responsavel por permissao, quarto/equipe do mesmo camp, transacao, pontuacao e idempotencia; nao foi reescrita.
- Novos quartos exigem Masculino/Feminino. Tipos antigos, inclusive NULL, permanecem sem conversao e podem ser preservados ao editar.
- A cor exibida e derivada da equipe atual; a coluna antiga tribes.color nao e apagada e recebe cor apenas ao criar um quarto, por ser NOT NULL. Alterar a cor da equipe nao exige regravar quartos.
- Gestores configuram turnos ao criar/editar em `/gestor`. ADMIN usa `/admin/acampamentos`. A edicao do gestor nao altera ownership, status ou permissao publica do acampamento.

## Procedimento utilizado (nao reaplicar)

1. Gerar backup atualizado com `scripts/backup-supabase-production.ps1`; manter janela sem lancamentos enquanto aplicar 018.
2. Executar somente leitura `supabase/tests/018_inspection_schedule_preflight.sql`. `schedule_already_exists` e `validator_already_exists` devem ser false; RPC existente e RLS devem ser true. Tipos/turnos legados nao bloqueiam a instalacao e serao preservados. Se ja houver objetos 018, parar e conferir; nao reaplicar.
3. Revisar e aplicar `supabase/sql/018_configure_inspection_schedule.sql` inteiro, com BEGIN/COMMIT, timeouts e psql `ON_ERROR_STOP`. Aplicacao ja concluida; nao executar novamente. A primeira tentativa falhou antes da conexao por falta de senha; a retomada confirmou a ausencia dos objetos por leitura antes de aplicar somente 018.
4. Executar `supabase/tests/018_inspection_schedule_checks.sql`, somente leitura. Esperado: nenhuma excecao, invalid_camp_schedules=0 e V2_INSPECTION_SCHEDULE_VERIFIED. Esses checks validam estrutura e a funcao pura, nao a execucao dos triggers em escritas reais.
5. Publicar o frontend da branch de correcao somente depois de confirmar o banco. O frontend anterior continua compativel com NULL; apos configurar turnos novos, ele nao apresenta todas as novas opcoes. Aplicar e publicar na mesma janela.

## Aceitacao funcional

Com conta autorizada e operacoes aprovadas: escolher combinacao personalizada na matriz, salvar/reabrir; conferir que turno usado fica bloqueado; selecionar equipe e verificar filtro/limpeza de quarto; lancar inspecao e conferir um unico lancamento na equipe do quarto; editar sem duplicar; consultar inspecoes antigas; tentar quarto/turno de outro acampamento e esperar rejeicao. A verificacao de trigger, concorrencia e RLS com usuarios reais permanece pendente ate execucao controlada. Nao usar fixtures permanentes em producao.

Validacao local deste incremento: 122 testes da aplicacao, 10 testes de integracao em memoria (1 live ignorado), lint/build e diff aprovados. Checagem de navegador com Supabase completamente simulado: 24 combinacoes de tela, viewport desktop/celular e tema claro/escuro, sem erros JS ou overflow horizontal. Foram conferidos filtro/limpeza de quartos, tipo legado, cor derivada, matriz de 21 checkboxes, turno usado bloqueado e payloads de criacao/edicao/RPC. Isso nao comprova execucao dos triggers nem persistencia real no Supabase.
