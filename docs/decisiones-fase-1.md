# Escuela de Tenis V1 — Decisiones de la fase 1 (requerimientos)

Complementa el documento "Escuela de Tenis — Alcance y criterios de aceptación V1" (26 sep 2026). Donde este documento precisa o amplía un criterio, manda lo que está aquí. Acordado con Sebastián Parra el 27 sep 2026.

## A. Usuarios y acceso

| # | Decisión |
| --- | --- |
| D-01 | Un usuario puede tener **varios roles** con el mismo correo (ej. Administrador + Profesor, Profesor + Cliente). Ve el menú combinado de sus roles. Precisa CA-02. |
| D-02 | El administrador asigna una contraseña temporal al crear o restablecer un usuario. El sistema **obliga a cambiarla en el primer ingreso**. Cada usuario puede cambiar su contraseña cuando quiera. |
| D-03 | Datos del usuario: nombre completo, correo, teléfono, documento (opcional), foto de perfil (opcional). Datos del niño: nombre completo, fecha de nacimiento (opcional), contacto de emergencia (nombre y teléfono), notas (opcional), foto (opcional). |
| D-04 | Al desactivar un usuario o niño con reservas futuras, el sistema las muestra y exige cancelarlas (con motivo) antes de desactivar. Un niño desactivado sale de sus grupos. |

## B. Franjas, agenda y reservas

| # | Decisión |
| --- | --- |
| D-05 | Una franja solo se guarda si su duración es múltiplo exacto de la duración del turno. El sistema muestra cuántos turnos genera. |
| D-06 | Puede haber horas sin franja (sin turnos). Las franjas de un mismo calendario no se solapan. |
| D-07 | Festivos de Colombia calculados automáticamente (Ley Emiliani, Semana Santa). El administrador puede agregar o quitar días. Usan el calendario de fin de semana. |
| D-08 | Anticipación máxima configurable por el administrador. Valores por defecto: clientes 14 días; profesores y administradores 90 días. |
| D-09 | Un cliente puede reservar como máximo N turnos seguidos por reserva (configurable, por defecto 3). Sin límite de reservas activas. |
| D-10 | Se permiten turnos seguidos que crucen de franja; cada turno se cobra según su franja. |
| D-11 | Visibilidad de la agenda: el cliente ve libre/ocupado; el profesor ve tipo de reserva y profesor, pero no el nombre del cliente de un alquiler; el administrador ve todo. |
| D-12 | Una clase individual es exactamente 1 turno y 1 alumno. |
| D-13 | No hay agendamiento recurrente de clases individuales: cada clase se agenda una por una. |
| D-14 | El administrador puede agendar clases a nombre de un profesor y crear alquileres a nombre de un cliente. |
| D-15 | Se pueden registrar clases con fecha pasada: el administrador (cualquier clase) y el profesor (solo las suyas), **sin límite de días atrás**. Aplican las mismas validaciones de cruce. Quedan pendientes de cierre y en la auditoría. |
| D-16 | Cancelación de **clases** (individuales y de grupo): siempre exige motivo de la lista, libera el turno y cuenta en "canceladas por motivo". Pueden cancelar el profesor de la clase y el administrador. Cancelación de **alquileres** por el cliente: hasta la hora de inicio, sin motivo ni cobro; queda como "cancelado por el cliente", categoría distinta de "no usado". |

## C. Grupos

| # | Decisión |
| --- | --- |
| D-17 | Cada grupo tiene fecha de inicio obligatoria y fecha de fin opcional (sin fin = indefinido). El administrador puede **editar el horario de un grupo desde una fecha**: las clases anteriores no cambian y las siguientes se mueven, validando cruces. Si un cambio de franja (CA-12) choca con clases de grupo, el sistema lo rechaza y lista los grupos y reservas que lo impiden. |
| D-18 | Cada día del grupo tiene su propia hora y cancha. |
| D-19 | Cupo máximo por grupo: campo opcional. |
| D-20 | En festivos no se generan las clases de grupo. El administrador puede crearlas manualmente. |
| D-21 | El profesor puede agregar a una clase de grupo puntual un niño no inscrito (reposición o clase de prueba); si asiste, descuenta de su bolsa grupal. |
| D-22 | El administrador puede cambiar el profesor de una clase de grupo puntual (suplente); la sesión suma al suplente. |

## D. Cierre de clases

| # | Decisión |
| --- | --- |
| D-23 | Cierre como *Dictada*: solo desde la hora de inicio del turno. Cierre como *Cancelada*: en cualquier momento. |
| D-24 | Sin plazo de cierre. Las clases abiertas aparecen como "pendientes por cerrar" para el profesor y el administrador; el administrador puede cerrar clases de cualquier profesor. Una clase pendiente se puede cerrar como *Cancelada* días después. Pasar una clase de *Dictada* a *Cancelada* es corrección CA-37 (solo administrador, con motivo). |
| D-25 | El caddie se puede asignar desde que la clase está agendada, validando cruces. Después del cierre como *Dictada*: el profesor puede **agregar** caddie a sus clases hasta **15 días** después, sin motivo (queda en auditoría); el administrador puede agregarlo en clases y alquileres cerrados. **Cambiar o quitar** un caddie registrado es corrección CA-37 (solo administrador, con motivo). |
| D-26 | Una liquidación pagada no se modifica. Las correcciones o agregados posteriores sobre un período ya liquidado aparecen en la siguiente liquidación como "ajuste de período anterior". |

## E. Pagos y tarifas

| # | Decisión |
| --- | --- |
| D-27 | El valor del pago de clases (paquete o sueltas) lo sugiere el sistema (precio del paquete o tarifa × cantidad) y el administrador **puede editarlo** (descuentos). Las clases que entran a la bolsa no cambian; los ingresos reflejan el valor registrado. |
| D-28 | Pagos de alquiler: **sin abonos parciales**; se puede pagar antes de cerrar el alquiler; **un pago puede cubrir varios alquileres** del mismo cliente. El valor del alquiler no es editable (siempre el calculado por CA-27). Si se pagó antes y al cerrar hubo caddie, el recargo queda como un cobro nuevo aparte. Si se pagó y luego se canceló o no se usó, el administrador anula el pago con motivo (la devolución ocurre fuera del sistema). |
| D-29 | Se aplica la tarifa vigente en la fecha del turno. |
| D-30 | Saldos por cobrar: bolsas negativas en número de clases (por alumno y bolsa); deudas de alquiler en pesos. |

## F. Liquidación y resumen

| # | Decisión |
| --- | --- |
| D-31 | Períodos: semanal = lunes a domingo; quincenal = 1–15 y 16–fin de mes; mensual = mes calendario. Una sesión cuenta en el período de la fecha de la clase o alquiler. |
| D-32 | Ocupación = turnos ocupados (clases agendadas/dictadas y alquileres activos/usados) ÷ turnos disponibles de canchas activas. Canceladas y no usados no cuentan como ocupación; se muestran aparte. |

## B-bis. Configuración de franjas (ampliación de D-05 y D-06)

| # | Decisión |
| --- | --- |
| D-38 | Las franjas las define libremente el administrador al configurar el sistema. El horario del escenario E-04 es solo un ejemplo; la validación usa franjas con turnos exactos. |
| D-39 | Duración del turno: **solo 45 o 60 minutos**. |
| D-40 | Los turnos van **pegados**, sin minutos entre uno y otro. |
| D-41 | Ninguna franja cruza la medianoche (fin máximo 23:59). |
| D-42 | Formulario de franja: inicio, duración (45/60), diurna/nocturna y fin, con vista previa de los turnos. Si el fin no da turnos exactos, el sistema ofrece las dos horas de fin exactas más cercanas. Cada franja nueva arranca por defecto donde terminó la anterior. Sin franjas configuradas no se puede reservar. |

## G. Entrega y operación

| # | Decisión |
| --- | --- |
| D-33 | Nombre y logo genéricos, editables por el administrador desde una pantalla de "Configuración de la escuela". |
| D-34 | Despliegue en un subdominio de Infinipus. Objetivo: planes gratuitos. |
| D-35 | Volumen: ~100 clientes, 5 profesores, 7 caddies, 3 grupos de 10 niños. |
| D-36 | Un único ambiente (producción) con datos y usuarios de prueba **marcados como tales**, que se eliminan con un proceso técnico único antes de la operación real (no hay botón en la app, para respetar RN-14). |
| D-37 | Prioridad: calidad y cumplimiento de todos los criterios, sin apuro. |

## H. Profesor y caddie a la vez (cambio del 27 sep 2026)

| # | Decisión |
| --- | --- |
| D-43 | Cada persona tiene dos valores por sesión: como profesor y como caddie. Quien tiene un solo rol usa solo el suyo. No hay valores distintos por tipo de clase (CA-50). |
| D-44 | Una persona no puede estar como profesor en una reserva y como caddie en otra a la misma hora, ni ser caddie de su propia clase (RN-08). Lo garantiza la base de datos. |
| D-45 | La liquidación muestra una tarjeta por persona con un subtotal por rol, el total y un solo botón de "Marcar como pagada". Sin el valor de alguno de sus roles no se puede liquidar. |
| D-46 | Se aplica el valor por sesión vigente al marcar la liquidación como pagada. |
| D-47 | En "Mis sesiones", quien tiene ambos roles ve el total separado por rol. No ve valores en dinero. |
