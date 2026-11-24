# Proposal

## Why

El valor central del producto es que **nunca haya dos turnos solapados por profesional ni por sillón** (RN-AG-01, RN-AG-02). Antes de tocar la base (C-05, C-09) hace falta un núcleo de agenda en TypeScript puro, sin I/O, que codifique las reglas de intervalos, ocupación, disponibilidad, estados del turno y zona horaria, y que se pueda probar exhaustivamente (casos borde y propiedades) sin PostgreSQL. Ese núcleo fija además los **puertos de dominio** que consumen C-05, C-09, C-12, C-13 y siguientes, por lo que debe estar en FASE 1 (GATE 1), en paralelo con C-03 y C-04.

## What Changes

- **Intervalo semiabierto** `[inicio, fin)` como objeto de valor inmutable con `seSolapa`, `contiene` y `esAdyacente`; `fin = inicio` de otro no solapa (RN-AG-03).
- **Ocupación de un turno**: rango del profesional `[inicio, fin)` y rango del sillón `[inicio, fin + buffer)`; el buffer bloquea solo al sillón y se copia al turno (RN-AG-02, RN-AG-04, RN-AG-05). Detección de solapes contra turnos activos (RN-AG-09) con errores tipados `TURNO_SOLAPADO_PROFESIONAL` / `TURNO_SOLAPADO_SILLON`.
- **Entidad `Turno`** con sus seis estados, la tabla de transiciones de RN-TU-01, la noción de turno activo (RN-AG-09) y la regla de no marcar `atendido`/`ausente` antes del inicio (RN-TU-04). El reloj entra como parámetro (`ahora`), nunca se lee dentro del dominio.
- **Utilidades de zona horaria IANA**: convertir fecha + hora local de la clínica a instante UTC y un instante a fecha/día de semana local, sin desplazamientos fijos, resolviendo los cambios de horario (RN-DA-03, DD-07).
- **Validaciones previas a persistir** como funciones puras con errores tipados: dentro de horario de atención (RN-AG-06), no feriado ni bloqueo (RN-AG-07), inicio no pasado (RN-AG-10), alineación a la granularidad (RN-AG-11).
- **Cálculo de disponibilidad**: a partir de horarios de atención, feriados, bloqueos, turnos activos, sillones con buffer y la duración de la prestación, devuelve los huecos libres alineados a la granularidad, cada uno con al menos un sillón asignable (RN-AG-06, RN-AG-07, RN-AG-11, SU-05).
- **Puertos (solo interfaces)**: `TurnoRepository`, `AgendaReader`, `RecursosReader`. Quedan **congelados** al fusionarse (regla dura 14): son contrato de C-05, C-09, C-12, C-13 y siguientes.
- **Pruebas** unitarias de casos borde (fin = inicio, buffer 0 y > 0, cambio de día, cambio de horario, feriado) y basadas en propiedades con fast-check ("ningún conjunto de turnos aceptados se solapa"; "todo hueco ofrecido es aceptado por las validaciones").

Sin cambios incompatibles: no existe código de agenda previo.

## Capabilities

### New Capabilities
- `agenda-ocupacion`: intervalos semiabiertos, ocupación de profesional y sillón con buffer, y detección de solapes entre turnos activos.
- `turno-ciclo-de-vida`: estados del turno, transiciones permitidas, turno activo y restricciones temporales de las transiciones.
- `zona-horaria-clinica`: conversión entre hora local de la clínica (zona IANA) e instantes UTC.
- `agenda-disponibilidad`: validaciones previas a crear un turno y cálculo de huecos libres con sillón asignable.
- `agenda-puertos`: contratos de los puertos de dominio `TurnoRepository`, `AgendaReader` y `RecursosReader`.

### Modified Capabilities
- (ninguna)

## Impact

- **Código**: nuevo bajo `src/domain/agenda/**`, `src/domain/turno/**` y `src/domain/shared/**` (reutiliza `ErrorDeDominio` existente en `src/domain/shared/errores.ts`, sin modificar su contrato). Pruebas en `test/unit/domain/**`.
- **Dependencias**: ninguna nueva. Se usan `vitest` y `fast-check` (ya en `devDependencies`) y la API estándar `Intl` para zonas horarias. Las dependencias de npm solo las toca el Líder (regla 14).
- **Contratos**: los puertos y los tipos que exponen (`Turno`, `EstadoTurno`, `Intervalo`, errores de dominio de agenda) pasan a ser contrato congelado para C-05, C-09, C-12, C-13 y C-15.
- **Base de datos, HTTP, cola**: sin cambios. La garantía final contra solapes sigue siendo el constraint de exclusión (C-09, DD-02); el dominio es la validación previa.
- **Governance**: MEDIO. Zona permitida: `src/domain/**`, `test/unit/domain/**`.
