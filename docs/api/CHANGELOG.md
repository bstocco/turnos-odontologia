# Registro de cambios del contrato de la API

Cada versión del contrato (`docs/api/openapi.json`) tiene un encabezado `## [X.Y.Z] - AAAA-MM-DD`.
La versión del contrato es independiente de la de `package.json`.

Un cambio **rompiente** (quitar una operación, un código de respuesta o una propiedad de la
respuesta; volver obligatorio o agregar un campo de entrada obligatorio; cambiar un tipo; achicar
un enumerado) exige subir el número **mayor** y marcar la entrada con **Rompiente**, por ejemplo:

```
## [2.0.0] - AAAA-MM-DD

- **Rompiente**: se quita `GET /api/v1/ejemplo`.
```

## [1.1.0] - 2026-11-25

- Operaciones nuevas (no rompiente) incorporadas por C-12, C-14 y C-16 (change C-18, Fase 2a):
  `POST /api/v1/turnos`, `GET /api/v1/turnos/{id}`, `POST /api/v1/turnos/{id}/{accion}`,
  `GET /api/v1/agenda`, `POST /api/v1/bloqueos`, `DELETE /api/v1/bloqueos/{id}`,
  `GET /api/v1/auditoria`, `GET /api/v1/ausentismo`, `POST /api/v1/exportaciones` y
  `GET /api/v1/exportaciones/{id}`. Ninguna operación de 1.0.0 cambió.

## [1.0.0] - 2026-11-24

- Primera versión del contrato, derivada de la aplicación real (change C-18, Fase 1).
- Cubre `GET /salud`, autenticación del personal, alta interna de clínicas, usuarios, clínica,
  profesionales y horarios, sillones, prestaciones, feriados, pacientes y la consulta pública de
  prestaciones, profesionales y disponibilidad.
