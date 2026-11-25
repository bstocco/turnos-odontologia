# Tasks

> Entrega en dos fases sobre la misma rama (decisión del Líder). **El change no se archiva hasta completar la Fase 2.**
> Strict TDD: cada prueba se escribe primero y se ve fallar (RED) antes del soporte que la hace pasar.
>
> Mapa de los 10 flujos de `07_flujos_principales.md` (detalle en design D8):
>
> | Flujo | Fase |
> |---|---|
> | 1. Autenticación del personal | Fase 1 (completo; paso 5 "auditar login" reportado como defecto F3) |
> | 2. Agendar desde recepción | Fase 2 (C-12) |
> | 3. Reserva pública | **Parcial**: consulta en Fase 1; código, reserva y enlaces en Fase 2 (C-15) |
> | 4. Confirmación/cancelación por token | Fase 2 (C-15) |
> | 5. Reprogramación | Fase 2 (C-12) |
> | 6. Bloqueo de franja | Fase 2 (C-12) |
> | 7. Recordatorio por email | Fase 2 (C-14) |
> | 8. WhatsApp manual | Fase 2 (C-12 + C-04) |
> | 9. Ausentismo | Fase 2 (C-12/C-16) |
> | 10. Exportación | Fase 2 (C-16) |
> | Complementario: puesta en marcha (C-17 + C-08 + C-10) | Fase 1 |
> | Concurrencia personal vs. público | Fase 2 (C-12 + C-15) |

# Fase 1 (endpoints en main)

## 1. Decisiones y cambios fuera de zona

- [x] 1.1 Confirmar con el Líder Q1 (swagger en `buildApp` o costura de prueba) y Q2 (quién aplica `vitest.config.ts`, `package.json` y `ci.yml`); registrar la respuesta en `design.md` (Open Questions). Verificación: respuesta escrita en el diseño antes de empezar el grupo 4.
- [x] 1.2 Reportar al Líder los defectos F1 a F4 de design D10 (usuarios sin autenticación, contraseña temporal descartada, login sin auditar, respuestas sin esquema) con archivo y change responsable. Verificación: reporte enviado y referenciado en `design.md`.
- [x] 1.3 Agregar el proyecto `e2e` a `vitest.config.ts` (include `test/e2e/**/*.test.ts`, `globalSetup`, `fileParallelism: false`, tiempos, `sequence.groupOrder: 1`) sin tocar los demás proyectos, y el script `test:e2e` en `package.json` (sin dependencias), según lo decidido en 1.1. Verificación: `npm run test:e2e` encuentra la carpeta (cero pruebas, sin error) y `npm test` lista los cuatro proyectos.

## 2. Base del entorno e2e

- [x] 2.1 RED→GREEN: `test/e2e/entorno.test.ts` que afirma que, tras el `globalSetup`, existen las tablas de las migraciones reales y que el rol `app` no es propietario ni tiene `BYPASSRLS`; implementar `test/e2e/soporte/global-setup.ts` reutilizando `configDeBaseDePrueba`, `asegurarBaseDePrueba`, `reiniciarEsquema` y `aplicarMigraciones`. Verificación: `npm run test:e2e` pasa con la base levantada.
- [x] 2.2 RED→GREEN: prueba de que el `globalSetup` se niega a correr con una URL de host no permitido o base sin `_test` (triangular con ambos casos); reutilizar la guarda existente. Verificación: dos casos en verde.
- [x] 2.3 Implementar `test/e2e/soporte/entorno.ts` (app real con `appDePrueba`, logs capturados, secretos descartables aleatorios por ejecución en `process.env`, cierre del pool) con una prueba de humo `GET /salud` y `GET /api/v1/clinica` sin token → `401`. Verificación: prueba en verde.
- [x] 2.4 RED→GREEN: `datos-sinteticos.ts` (emails `@ejemplo.invalid`, DNI y teléfonos ficticios, semilla fija) con pruebas de dominio reservado y determinismo (dos semillas distintas dan datos distintos). Verificación: pruebas en verde.
- [x] 2.5 RED→GREEN: `clinica.ts` (`crearClinicaSintetica` vía `POST /api/v1/interno/clinicas` con la clave descartable; `crearUsuarioSintetico` por fixture con `hashContrasena`) y `sesion.ts` (`iniciarSesion` con `remoteAddress` distinto por login). Prueba: dos clínicas creadas en la misma ejecución con slugs únicos y una sesión por rol obtenida por login real. Verificación: pruebas en verde.
- [x] 2.6 RED→GREEN: `privacidad.ts` (`afirmarSinDatosPersonales`) con un caso que detecta un DNI sintético inyectado en un log y otro que pasa con logs limpios. Verificación: pruebas en verde.

## 3. Flujos de extremo a extremo (Fase 1)

- [x] 3.1 Flujo 1 — `test/e2e/flujos/01-autenticacion.test.ts`: sesión completa (login → `GET /clinica` de su clínica → refresh → reuso del refresh rechazado → logout), `401` genérico idéntico para contraseña errónea y email inexistente, usuario desactivado `401`, `429` por exceso con IP y email propios. Verificación: todos los escenarios del requisito "Flujo de autenticación del personal" en verde; F3 anotado en el archivo si aplica.
- [x] 3.2 Puesta en marcha — `test/e2e/flujos/00-puesta-en-marcha.test.ts`: alta interna → `PATCH /clinica` → profesional → `PUT /profesionales/:id/horarios` → sillón → prestación → feriado y plantilla nacional → paciente (alta, búsqueda, `PATCH`) → la clínica queda lista; `404` al pedir por id recursos de otra clínica. Verificación: escenarios "Clínica lista para agendar" y "Recursos de otra clínica" en verde, y `afirmarSinDatosPersonales` sobre los logs del flujo.
- [x] 3.3 Flujo 3 (consulta) — `test/e2e/flujos/03-reserva-publica.test.ts`: sobre la clínica configurada por la API, `GET /publico/{slug}/prestaciones`, `/profesionales` y `/disponibilidad` ofrecen huecos dentro del horario y ninguno en el feriado; `404` de slug inexistente; misma respuesta con y sin token. Verificación: escenarios del requisito "Flujo de reserva pública — consulta" en verde.

## 4. Contrato OpenAPI (Fase 1)

- [x] 4.1 Registrar `@fastify/swagger` según lo decidido en 1.1 (sin UI ni ruta expuesta) con una prueba RED→GREEN en `test/e2e/contrato/generacion.test.ts` que afirma que `app.swagger()` contiene `GET /salud` y `POST /api/v1/auth/login` y que no hay rutas HEAD. Verificación: prueba en verde; `GET /documentation` (o similar) responde `404`.
- [x] 4.2 RED→GREEN: `generar.ts` (orden de claves, sin campos variables, `info.version` tomada de la última versión de `docs/api/CHANGELOG.md`) con prueba de determinismo (dos generaciones idénticas). Verificación: prueba en verde.
- [x] 4.3 RED→GREEN: comparador puro `comparar.ts` con casos unitarios por cada clase de D5 (operación quitada, código quitado, propiedad de respuesta quitada, campo de entrada nuevo obligatorio, tipo cambiado, enumerado achicado → rompiente; operación nueva, propiedad opcional nueva → no rompiente). Verificación: al menos dos casos por clase en verde.
- [x] 4.4 Crear `docs/api/CHANGELOG.md` con la entrada `## [1.0.0]` (o la versión decidida en Q5) y generar `docs/api/openapi.json` con `ACTUALIZAR_CONTRATO=1`; prueba "contrato al día" que falla nombrando operaciones si el generado difiere. Verificación: la prueba falla al alterar a mano una propiedad del snapshot y pasa con el snapshot generado.
- [x] 4.5 Prueba de rompientes contra `${CONTRATO_BASE_REF:-origin/main}` con `git show` vía `execFile`: pasa si `main` no tiene contrato; con rompientes exige subida de mayor y `**Rompiente**` en el registro; con `CI=true` y base ilegible falla; en local se omite con aviso. Verificación: casos cubiertos con una base simulada por archivo temporal (inyectando el lector de la base).
- [x] 4.6 Prueba de respuestas declaradas con `docs/api/excepciones-de-respuesta.json` (lista inicial: `auth/*`, `usuarios/*`, `POST /interno/clinicas`, cada una con motivo y change responsable); falla con una operación nueva sin esquema y con una excepción sobrante. Verificación: ambos casos en verde.

## 5. Matriz de permisos (Fase 1)

- [x] 5.1 RED→GREEN: prueba de completitud: el conjunto de operaciones de `app.swagger().paths` (sin HEAD/OPTIONS) es igual a las claves de `test/e2e/permisos/matriz.ts`; empezar con la matriz vacía para verla fallar nombrando todas las operaciones. Verificación: falla con matriz incompleta y con una fila inventada.
- [x] 5.2 Completar las filas de `auth`, `clinica`, `profesionales` (incluidos horarios), `sillones`, `prestaciones`, `feriados` (incluida plantilla), `pacientes`, `usuarios`, `interno`, `publico-disponibilidad` y `GET /salud` con valores de `03 §RBAC` y un `pedido` válido mínimo por fila. Verificación: completitud en verde; revisión de cada celda contra `03 §RBAC` en el PR.
- [x] 5.3 Ejecutar la matriz por fila y actor (anónimo `401`; `prohibido` `403` + `ACCESO_PROHIBIDO`; `permitido` ni `401` ni `403`; públicas igual con y sin token; interna `401` sin clave o con clave errónea), con recursos nuevos por caso en las operaciones de escritura. Verificación: matriz en verde salvo celdas marcadas como defecto.
- [x] 5.4 Verificación de otra clínica (`conId`): administrador de B sobre recursos de A → `404`, nunca `403`. Verificación: un caso por operación con id, en verde.
- [x] 5.5 Celdas `permitido_con_alcance` del odontólogo (pacientes de sus turnos; horarios y demás "propios" según lo implementado) con la afirmación de alcance de cada fila; las que difieran de `03 §RBAC` se marcan `defecto` con `it.fails` y motivo (incluye F1 en `usuarios`). Verificación: el resumen de la prueba lista las celdas marcadas.

## 6. Ejemplos de uso (Fase 1)

- [x] 6.1 Crear `docs/api/README.md` (cómo regenerar el contrato, cómo declarar un rompiente, cómo correr e2e, cómo usar los ejemplos) y `docs/api/ejemplos/*.http` para cada operación de Fase 1 con variables `{{baseUrl}}`, `{{token}}`, `{{slug}}`, `{{claveInterna}}` y datos sintéticos; equivalentes `curl` de login, alta de paciente y disponibilidad en el README. Verificación: revisión en el PR.
- [x] 6.2 RED→GREEN: `test/e2e/contrato/ejemplos.test.ts` que verifica que cada pedido de los `.http` exista en el contrato y que no haya JWT, `Bearer` literal ni contraseñas o claves literales; triangular con un ejemplo de ruta inexistente y uno con token literal (en un directorio de fixtures de la prueba). Verificación: pruebas en verde.

## 7. CI y cierre de Fase 1

- [x] 7.1 Aplicar en `.github/workflows/ci.yml` (según 1.1) `git fetch --depth=1 origin main` y `- run: npm run test:e2e` después de `test:api` en el job `pruebas`. Verificación: el run de CI de la rama muestra el paso e2e en verde.
- [x] 7.2 Ejecutar `npm test` completo en local y confirmar que `integration` termina antes de que empiece `e2e` y que todo pasa; `npm run lint`, `format:check` y `typecheck` en verde. Verificación: salida registrada en el PR.
- [x] 7.3 Registrar en este archivo y en engram el estado de Fase 1 (qué cubre, celdas marcadas como defecto, respuestas del Líder) y abrir el PR de Fase 1 **sin archivar** el change. Verificación: PR abierto con el resumen; el change sigue en `openspec/changes/`.

> **Estado de la Fase 1 (aplicada, sin archivar):** proyecto `e2e` con base PostgreSQL real y secretos descartables; Flujo 1, puesta en marcha y Flujo 3 (consulta); contrato `docs/api/openapi.json` 1.0.0 con comparador de rompientes, respuestas declaradas y ejemplos validados; matriz de 37 operaciones. Celdas marcadas como defecto (`it.fails`): F1 (14 celdas de `usuarios`), F2, F3 y F5. Q1 y Q2 aprobadas por la Líder (PR #18). Fase 2 pendiente de C-12, C-14, C-15 y C-16.

# Fase 2 (pendiente de C-12/C-14/C-15/C-16)

> Arranca cuando estén fusionados en `main` C-12, C-14, C-15 y C-16 (rebase de esta rama). La completitud de la matriz y del contrato fallará sola al llegar sus rutas: es la señal para estos grupos.

## 8. Actualización del contrato y la matriz con los endpoints nuevos

- [ ] 8.1 Rebase sobre `main`, regenerar `docs/api/openapi.json` y declarar en `docs/api/CHANGELOG.md` los cambios (rompientes, si los hubo, con subida de mayor). Verificación: pruebas de contrato en verde.
- [ ] 8.2 Agregar a la matriz las filas de turnos, agenda, bloqueos, enlace de WhatsApp, reserva pública y acción por token, exportación, auditoría y ausentismo según `03 §RBAC`, con alcance propio del odontólogo donde corresponda. Verificación: completitud y ejecución de la matriz en verde.
- [ ] 8.3 Revisar `docs/api/excepciones-de-respuesta.json`: quitar las excepciones resueltas por sus dueños (F4) y agregar solo las justificadas. Verificación: prueba de respuestas declaradas en verde.

## 9. Flujos de Fase 2

- [ ] 9.1 Flujo 2 — agendar desde recepción: `201`, `409` `TURNO_SOLAPADO_PROFESIONAL` y `TURNO_SOLAPADO_SILLON`, `422` fuera de horario, feriado y bloqueo. Verificación: escenario "Agendar desde la recepción con solape" en verde.
- [ ] 9.2 Flujo 3 (resto) — código por email (email simulado), `POST /publico/{slug}/reservas`, sillón automático, estado inicial según configuración, email con enlaces; `409` hueco ocupado o sin sillón, `422` código vencido o incorrecto con límite de intentos, `429`. Verificación: pruebas en verde.
- [ ] 9.3 Flujo 4 — confirmar y cancelar por token; `409` con menos de 24 h; `410`/`404` token usado, vencido o inexistente. Verificación: pruebas en verde.
- [ ] 9.4 Flujo 5 — reprogramación exitosa y reprogramación con solape que revierte todo con el original intacto. Verificación: escenario "Reprogramación fallida" en verde.
- [ ] 9.5 Flujo 6 — bloqueo de franja, `409` con la lista de turnos en conflicto y disponibilidad pública sin la franja bloqueada. Verificación: pruebas en verde.
- [ ] 9.6 Flujo 7 — recordatorio por email con reloj y proveedor simulados: notificación `pendiente` → `enviada`, y `fallida` tras el máximo de reintentos. Verificación: pruebas en verde.
- [ ] 9.7 Flujo 8 — `GET /turnos/{id}/enlace-whatsapp` con teléfono normalizado y error con teléfono ausente o inválido. Verificación: pruebas en verde.
- [ ] 9.8 Flujo 9 — `POST /turnos/{id}/ausente` sobre turno confirmado ya comenzado, con auditoría; `409` en turno futuro u otro estado. Verificación: pruebas en verde.
- [ ] 9.9 Flujo 10 — `POST /exportaciones` y `GET /exportaciones/{id}` con auditoría y solo datos de la clínica; `403` para no administrador. Verificación: escenario "Exportación sin rol de administrador" en verde.
- [ ] 9.10 `afirmarSinDatosPersonales` sobre los logs de cada flujo de Fase 2 (incluidos payloads de la cola y emails simulados). Verificación: pruebas en verde.

## 10. Concurrencia personal vs. público

- [ ] 10.1 Prueba de concurrencia: `Promise.all` de `POST /turnos` (recepción) y `POST /publico/{slug}/reservas` sobre el mismo profesional y horario, repetida N veces; exactamente un éxito y un `409` por intento y un único turno activo en la base (consulta como `migra`). Verificación: escenario "Mismo hueco en simultáneo" en verde en local y en CI.

## 11. Ejemplos y cierre del change

- [ ] 11.1 Agregar `.http` para cada operación nueva y verificar que toda operación del contrato tenga al menos un ejemplo (ampliar `ejemplos.test.ts` con esa regla). Verificación: escenario "Cierre del change" en verde.
- [ ] 11.2 Actualizar `docs/api/README.md` con los flujos de Fase 2; `npm test`, lint, formato y tipos en verde; CI en verde. Verificación: run de CI enlazado en el PR.
- [ ] 11.3 Confirmar que no quedan celdas `defecto` sin reporte vigente y que todas las tareas de ambas fases están `[x]`; recién entonces archivar el change. Verificación: `openspec validate c-18-e2e-flujos-y-contratos-api --strict` en verde y archivo hecho por el Líder.
