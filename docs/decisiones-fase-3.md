# Escuela de Tenis V1 — Decisiones de la fase 3 (diseño)

Acordado con Sebastián Parra el 27 sep 2026. Lienzo de referencia: https://claude.ai/artifact/HsdqRjbaNHniRzhuvK66bg

## Dirección visual: C · Cancha (claro y utilitario)

- Fondo `#F4F5F2`, superficies `#FFFFFF`, bordes `#E3E6E1`, texto `#121412`, texto secundario `#5E645E`.
- Acento verde césped `#1F7A4D` (hover `#165C39`); alerta/por pagar `#B42318` sobre `#FDE8E5`.
- Tipografía: Geist (interfaz) + Geist Mono (horas, fechas, cifras y dinero).
- Listas agrupadas en tarjetas blancas con radio 14 px; encabezados de sección en versalitas grises.
- Barra de pestañas inferior por rol; acción principal como botón verde en la esquina superior.
- Botones y filas de al menos 44 px.

## Colores del tablero (CA-52)

| Estado | Fondo | Texto | Etiqueta en la celda |
| --- | --- | --- | --- |
| Libre | `#FFFFFF` borde `#E3E6E1` | — | vacía |
| Clase individual | `#1F7A4D` | `#FFFFFF` | iniciales del profesor |
| Clase grupal | `#CFE0FF` borde `#9DBBF0` | `#0F2A5C` | código del grupo |
| Alquiler | `#F0A928` | `#2E2000` | "Alq" |

## Ajuste sobre C

- Tablero: el selector de fecha es el de la propuesta B (flechas de día anterior/siguiente a los lados y la fecha al centro, que abre un calendario), con los colores de C.
