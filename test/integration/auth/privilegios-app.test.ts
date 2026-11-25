import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  actualizarUsuarioDePersonal,
  buscarTokenDeRefrescoPorHash,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  crearTokenDeRefrescoEnTabla,
  crearUsuarioDePersonal,
  eliminarUsuarioDePersonal,
  listarUsuariosDeClinica,
  revocarTokenDeRefresco,
} from '../../../src/infrastructure/auth/repositorio-de-usuarios.js';
import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  comoAppSinContexto,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from '../datos-clinica/soporte.js';

// C-06: el rol `app` necesita privilegios explícitos sobre `usuario` y `token_refresco`
// (C06_002). Todo corre como `app` contra la base migrada con las migraciones REALES.
// Datos sintéticos únicamente (regla 2); hashes de mentira, no son contraseñas reales.
const HASH_CONTRASENA = 'hash-sintetico-no-real';
const VENCE_EN = new Date('2030-01-01T00:00:00Z');

let entorno: EntornoDePrueba;

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

/** Captura el código SQLSTATE con que PostgreSQL rechaza la operación. */
async function codigoDeError(operacion: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await operacion();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

/** Captura el mensaje del error de PostgreSQL (para distinguir RLS de falta de privilegio). */
async function mensajeDeError(operacion: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await operacion();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

function crearUsuario(clinicaId: string, email: string, rol: 'administrador' | 'recepcionista') {
  return comoApp(clinicaId, (c) =>
    crearUsuarioDePersonal(c, clinicaId, {
      email,
      hashContrasena: HASH_CONTRASENA,
      rol,
      profesionalId: undefined,
    }),
  );
}

describe('C-06 usuario como rol app: operaciones que el código necesita', () => {
  it('crea un usuario y lo encuentra por email y por id (login, aprovisionamiento)', async () => {
    const id = await crearUsuario(CLINICA_A.id, 'crea-a@sintetico.test', 'recepcionista');

    const porEmail = await comoApp(CLINICA_A.id, (c) =>
      buscarUsuarioPorEmail(c, CLINICA_A.id, 'crea-a@sintetico.test'),
    );
    const porId = await comoApp(CLINICA_A.id, (c) => buscarUsuarioPorId(c, CLINICA_A.id, id));

    expect(porEmail?.id).toBe(id);
    expect(porEmail?.hashContrasena).toBe(HASH_CONTRASENA);
    expect(porEmail?.activo).toBe(true);
    expect(porId?.email).toBe('crea-a@sintetico.test');
  });

  it('inserta el usuario administrador como lo hace el aprovisionamiento de clínicas (C-17)', async () => {
    const { rowCount } = await comoApp(CLINICA_A.id, (c) =>
      c.query(
        'INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
        [CLINICA_A.id, 'admin-prov@sintetico.test', HASH_CONTRASENA, 'administrador'],
      ),
    );
    expect(rowCount).toBe(1);
  });

  it('lista los usuarios de la clínica', async () => {
    await crearUsuario(CLINICA_A.id, 'lista-1@sintetico.test', 'recepcionista');
    await crearUsuario(CLINICA_A.id, 'lista-2@sintetico.test', 'administrador');

    const lista = await comoApp(CLINICA_A.id, (c) => listarUsuariosDeClinica(c, CLINICA_A.id));
    const emails = lista.map((u) => u.email);

    expect(emails).toContain('lista-1@sintetico.test');
    expect(emails).toContain('lista-2@sintetico.test');
  });

  it('actualiza rol, profesional_id y activo', async () => {
    const id = await crearUsuario(CLINICA_A.id, 'actualiza@sintetico.test', 'recepcionista');
    // C08_001 agrega la FK usuario.profesional_id → profesional: el profesional debe existir.
    const profesional = await comoApp(CLINICA_A.id, async (c) => {
      const res = await c.query<{ id: string }>(
        `INSERT INTO profesional (clinica_id, nombre, apellido) VALUES ($1, 'Sintetico', 'Prueba') RETURNING id`,
        [CLINICA_A.id],
      );
      return res.rows[0]?.id ?? '';
    });

    await comoApp(CLINICA_A.id, (c) =>
      actualizarUsuarioDePersonal(c, CLINICA_A.id, id, {
        rol: 'administrador',
        profesionalId: profesional,
        activo: false,
      }),
    );
    const actualizado = await comoApp(CLINICA_A.id, (c) => buscarUsuarioPorId(c, CLINICA_A.id, id));
    expect(actualizado).toMatchObject({ rol: 'administrador', profesionalId: profesional });
    expect(actualizado?.activo).toBe(false);
  });

  it('elimina un usuario sin tokens (ruta DELETE de usuarios)', async () => {
    const id = await crearUsuario(CLINICA_A.id, 'elimina@sintetico.test', 'recepcionista');

    await comoApp(CLINICA_A.id, (c) => eliminarUsuarioDePersonal(c, CLINICA_A.id, id));

    const tras = await comoApp(CLINICA_A.id, (c) => buscarUsuarioPorId(c, CLINICA_A.id, id));
    expect(tras).toBeUndefined();
  });
});

describe('C-06 token_refresco como rol app: operaciones que el código necesita', () => {
  it('crea, busca por hash y revoca un token de refresco (login, refresh, logout)', async () => {
    const usuarioId = await crearUsuario(CLINICA_A.id, 'token-a@sintetico.test', 'recepcionista');
    await comoApp(CLINICA_A.id, (c) =>
      crearTokenDeRefrescoEnTabla(c, {
        clinicaId: CLINICA_A.id,
        usuarioId,
        hash: 'hash-token-a',
        venceEn: VENCE_EN,
      }),
    );

    const creado = await comoApp(CLINICA_A.id, (c) =>
      buscarTokenDeRefrescoPorHash(c, CLINICA_A.id, 'hash-token-a'),
    );
    expect(creado?.usuarioId).toBe(usuarioId);
    expect(creado?.venceEn.toISOString()).toBe(VENCE_EN.toISOString());
    expect(creado?.revocadaEn).toBeUndefined();

    await comoApp(CLINICA_A.id, (c) => revocarTokenDeRefresco(c, CLINICA_A.id, creado?.id ?? ''));
    const revocado = await comoApp(CLINICA_A.id, (c) =>
      buscarTokenDeRefrescoPorHash(c, CLINICA_A.id, 'hash-token-a'),
    );
    expect(revocado?.revocadaEn).toBeInstanceOf(Date);
  });

  it('cada token se revoca de forma independiente', async () => {
    const usuarioId = await crearUsuario(CLINICA_A.id, 'token-b@sintetico.test', 'recepcionista');
    for (const hash of ['hash-token-b1', 'hash-token-b2']) {
      await comoApp(CLINICA_A.id, (c) =>
        crearTokenDeRefrescoEnTabla(c, {
          clinicaId: CLINICA_A.id,
          usuarioId,
          hash,
          venceEn: VENCE_EN,
        }),
      );
    }
    const primero = await comoApp(CLINICA_A.id, (c) =>
      buscarTokenDeRefrescoPorHash(c, CLINICA_A.id, 'hash-token-b1'),
    );
    await comoApp(CLINICA_A.id, (c) => revocarTokenDeRefresco(c, CLINICA_A.id, primero?.id ?? ''));

    const segundo = await comoApp(CLINICA_A.id, (c) =>
      buscarTokenDeRefrescoPorHash(c, CLINICA_A.id, 'hash-token-b2'),
    );
    expect(segundo?.revocadaEn).toBeUndefined();
  });
});

describe('C-06 privilegios denegados al rol app (mínimo privilegio)', () => {
  it('no puede borrar tokens de refresco (se revocan, no se borran)', async () => {
    const codigo = await codigoDeError(() =>
      comoApp(CLINICA_A.id, (c) => c.query('DELETE FROM token_refresco')),
    );
    expect(codigo).toBe('42501');
  });

  it('no puede vaciar ninguna de las dos tablas (TRUNCATE)', async () => {
    for (const tabla of ['usuario', 'token_refresco']) {
      const codigo = await codigoDeError(() =>
        comoApp(CLINICA_A.id, (c) => c.query(`TRUNCATE ${tabla}`)),
      );
      expect(codigo, tabla).toBe('42501');
    }
  });

  it('no puede reasignar usuario a otra clínica ni cambiar email ni hash de contraseña', async () => {
    const intentos: Array<[string, unknown[]]> = [
      ['UPDATE usuario SET clinica_id = $1', [CLINICA_B.id]],
      ["UPDATE usuario SET email = 'otro@sintetico.test'", []],
      ["UPDATE usuario SET hash_contrasena = 'otro-hash'", []],
    ];
    for (const [sql, parametros] of intentos) {
      const codigo = await codigoDeError(() =>
        comoApp(CLINICA_A.id, (c) => c.query(sql, parametros)),
      );
      expect(codigo, sql).toBe('42501');
    }
  });

  it('no puede modificar columnas inmutables de token_refresco (solo revoked_en)', async () => {
    const intentos: Array<[string, unknown[]]> = [
      ["UPDATE token_refresco SET hash_token = 'otro'", []],
      ["UPDATE token_refresco SET vence_en = '2099-01-01T00:00:00Z'", []],
      ['UPDATE token_refresco SET usuario_id = gen_random_uuid()', []],
      ['UPDATE token_refresco SET clinica_id = $1', [CLINICA_B.id]],
    ];
    for (const [sql, parametros] of intentos) {
      const codigo = await codigoDeError(() =>
        comoApp(CLINICA_A.id, (c) => c.query(sql, parametros)),
      );
      expect(codigo, sql).toBe('42501');
    }
  });
});

describe('C-06 aislamiento entre clínicas (regla 3) con los privilegios otorgados', () => {
  it('la clínica A no lee usuarios ni tokens de la B, y viceversa', async () => {
    const usuarioB = await crearUsuario(CLINICA_B.id, 'solo-b@sintetico.test', 'administrador');
    await comoApp(CLINICA_B.id, (c) =>
      crearTokenDeRefrescoEnTabla(c, {
        clinicaId: CLINICA_B.id,
        usuarioId: usuarioB,
        hash: 'hash-token-solo-b',
        venceEn: VENCE_EN,
      }),
    );

    const usuarioDesdeA = await comoApp(CLINICA_A.id, (c) =>
      c.query('SELECT id FROM usuario WHERE email = $1', ['solo-b@sintetico.test']),
    );
    const tokenDesdeA = await comoApp(CLINICA_A.id, (c) =>
      c.query('SELECT id FROM token_refresco WHERE hash_token = $1', ['hash-token-solo-b']),
    );
    const usuarioDesdeB = await comoApp(CLINICA_B.id, (c) =>
      c.query('SELECT id FROM usuario WHERE email = $1', ['crea-a@sintetico.test']),
    );

    expect(usuarioDesdeA.rowCount).toBe(0);
    expect(tokenDesdeA.rowCount).toBe(0);
    expect(usuarioDesdeB.rowCount).toBe(0);
  });

  it('la clínica A no puede insertar filas con el clinica_id de la B (WITH CHECK)', async () => {
    const mensajeUsuario = await mensajeDeError(() =>
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          'INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
          [CLINICA_B.id, 'intruso@sintetico.test', HASH_CONTRASENA, 'administrador'],
        ),
      ),
    );
    const usuarioB = await comoApp(CLINICA_B.id, (c) =>
      buscarUsuarioPorEmail(c, CLINICA_B.id, 'solo-b@sintetico.test'),
    );
    const mensajeToken = await mensajeDeError(() =>
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          'INSERT INTO token_refresco (id, clinica_id, usuario_id, hash_token, vence_en) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
          [CLINICA_B.id, usuarioB?.id, 'hash-intruso', VENCE_EN],
        ),
      ),
    );

    // Debe ser la política RLS (WITH CHECK) la que rechaza, no la falta de privilegio.
    expect(mensajeUsuario).toMatch(/row-level security/);
    expect(mensajeToken).toMatch(/row-level security/);
  });

  it('la clínica A no puede actualizar ni borrar usuarios de la B', async () => {
    const actualizadas = await comoApp(CLINICA_A.id, (c) =>
      c.query("UPDATE usuario SET activo = FALSE WHERE email = 'solo-b@sintetico.test'"),
    );
    const borradas = await comoApp(CLINICA_A.id, (c) =>
      c.query("DELETE FROM usuario WHERE email = 'solo-b@sintetico.test'"),
    );
    const sigue = await comoApp(CLINICA_B.id, (c) =>
      buscarUsuarioPorEmail(c, CLINICA_B.id, 'solo-b@sintetico.test'),
    );

    expect(actualizadas.rowCount).toBe(0);
    expect(borradas.rowCount).toBe(0);
    expect(sigue?.activo).toBe(true);
  });

  it('sin contexto de clínica no se ve ninguna fila de ninguna de las dos tablas', async () => {
    const usuarios = await comoAppSinContexto((c) => c.query('SELECT id FROM usuario'));
    const tokens = await comoAppSinContexto((c) => c.query('SELECT id FROM token_refresco'));

    expect(usuarios.rowCount).toBe(0);
    expect(tokens.rowCount).toBe(0);
  });
});

describe('C-06 conjunto exacto de privilegios del rol app (catálogo)', () => {
  const PRIVILEGIOS_DE_TABLA = [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
  ];

  /** Privilegios de tabla completos que `app` tiene sobre la tabla. */
  async function privilegiosDeTabla(tabla: string): Promise<string[]> {
    const filas = await consultarComoMigra<{ privilegio: string; tiene: boolean }>(
      entorno.urlMigra,
      `SELECT p AS privilegio, has_table_privilege('app', $1, p) AS tiene
         FROM unnest($2::text[]) AS p`,
      [tabla, PRIVILEGIOS_DE_TABLA],
    );
    return filas.filter((f) => f.tiene).map((f) => f.privilegio);
  }

  /** Columnas de la tabla sobre las que `app` tiene el privilegio indicado. */
  async function columnasCon(tabla: string, privilegio: 'INSERT' | 'UPDATE'): Promise<string[]> {
    const filas = await consultarComoMigra<{ columna: string }>(
      entorno.urlMigra,
      `SELECT attname AS columna FROM pg_attribute
        WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped
          AND has_column_privilege('app', attrelid, attnum, $2)
        ORDER BY attname`,
      [tabla, privilegio],
    );
    return filas.map((f) => f.columna);
  }

  it('usuario: SELECT y DELETE de tabla; INSERT y UPDATE solo en columnas puntuales', async () => {
    expect(await privilegiosDeTabla('usuario')).toEqual(['SELECT', 'DELETE']);
    expect(await columnasCon('usuario', 'INSERT')).toEqual([
      'clinica_id',
      'email',
      'hash_contrasena',
      'id',
      'profesional_id',
      'rol',
    ]);
    expect(await columnasCon('usuario', 'UPDATE')).toEqual(['activo', 'profesional_id', 'rol']);
  });

  it('token_refresco: SELECT de tabla; INSERT puntual y UPDATE solo de revoked_en', async () => {
    expect(await privilegiosDeTabla('token_refresco')).toEqual(['SELECT']);
    expect(await columnasCon('token_refresco', 'INSERT')).toEqual([
      'clinica_id',
      'hash_token',
      'id',
      'usuario_id',
      'vence_en',
    ]);
    expect(await columnasCon('token_refresco', 'UPDATE')).toEqual(['revoked_en']);
  });

  it('PUBLIC no tiene ningún privilegio sobre las dos tablas', async () => {
    const filas = await consultarComoMigra<{ relname: string; acl: string | null }>(
      entorno.urlMigra,
      `SELECT c.relname, c.relacl::text AS acl FROM pg_class c
        WHERE c.relname IN ('usuario', 'token_refresco') AND c.relnamespace = 'public'::regnamespace`,
    );
    for (const fila of filas) {
      // Una ACL de PUBLIC aparecería como `=privilegios/propietario` (grantee vacío).
      expect(fila.acl ?? '', fila.relname).not.toMatch(/(^|[{,])=/);
    }
  });
});
