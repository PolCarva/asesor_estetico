# AGENTS.md

Guía para agentes de código que trabajen en este repositorio.

## Antes de empezar

- Leé `/docs` antes de tomar cualquier decisión arquitectónica. Empezá por `docs/ARCHITECTURE.md` y `docs/EXECUTION_PLAN.md`.
- Hacé solo lo que pide la tarea. No implementes features fuera del scope ni reescribas código no relacionado.

## Reglas

- Respetá el stack existente (ver `docs/ARCHITECTURE.md`). No agregues frameworks, servicios ni dependencias nuevas sin justificarlo. Versiones compartidas: `catalog` en `pnpm-workspace.yaml`.
- TypeScript en modo `strict`. Nada de `any` implícitos ni `@ts-ignore` sin explicación.
- Evitá la sobreingeniería: preferí la solución más simple que funcione. Nada de microservicios: la app web y el worker alcanzan.
- Separá UI, dominio e integraciones:
  - UI: `apps/web/src/app` y `apps/web/src/components`.
  - Dominio: `packages/shared` — lógica pura y schemas, sin red ni SDKs.
  - Integraciones: `packages/db`, `ai`, `shopping`, `payments`, `analytics` — detrás de interfaces.
- Validá con Zod todo dato que cruce un límite externo: requests, respuestas de IA, páginas de tiendas, webhooks, variables de entorno.
- Configuración solo vía `@asesor/config/env/*`; nunca `process.env` suelto (hay una regla de ESLint).
- Nunca expongas secretos: no los commitees, no los loguees, no los mandes al cliente. La service role key solo en servidor (`@asesor/db/service`) o worker.
- Las fotos de usuarios son privadas. Seguí `docs/SECURITY_PRIVACY.md`. Todo acceso a datos de usuario pasa por RLS; cambios de datos → migración nueva + `pnpm db:types` + test de integración.
- Si cambiás la arquitectura, actualizá la documentación en `/docs` en el mismo cambio.

## Antes de dar una tarea por terminada

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Si tocaste algo que afecte el build, corré también `pnpm build` (o directamente `pnpm check`). No termines con errores.

## Entorno

- Node 24 LTS (`nvm use`, ver `.nvmrc`).
- pnpm vía corepack (versión fijada en `packageManager` del `package.json` raíz).
- Supabase local con Docker: `pnpm db:start` y `pnpm db:reset`. Ver `README.md`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
