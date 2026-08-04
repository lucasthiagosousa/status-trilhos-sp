# Status Trilhos SP

Painel web responsivo para acompanhar o status operacional das linhas de metrô e trem retornadas por uma fonte pública.

## Funcionalidades

- consulta automática ao abrir e a cada 60 segundos;
- atualização manual;
- busca por nome ou número da linha;
- filtros para todas, normais e com problemas;
- contadores operacionais;
- cartões com cores semânticas e limites visuais claros;
- cache local da última resposta válida;
- cache compartilhado da API por 60 segundos;
- limitação básica de consultas por endereço IP;
- cabeçalhos de segurança no deploy;
- aviso de dados desatualizados e indisponibilidade da fonte;
- visualização do JSON bruto;
- experiência otimizada para celular e computador.

## Fonte de dados

`https://apim-proximotrem-prd-brazilsouth-001.azure-api.net/api/v1/lines`

O painel mostra somente as linhas devolvidas pela fonte consultada. Informações importantes devem ser confirmadas nos canais oficiais das operadoras.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Publicação no Vercel

O projeto inclui `vercel.json` e um comando de build específico para Vercel.

1. Importe o repositório no Vercel.
2. Mantenha o framework como Next.js.
3. Publique sem variáveis de ambiente adicionais.

## Tecnologias

- Next.js
- React
- TypeScript
- CSS responsivo
- armazenamento local do navegador

## Licença

Copyright (c) 2026 lucasthiagosousa. Todos os direitos reservados.

O código pode ser consultado para fins educacionais e de referência. Cópia, modificação, distribuição ou uso comercial exigem autorização prévia do autor. Consulte o arquivo `LICENSE`.
