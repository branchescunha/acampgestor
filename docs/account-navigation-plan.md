# Contas, organizacoes e navegacao

Escopo: pedido de 19/11/2026. Preservar Auth, RLS, historico e migrations 001-019.

- [x] Header: recarregar a rota com confirmacao de formularios alterados e feedback acessivel.
- [x] Navegacao: zerar janela/containers na mudanca de pathname, sem afetar filtros na mesma rota.
- [x] Contas: consultar o usuario no Auth; manter email ADMIN somente leitura; validar senha e confirmacao. Preparar edicao de nome/email e administracao privilegiada sem ativar backend ausente.
- [x] Banco: migration 020 preparada, nao executada, para nome proprio, sincronizacao de email Auth e exclusao ADMIN de organizacoes sem dependencias. Mantida a protecao do ultimo ADMIN da 019.
- [x] Edge Function: JWT e ADMIN ativo, intent transacional e validacao do backend instalado. Codigo preparado, nao publicado. Troca de email propria depende de SMTP verificado.
- [x] Podio: tres degraus tambem no desktop, sem alterar calculos.
- [x] Validacao: 157 testes unitarios/contratos, 10 integracoes em memoria, 828 estados Chromium/WebKit com fixtures e fluxos privilegiados simulados. Lint/build/diff aprovados. Sem escritas reais.
- [x] Preparacao da publicacao: somente comportamentos independentes; recursos novos de backend ficam desligados por padrao ate instalacao manual autorizada.

Revisao de risco: email de profiles nao e fonte de identidade; conflitos devem abortar sem associar UIDs. Contas com historico devem ser desativadas, nao excluidas. SMTP e testes PostgreSQL reais nao podem ser presumidos a partir de mocks.
