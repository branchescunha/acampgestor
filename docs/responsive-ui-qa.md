# Responsividade e regressão de interface

## Correções

### Homologação final da V2.0.0 (20/11/2026)

- O botão de envio dos formulários de acampamento ocupa o limite direito no desktop e toda a largura no mobile. No formulário ADMIN, sua área agora ocupa as duas colunas da grade, sem alterar os 21 turnos ou a persistência.
- Organizações: os campos não esticam pela altura de Observações. No desktop, select e textarea têm 50px, como os inputs; o select nativo do WebKit antes media 54px. Observações mantém rolagem e edição no desktop, e três linhas no mobile.
- A landing preserva os indicadores 8/142/24, com palavras inteiras, fonte mínima de 12px e espaçamentos reduzidos somente no mobile. O preview fictício usa Equipe Leão (980), Tubarão (850) e Águia (730), com emojis decorativos centralizados e nomes acessíveis. Nenhum ranking real foi alterado.
- Regressão focada em cinco telas, 320/375/390/414/768/1440px, ambos os temas e Chromium/WebKit: 120 estados de layout. Os sete cenários de erro/carregamento do cadastro passaram em cada motor, incluindo bloqueio de envios simultâneos. As respostas simuladas expõem o header de versão do Auth, necessário ao SDK para interpretar os códigos.
- O teste inicialmente identificou o desnível real do select no WebKit e uma resposta simulada incompleta; ambos foram corrigidos. Os testes usam exclusivamente fixtures, sem criar/excluir contas ou dados reais. Não equivalem a validação no iPhone físico ou a comprovação de signup no Supabase.

Para repetir somente esta rodada com os navegadores já disponíveis:

```powershell
$env:QA_PHASE = 'homologation'
$env:QA_PATHS = '/,/cadastro,/admin/acampamentos,/admin/organizacoes,/gestor'
$env:QA_WIDTHS = '320,375,390,414,768,1440'
npm run test:visual
```

### Correções anteriores

- `DateField` mantém o input nativo, seu tipo, valor ISO, eventos, validação e associação com labels. A borda e o padding pertencem ao wrapper; o input tem padding zero e `appearance: none`, sem substituir o seletor nativo por um calendário próprio. Todos os cinco campos de data usam o componente.
- O [bug WebKit 301648](https://bugs.webkit.org/show_bug.cgi?id=301648) documenta cálculo incorreto de `width: 100%` com padding em inputs temporais no iOS, inclusive com diferenças em relação ao desktop. A configuração anterior do projeto continha essa combinação. **O overflow específico do aparelho relatado não foi reproduzido no WebKit do Windows**; a correção remove essa condição, mas o seletor e a geometria no iPhone real ainda precisam de conferência.
- A regressão desktop foi reproduzida em Chromium e WebKit: na tabela de acampamentos em 1024 px, a coluna espremia botões até 22 px de largura e 155 px de altura. `ResponsiveTable` reserva 224 px para ações e usa container queries: a tabela aparece somente quando há ao menos 1024 px no próprio container, considerando o espaço ocupado pela sidebar; em menos espaço usa cards. Navegadores sem container queries mantêm os cards funcionais. `RecordActions` permite reorganização das ações sem quebra de palavras ou ícones. Rolagem horizontal fica restrita às tabelas extensas, não ao documento.
- O reset global não sobrescreve mais tamanhos e pesos tipográficos definidos pelas classes dos controles.
- O WebKit revelou overflow de 9 px no dashboard a 320 px: o nome da equipe líder mantinha largura mínima intrínseca ao lado do símbolo. A composição fica vertical nas telas menores, com texto encolhível e quebra de nomes históricos, preservando o alinhamento desktop.
- O pódio mobile usa alturas de 240/210/180 px, com base comum e ordem visual segundo/primeiro/terceiro. O desktop e os cálculos de ranking/desempate são preservados. Nomes completos continuam na classificação; símbolos históricos não são modificados.
- Símbolos de dois/três grafemas usam tamanho de texto adequado ao quadro mínimo de 40 px. Foi reproduzido overflow vertical de 53 px em um símbolo válido de três emojis antes desse ajuste. O texto completo e o título são preservados; valores históricos maiores continuam contidos em seu quadro, sem alteração de banco.
- ADMIN e GESTOR têm filtros Ativos/Arquivados e restauração explícita com confirmação. Ativos inclui rascunhos. Arquivar/restaurar reutiliza UPDATE do acampamento, sem DELETE ou duplicação de registros relacionados, sob as policies existentes. A restauração mantém a regra existente de voltar a habilitar o ranking público.

## Suíte de navegador

`npm run test:visual` inicia um Vite separado em `127.0.0.1:5191` com URL/chave **fictícias** de Supabase. Todas as requisições externas são interceptadas ou recusadas; fixtures reutilizam `tests/fixtures/acampGestorV1Scenario.js`. Sessões e escritas são simuladas. O servidor de QA é encerrado ao terminar ou falhar. A porta deve estar livre; a suíte não encerra servidores existentes.

A ferramenta Playwright deve estar disponível como ferramenta de desenvolvimento. Ela não foi adicionada às dependências da aplicação. Para usar uma instalação externa existente, configure `PLAYWRIGHT_MODULE_PATH` com o caminho do módulo `playwright` e instale seus navegadores Chromium e WebKit pela CLI oficial correspondente, sem alterar o projeto. [Documentação Playwright](https://playwright.dev/docs/browsers).

```powershell
$env:PLAYWRIGHT_MODULE_PATH = 'C:\caminho\das\ferramentas\node_modules\playwright'
node "$env:PLAYWRIGHT_MODULE_PATH\cli.js" install chromium webkit
npm run test:visual
```

O padrão é testar os dois motores; `QA_BROWSERS=chromium` ou `QA_BROWSERS=webkit` permite diagnóstico separado, sem representar aprovação dos dois. Screenshots e `report.json` ficam em uma pasta temporária fora do repositório; `QA_VISUAL_OUTPUT` permite escolher outro destino privado. Não versionar dumps, sessões, credenciais ou artefatos locais.

## Cobertura

- 23 rotas: landing, login, cadastro, recuperação/redefinição, ranking público/indisponível; dashboard ADMIN, acampamentos, usuários, organizações e conta; Meus Acampamentos, dashboard GESTOR, equipes, quartos, participantes, pontuação, gincana, inspeções, histórico, conta e exportação.
- Larguras: 320, 375, 390, 414, 768, 1024, 1280, 1440 e 1920 px, nos temas claro/escuro.
- Cada estado verifica overflow do documento, datas dentro dos wrappers, padding dos inputs, dimensões/recorte das ações e contenção de símbolos históricos. O pódio tem geometria e degraus verificados, inclusive com uma ou duas equipes.
- Screenshots em 390/768/1440 px para ambos os temas/motores. São evidências para inspeção, **não uma comparação automática pixel a pixel com um baseline aprovado**.
- Interações: edição/persistência ISO de datas e mínimo da data final, arquivar/restaurar sem perda de fixtures relacionadas, cancelar confirmações sem escrita, foco do modal, edição/ações CRUD, menu mobile/Escape e recuperação de erro simulado do ranking. Erros JavaScript não tratados causam falha.

## Resultado da rodada final

- 145 testes da aplicacao aprovados.
- 10 testes de integracao em memoria aprovados; 1 teste real ignorado.
- Chromium e WebKit: 828 estados aprovados, em 23 rotas, 9 larguras e 2 temas, sem erros JavaScript nao tratados.
- Lint, build e `git diff --check` aprovados. O build mantem o aviso conhecido de tamanho do bundle ExcelJS.
- As operacoes de navegador usam somente fixtures; estes resultados nao comprovam operacoes no Supabase real nem o seletor nativo do iPhone.

## Limites

WebKit no Windows e emulação móvel não equivalem ao Safari em um iPhone físico. O WebKit 26.5 instalado retorna `input.type = 'text'` para `type="date"`: nessa plataforma o controle temporal usa fallback textual e não valida `min` nativamente. A suíte exige que o formulário bloqueie o intervalo inválido por sua validação JavaScript, sem escrita, e verifica os valores ISO após a correção; no Chromium verifica também `rangeUnderflow`. Isso não comprova o comportamento do seletor nativo no iOS.

Antes da entrega oficial, conferir no aparelho: contenção dos três tipos de formulário (criação do gestor, acampamento ADMIN e participantes), abrir o seletor, preencher/editar/limpar, validar limites e salvar, em ambos os temas. Os testes locais não validam autenticação, RLS nem alterações reais de produção.

Nenhuma migration, regra de pontuação, política de autorização ou configuração de produção é modificada por esta correção.
