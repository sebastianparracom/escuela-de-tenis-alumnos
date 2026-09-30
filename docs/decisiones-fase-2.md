# Escuela de Tenis V1 — Decisiones de la fase 2 (stack)

Acordado con Sebastián Parra el 27 sep 2026.

## Stack

| Capa | Elección |
| --- | --- |
| Aplicación | Next.js (App Router) + TypeScript, desplegada en Vercel (plan Hobby, cuenta de Sebastián) |
| Base de datos | Supabase Postgres (plan gratuito), región us-east-1, junto a las funciones de Vercel (iad1) |
| Acceso a datos | Drizzle ORM desde el servidor, por el pooler de Supabase |
| Autenticación | Supabase Auth (correo + contraseña) |
| Archivos | Supabase Storage (fotos de perfil y logo) |
| Interfaz | Tailwind CSS + shadcn/ui |
| Validación | Zod |
| Fechas | UTC en base de datos, hora de Bogotá en pantalla; festivos colombianos calculados |
| Pruebas | Vitest (reglas de negocio) + Playwright (escenarios E-01 a E-20) |
| Repositorio | GitHub de Sebastián |
| Dominio | `tenis.infinipus.com` (registro DNS a cargo de Sebastián) |

## Cómo se adapta el acceso a Supabase Auth

- Registro público desactivado y confirmación de correo desactivada: Supabase no envía correos (RNF-08).
- El administrador crea usuarios y restablece contraseñas desde la app; el servidor usa la API de administración de Supabase con la llave secreta, que nunca llega al navegador.
- Roles (varios por usuario), activo/inactivo y "debe cambiar contraseña" viven en tablas propias; un usuario desactivado queda además bloqueado en Supabase Auth.

## Seguridad de datos

- RLS activado en todas las tablas sin políticas para el rol anónimo ni el autenticado: la API pública de Supabase no expone datos. Todo acceso a datos pasa por el servidor de Next.js, que aplica los permisos por rol (CA-06, RNF-04).
- Reservas cruzadas bloqueadas en la base de datos con restricciones de exclusión sobre rangos de tiempo (cancha, profesor, caddie).
- Saldos de bolsas y sesiones calculados como libro de movimientos (nada se edita ni se borra; RN-14).

## Riesgos del plan gratuito y mitigación

- **Pausa tras 1 semana sin actividad:** una tarea programada diaria de Vercel (Cron, permitido en Hobby una vez al día) mantiene el proyecto activo.
- **Sin respaldos automáticos en el plan gratuito:** Supabase recomienda que el usuario haga sus propios volcados (`supabase db dump`). Se configura una GitHub Action diaria que genera el volcado y lo guarda como artefacto del repositorio privado. Prioridad baja.
- **Plan Hobby de Vercel:** los términos lo limitan a uso no comercial; Sebastián asume la decisión.
