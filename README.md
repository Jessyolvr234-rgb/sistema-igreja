# Gestão Igreja

Sistema de gestão de membros, redes, células, frequência e requisitos com Next.js e Supabase.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Configure `.env.local` com as credenciais do projeto Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` é um segredo de servidor. Não use prefixo `NEXT_PUBLIC_` nem publique esse valor no GitHub ou no navegador.

## Verificação

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Deploy

Conecte este repositório à Vercel e configure nela as mesmas variáveis de ambiente do Supabase. Faça o deploy de produção a partir da branch `main`.
