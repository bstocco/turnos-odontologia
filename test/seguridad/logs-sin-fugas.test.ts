import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { describirConfig, loadConfig } from '../../src/config/index.js';
import {
  claveInterna,
  crearClinicaSintetica,
  crearUsuarioSintetico,
} from '../e2e/soporte/clinica.js';
import { pacienteSintetico, semillaNueva } from '../e2e/soporte/datos-sinteticos.js';
import { abrirEntorno, type EntornoE2E } from '../e2e/soporte/entorno.js';
import { sumarDias } from '../e2e/soporte/fechas.js';
import { ponerEnMarchaUnaClinica } from '../e2e/soporte/puesta-en-marcha.js';
import { afirmarSinDatosPersonales, valoresSensibles } from '../e2e/soporte/privacidad.js';
import {
  configurarEntornoDeReservaPublica,
  cuerpoDeReserva,
  esperarEnlaces,
  huecosDelDia,
  iniciarWorkerDeCorreos,
  obtenerCodigo,
  reservar,
  type WorkerDeCorreos,
} from '../e2e/soporte/reserva-publica.js';
import { iniciarSesion } from '../e2e/soporte/sesion.js';

vi.mock('../../src/infrastructure/email/index.js', async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import('../../src/infrastructure/email/index.js')>();
  const { emailFalso } = await import('../e2e/soporte/email-falso.js');
  return { ...original, crearEmailSenderSmtp: () => emailFalso };
});

describe('logs sin fugas de PII ni secretos en flujos reales', () => {
  let entorno: EntornoE2E;
  let worker: WorkerDeCorreos;

  beforeAll(async () => {
    configurarEntornoDeReservaPublica();
    entorno = await abrirEntorno();
    worker = await iniciarWorkerDeCorreos();
  });

  afterAll(async () => {
    await worker.detener();
    await entorno.cerrar();
  });

  it('flujos completos de API, errores y describirConfig no filtran PII ni secretos', async () => {
    const clinicaBase = await ponerEnMarchaUnaClinica(entorno, 'logs-pii');
    const admin = await crearUsuarioSintetico(clinicaBase.clinica, 'administrador');
    const sesion = await iniciarSesion(
      entorno,
      clinicaBase.clinica.slug,
      admin.email,
      admin.password,
    );

    // Intento de login fallido con contraseña conocida.
    const claveLoginErronea = 'ClaveErroneaSecreta-C19!';
    await entorno.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        slug: clinicaBase.clinica.slug,
        email: admin.email,
        password: claveLoginErronea,
      },
    });

    // Alta, búsqueda por query y lectura de ficha de paciente sintético.
    const paciente = pacienteSintetico(semillaNueva());
    const alta = await entorno.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers: sesion.encabezados,
      payload: {
        nombre: paciente.nombre,
        apellido: paciente.apellido,
        dni: paciente.dni,
        telefono: paciente.telefono,
        email: paciente.email,
        obraSocial: paciente.obraSocial,
      },
    });
    expect(alta.statusCode).toBe(201);
    const pacienteId = (alta.json() as { id: string }).id;

    await entorno.inject({
      method: 'GET',
      url: `/api/v1/pacientes?dni=${paciente.dni}`,
      headers: sesion.encabezados,
    });
    await entorno.inject({
      method: 'GET',
      url: `/api/v1/pacientes/${pacienteId}`,
      headers: sesion.encabezados,
    });

    // Reserva pública con OTP + enlace de acción real (confirmar).
    const pacientePublico = pacienteSintetico(semillaNueva());
    const codigoOtp = await obtenerCodigo(entorno, clinicaBase.clinica.slug, pacientePublico.email);
    const huecos = await huecosDelDia(
      entorno,
      clinicaBase.clinica.slug,
      clinicaBase,
      clinicaBase.diaConHuecos,
      sumarDias(clinicaBase.diaConHuecos, 1),
    );
    const primerHueco = huecos[0];
    expect(primerHueco).toBeDefined();

    const reservaRes = await reservar(
      entorno,
      clinicaBase.clinica.slug,
      cuerpoDeReserva(clinicaBase, primerHueco!.inicio, codigoOtp, pacientePublico),
    );
    expect(reservaRes.statusCode).toBe(201);

    const enlaces = await esperarEnlaces(pacientePublico.email);
    expect(enlaces.cancelar).toBeDefined();
    const accionRes = await entorno.inject({
      method: 'POST',
      url: '/api/v1/publico/turnos/accion',
      payload: { token: enlaces.cancelar, accion: 'cancelar' },
    });
    expect(accionRes.statusCode).toBe(200);

    // Exportación + error de validación con PII en el cuerpo.
    const exp = await entorno.inject({
      method: 'POST',
      url: '/api/v1/exportaciones',
      headers: sesion.encabezados,
    });
    expect(exp.statusCode).toBe(201);
    const expId = (exp.json() as { id: string }).id;
    await entorno.inject({
      method: 'GET',
      url: `/api/v1/exportaciones/${expId}`,
      headers: sesion.encabezados,
    });

    const clinicaExtra = await crearClinicaSintetica(entorno, 'logs-err');
    await entorno.inject({
      method: 'POST',
      url: `/api/v1/publico/${clinicaExtra.slug}/reservas`,
      payload: {
        profesionalId: 'no-es-uuid',
        paciente: {
          nombre: paciente.nombre,
          dni: paciente.dni,
          telefono: paciente.telefono,
          email: paciente.email,
        },
      },
    });

    // Verificación de describirConfig con secretos sintéticos explícitos.
    const configConSecretos = loadConfig('app', {
      DATABASE_URL: 'postgres://app:db-pass-super-secreto@localhost:5432/turnos_test',
      JWT_ACCESS_SECRET: 'jwt-access-super-secreto-c19',
      JWT_REFRESH_SECRET: 'jwt-refresh-super-secreto-c19',
      EMAIL_API_KEY: 're_email_api_key_secreta_c19',
      ADMIN_INTERNAL_KEY: 'admin-internal-key-secreta-c19',
    });
    const resumenConfig = JSON.stringify(describirConfig(configConSecretos));
    for (const secretoConfig of [
      'db-pass-super-secreto',
      'jwt-access-super-secreto-c19',
      'jwt-refresh-super-secreto-c19',
      're_email_api_key_secreta_c19',
      'admin-internal-key-secreta-c19',
    ]) {
      expect(resumenConfig).not.toContain(secretoConfig);
    }

    // 1) Cero PII de pacientes sintéticos en logs HTTP y logs del worker.
    for (const p of [clinicaBase.paciente, paciente, pacientePublico]) {
      afirmarSinDatosPersonales(entorno.logs, valoresSensibles(p));
      const telefonoSoloDigitos = p.telefono.replace(/\s+/g, '');
      expect(entorno.logs.texto()).not.toContain(telefonoSoloDigitos);
      for (const linea of worker.logs) {
        expect(linea).not.toContain(p.dni);
        expect(linea).not.toContain(p.email);
        expect(linea).not.toContain(telefonoSoloDigitos);
      }
    }

    // 2) Cero secretos, tokens, contraseñas o OTP en claro en los logs HTTP.
    const textoLogs = entorno.logs.texto();
    const secretosEnVuelo = [
      claveInterna(),
      admin.password,
      claveLoginErronea,
      sesion.token,
      codigoOtp,
      enlaces.cancelar!,
      process.env.JWT_ACCESS_SECRET!,
      process.env.JWT_REFRESH_SECRET!,
      process.env.EMAIL_API_KEY!,
    ];
    for (const secreto of secretosEnVuelo) {
      expect(textoLogs).not.toContain(secreto);
    }
  });
});
