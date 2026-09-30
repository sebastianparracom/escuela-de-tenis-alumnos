# Escuela de Tenis V1 — Guía de validación

Cómo recorrer los 20 escenarios del anexo del documento de alcance en la aplicación.

## Antes de empezar

1. Un administrador entra y va a **Más → Configuración → Cargar datos de prueba**. Se crean:
   - Franjas, tarifas y paquetes de ejemplo, solo si la escuela aún no tiene los suyos.
   - Usuarios de prueba: `admin`, `juan` y `laura` (profesores), `andres` y `camilo` (caddies), `carolina`, `miguel` y `paula` (clientes), todos con el formato `<nombre>.prueba@example.com`. Infinipus entrega la contraseña por aparte.
   - 10 niños: Sofía y Tomás están a cargo de Carolina, y los demás de Miguel.
   - El grupo **Sub-10**: martes y jueves a las 4:30 p. m., cancha 2, con Juan.
   - Algunos pagos, clases y un alquiler en el siguiente día hábil.
2. Todo lo de prueba queda marcado y se borra con el proceso de purga antes de operar (ver el README).

Las franjas de ejemplo tienen turnos de 45 minutos de 6:00 a 13:30 y de 60 minutos de 13:30 a 21:30 entre semana (nocturnos desde las 18:30). El fin de semana tienen turnos de 60 minutos de 7:00 a 18:00.

## Escenarios

| Escenario | Quién entra | Dónde y qué hacer | Qué se debe ver |
| --- | --- | --- | --- |
| E-01 · Cruce de cancha | juan, luego laura | Juan agenda en **Agenda** una clase en la cancha 3 un martes a las 16:30. Laura intenta agendar la cancha 3 en ese mismo turno. | La celda ya aparece ocupada. Si se intenta por el enlace, sale "La Cancha 3 está ocupada…". |
| E-02 · Cruce de caddie | juan y laura | Juan asigna a Andrés en una clase de las 9:00. Laura asigna a Andrés en otra clase de las 9:00. | "El caddie Andrés Pérez está ocupado…". |
| E-03 · Profesor sin datos de contacto | juan | Agenda una clase y busca al alumno. | Solo nombres de clientes y niños, sin teléfono ni correo. |
| E-04 · Franjas | admin | Abre el **Tablero** de un miércoles. | Turnos de 45 y de 60 minutos en las 7 canchas. |
| E-05 · Cambio de franja con reservas | admin | Con una reserva un sábado a las 8:00, va a **Configuración → Franjas**, cambia el fin de semana y pone ese sábado como fecha. | No se acepta, y el mensaje lista las reservas afectadas. |
| E-06 · Paquete individual | admin | **Pagos → Pago de clases** para Paula: paquete de 8 individuales. | La bolsa individual de Paula queda en 8 y el pago aparece en su historial. |
| E-07 · Paquete grupal para un hijo | admin | Pago de Carolina para Sofía: paquete grupal de 4. | La bolsa grupal de Sofía sube en 4 y la de Carolina no cambia. |
| E-08 · Grupal para adulto | admin | Pago de Paula para ella misma. | Las opciones grupales no aparecen, y el sistema tampoco lo acepta si se fuerza. |
| E-09 · Paquete mínimo | admin | **Configuración → Paquetes**: crea uno de 3 clases. | "El mínimo es de 4 clases por paquete". |
| E-10 · Clase con caddie | juan | Abre una clase ya iniciada, escoge caddie y la cierra como **Dictada**. | La bolsa baja 1; Juan y el caddie suman 1 sesión (en **Sesiones**). |
| E-11 · Clase sin caddie | juan | Cierra una clase como dictada sin caddie. | La bolsa baja 1 y solo Juan suma. |
| E-12 · Cancelada por lluvia | juan | Cierra una clase como **Cancelada** con motivo *Lluvia*. | La bolsa no cambia y nadie suma sesiones. |
| E-13 · Agendar no descuenta | juan | Agenda 3 clases a un alumno. | La bolsa sigue igual hasta cerrarlas. |
| E-14 · Asistencia grupal | juan | Abre una clase del grupo Sub-10 ya iniciada, marca 8 presentes, escoge caddie y cierra. | Los 8 presentes bajan 1 en su bolsa grupal, los 2 ausentes no; Juan y el caddie suman 1. |
| E-15 · Alquiler de varios turnos | paula o carolina | **Reservar** → turno libre de las 18:30 → 2 turnos → Confirmar. | Queda confirmada sin pago, aparece en el tablero y muestra su valor. |
| E-16 · Alquiler con caddie | admin | En **Cierres**, abre el alquiler de 2 turnos nocturnos ya iniciado → Usado → caddie. | Valor = 2 × nocturno + 2 recargos; el caddie suma 2 sesiones. |
| E-17 · Alquiler no usado | admin | Cierra un alquiler como **No usado** con motivo. | Valor $0 y nadie suma sesiones. |
| E-18 · Liquidación por sesión | admin | **Liquidación** del período: revisa a un caddie con sesiones de 45 y de 60 minutos. | Número de sesiones, detalle de cada una y valor = sesiones × valor por sesión. Se marca como pagada. |
| E-19 · Cliente con dos hijos | carolina | **Inicio** e **Historial**. | Sus bolsas, pagos e historial y los de Sofía y Tomás, por separado. |
| E-20 · Tablero en celular | admin | Abre el **Tablero** en un celular. | Las 7 canchas por turno, con colores, sin hacer zoom. |

> Para cerrar una clase como dictada tiene que haber empezado (D-23). Con los datos de prueba, puedes agendar una clase en una fecha pasada (D-15) o esperar a la hora de una clase del día.

## Qué más verificar (decisiones de la entrevista)

- **D-01 · Varios roles:** crea un usuario con los roles Profesor y Cliente. Las pestañas son las del profesor y lo de cliente aparece en **Más**.
- **D-02 · Primer ingreso:** un usuario nuevo debe cambiar su contraseña al entrar por primera vez.
- **D-25 · Caddie olvidado:** en una clase dictada sin caddie, el profesor puede agregarlo hasta 15 días después.
- **D-26 · Liquidación ya pagada:** después de marcarla pagada, agrega un caddie a una clase de ese período. Aparece como ajuste en la siguiente.
- **D-28 · Pago de alquiler:** se paga completo; un pago puede cubrir varios alquileres; si se pagó y luego hubo caddie, el recargo queda aparte.
- **CA-26 · Anular pago:** al anularlo con motivo, las clases salen de la bolsa.
- **CA-37 · Corrección:** el administrador corrige un cierre (**Corregir cierre**, en el detalle de la reserva) con motivo, y el sistema ajusta bolsas y sesiones.
