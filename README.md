# Escuela de Tenis · V1

Aplicación web, pensada primero para celular, para gestionar canchas, clases, bolsas de clases, pagos, sesiones de profesores y caddies, y liquidación. Construida por Infinipus.

- Alcance y decisiones: [docs/decisiones-fase-1.md](docs/decisiones-fase-1.md), [fase 2 (stack)](docs/decisiones-fase-2.md) y [fase 3 (diseño)](docs/decisiones-fase-3.md).
- Validación con el cliente: [docs/guia-validacion.md](docs/guia-validacion.md).

## Stack

Next.js 16 (App Router) · TypeScript · Supabase (Postgres, Auth, Storage) · Drizzle ORM · Tailwind CSS 4 · Vitest + PGlite. Desplegada en Vercel (región `iad1`, junto a Supabase `us-east-1`).

## Reglas que garantiza la base de datos

- **Sin cruces:** restricciones de exclusión sobre rangos de tiempo impiden dos reservas activas en la misma cancha, profesor o caddie ([src/db/migrations/0001_constraints.sql](src/db/migrations/0001_constraints.sql)).
- **Nada se borra:** las bolsas (`bag_movements`) y las sesiones (`session_entries`) son registros de movimientos. Un cierre, una corrección o una anulación agregan movimientos; nunca se editan los anteriores ([src/lib/effects.ts](src/lib/effects.ts)).
- **La API pública no expone datos:** RLS está activo sin políticas en todas las tablas. Todo acceso pasa por el servidor de Next.js, que aplica los permisos por rol.

## Estructura

```
src/
  db/          esquema Drizzle, migraciones, conexión
  lib/         reglas puras: franjas y turnos, festivos, precios, efectos de cierres, períodos
  server/      servicios de negocio (reciben db, actor y reloj; se prueban con PGlite)
  app/         pantallas por rol y acciones del servidor
  components/  interfaz (propuesta C · Cancha)
tests/         escenarios E-01 a E-18 y reglas adicionales
scripts/       migraciones, base local, datos de prueba
```

## Desarrollo local

Sin necesidad de Supabase: una base Postgres en memoria con datos de prueba y un acceso simulado, que solo funciona con `next dev`.

```bash
pnpm install
pnpm dev:db        # terminal 1: base local en 127.0.0.1:5433 con datos de prueba
pnpm dev           # terminal 2: usa .env.development.local (POSTGRES_URL local y DEV_AUTH=1)
```

`.env.development.local`:

```
POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable
DEV_AUTH=1
```

Otros comandos: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm db:generate` (después de cambiar el esquema).

## Despliegue (Vercel + Supabase)

- Cada despliegue corre `pnpm vercel-build`, que aplica las migraciones pendientes y luego compila.
- Variables: las crea la integración de Supabase en Vercel. Además hace falta `CRON_SECRET`. El código ignora las variables vacías.
- Tarea diaria (`vercel.json`): `/api/cron` genera las clases de grupo hasta el horizonte y mantiene activo el proyecto gratuito de Supabase.

### Primera vez

1. Abre `/instalacion` y crea el primer administrador. El código de instalación es el valor de `CRON_SECRET`.
2. Opcional: **Más → Configuración → Cargar datos de prueba**. La contraseña de los usuarios de prueba es `TEST_PASSWORD` en [src/server/seed.ts](src/server/seed.ts).
3. En Supabase, **Authentication → Sign In / Providers**, desactiva "Allow new users to sign up". La app no usa el registro público.

### Borrar los datos de prueba antes de operar (D-36)

Es un proceso técnico, sin botón en la app. Borra usuarios, niños, grupos, reservas, pagos y sesiones de prueba, y conserva la configuración.

```bash
curl -X POST https://tenis.infinipus.com/api/mantenimiento/purgar-pruebas -H "Authorization: Bearer $CRON_SECRET" -H "X-Confirmar: borrar-datos-de-prueba"
```
