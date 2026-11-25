import { describe, expect, it, vi } from 'vitest';

import { solicitarCodigoVerificacion } from '../../../src/application/reserva-publica/solicitar-codigo.js';
import type {
  CodigoVerificacionRegistro,
  CodigoVerificacionRepositorio,
  DependenciasSolicitudCodigo,
} from '../../../src/application/reserva-publica/puertos.js';
import type {
  NotificacionRegistrada,
  NotificacionRepositorio,
} from '../../../src/application/notificaciones/puertos.js';
import { ErrorDeEnvioEmail } from '../../../src/application/notificaciones/errores.js';
import { cryptoComunicacion } from '../../../src/infrastructure/crypto/index.js';

function crearDoblesSolicitud(opciones: { readonly falloEmail?: boolean } = {}) {
  const ahora = new Date('2026-12-10T12:00:00.000Z');
  const codigosPersistidos: CodigoVerificacionRegistro[] = [];
  const notificaciones: NotificacionRegistrada[] = [];
  const emailsEnviados: { para: string; asunto: string; texto: string }[] = [];
  const logs: { nivel: string; datos: Record<string, unknown>; mensaje: string }[] = [];
  let seq = 0;

  const repoCodigos: CodigoVerificacionRepositorio = {
    async invalidarPendientesPorEmail(email, fecha) {
      for (let i = 0; i < codigosPersistidos.length; i++) {
        const c = codigosPersistidos[i]!;
        if (c.email === email && c.consumidoEn === null) {
          codigosPersistidos[i] = { ...c, consumidoEn: fecha };
        }
      }
    },
    async insertar(entrada) {
      const reg: CodigoVerificacionRegistro = {
        id: entrada.id,
        clinicaId: 'clinica-1',
        email: entrada.email,
        hashCodigo: entrada.hashCodigo,
        venceEn: entrada.venceEn,
        intentos: 0,
        consumidoEn: null,
        creadoEn: ahora,
      };
      codigosPersistidos.push(reg);
      return reg;
    },
    async obtenerUltimoParaActualizar() {
      return codigosPersistidos[codigosPersistidos.length - 1] ?? null;
    },
    async obtenerPorIdParaActualizar() {
      return null;
    },
    async actualizarIntentos() {},
    async marcarConsumido() {},
  };

  const repoNotificaciones: NotificacionRepositorio = {
    async crearOEncontrarIdempotente(entrada) {
      const n: NotificacionRegistrada = {
        id: entrada.id,
        clinicaId: entrada.clinicaId,
        turnoId: entrada.turnoId,
        canal: entrada.canal,
        tipo: entrada.tipo,
        estado: 'pendiente',
        claveIdempotencia: entrada.claveIdempotencia,
        intentos: 0,
        programadaPara: entrada.programadaPara,
        enviadaEn: null,
        error: null,
        creadaEn: ahora,
        actualizadaEn: ahora,
      };
      notificaciones.push(n);
      return { creada: true, notificacion: n };
    },
    async buscarPorId(id) {
      return notificaciones.find((n) => n.id === id) ?? null;
    },
    async marcarEnviada(id, enviadaEn) {
      const idx = notificaciones.findIndex((n) => n.id === id);
      const actualizada: NotificacionRegistrada = {
        ...notificaciones[idx]!,
        estado: 'enviada',
        intentos: notificaciones[idx]!.intentos + 1,
        enviadaEn,
      };
      notificaciones[idx] = actualizada;
      return actualizada;
    },
    async registrarFalloIntento(id, opts) {
      const idx = notificaciones.findIndex((n) => n.id === id);
      const actualizada: NotificacionRegistrada = {
        ...notificaciones[idx]!,
        estado: opts.definitivo ? 'fallida' : 'pendiente',
        intentos: notificaciones[idx]!.intentos + 1,
        error: opts.errorSeguro,
      };
      notificaciones[idx] = actualizada;
      return actualizada;
    },
  };

  const deps: DependenciasSolicitudCodigo = {
    ejecutor: {
      iniciarEmision(_clinicaId, fn) {
        return fn({
          nombreClinica: 'Odonto Sur',
          codigos: repoCodigos,
          notificaciones: repoNotificaciones,
        });
      },
      finalizarNotificacion(_clinicaId, fn) {
        return fn(repoNotificaciones);
      },
    },
    emailSender: {
      async enviar(mensaje) {
        if (opciones.falloEmail) {
          throw new ErrorDeEnvioEmail('EMAIL_ERROR_RED', true, 'SMTP caído');
        }
        emailsEnviados.push(mensaje);
        return { idProveedor: 'prov-1' };
      },
    },
    crypto: cryptoComunicacion,
    reloj: { ahora: () => ahora },
    logger: {
      info: (datos, mensaje) => logs.push({ nivel: 'info', datos, mensaje }),
      warn: (datos, mensaje) => logs.push({ nivel: 'warn', datos, mensaje }),
      error: (datos, mensaje) => logs.push({ nivel: 'error', datos, mensaje }),
    },
    generarId: () => `id-${++seq}`,
  };

  return { deps, codigosPersistidos, notificaciones, emailsEnviados, logs };
}

describe('solicitarCodigoVerificacion (C-15)', () => {
  it('normaliza email, invalida previos, guarda solo hash, traza notificacion codigo y envía plantilla', async () => {
    const { deps, codigosPersistidos, notificaciones, emailsEnviados, logs } =
      crearDoblesSolicitud();

    const r1 = await solicitarCodigoVerificacion(deps, {
      clinicaId: 'clinica-1',
      email: '  Paciente@Ejemplo.Test ',
    });
    expect(r1).toEqual({ estado: 'enviado', vigenciaMinutos: 10 });
    expect(codigosPersistidos).toHaveLength(1);
    expect(codigosPersistidos[0]?.email).toBe('paciente@ejemplo.test');
    expect(codigosPersistidos[0]?.hashCodigo).toMatch(/^[0-9a-f]{64}$/);
    expect(notificaciones[0]?.tipo).toBe('codigo');
    expect(notificaciones[0]?.turnoId).toBeNull();
    expect(notificaciones[0]?.estado).toBe('enviada');

    const matchCodigo = /\b(\d{6})\b/.exec(emailsEnviados[0]!.texto);
    expect(matchCodigo).not.toBeNull();
    const codigoClaro = matchCodigo![1]!;
    expect(codigosPersistidos[0]?.hashCodigo).toBe(cryptoComunicacion.hashSha256(codigoClaro));
    expect(emailsEnviados[0]?.para).toBe('paciente@ejemplo.test');

    // Segunda solicitud invalida el código anterior
    await solicitarCodigoVerificacion(deps, {
      clinicaId: 'clinica-1',
      email: 'paciente@ejemplo.test',
    });
    expect(codigosPersistidos).toHaveLength(2);
    expect(codigosPersistidos[0]?.consumidoEn).not.toBeNull();
    expect(codigosPersistidos[1]?.consumidoEn).toBeNull();

    // Ningún log contiene el código ni el email
    expect(JSON.stringify(logs)).not.toContain('paciente@ejemplo.test');
    expect(JSON.stringify(logs)).not.toContain(codigoClaro);
  });

  it('marca notificacion fallida y retorna error_envio sin filtrar código ni email cuando falla EmailSender', async () => {
    const { deps, notificaciones, logs } = crearDoblesSolicitud({ falloEmail: true });

    const res = await solicitarCodigoVerificacion(deps, {
      clinicaId: 'clinica-1',
      email: 'paciente@ejemplo.test',
    });

    expect(res).toEqual({ estado: 'error_envio', codigo: 'ERROR_PROVEEDOR_EMAIL' });
    expect(notificaciones[0]?.estado).toBe('fallida');
    expect(notificaciones[0]?.error).toBe('EMAIL_ERROR_RED');
    expect(JSON.stringify(logs)).not.toContain('paciente@ejemplo.test');
  });

  it('ejecuta el envío de email fuera de la transacción iniciarEmision', async () => {
    const orden: string[] = [];
    const { deps } = crearDoblesSolicitud();
    const origEnviar = deps.emailSender.enviar;
    const origIniciar = deps.ejecutor.iniciarEmision;
    const enviarSpy = vi.fn(async (m) => {
      orden.push('enviar');
      return origEnviar(m);
    });

    await solicitarCodigoVerificacion(
      {
        ...deps,
        ejecutor: {
          async iniciarEmision(cid, fn) {
            orden.push('tx1:start');
            const res = await origIniciar(cid, fn);
            orden.push('tx1:end');
            return res;
          },
          async finalizarNotificacion(cid, fn) {
            orden.push('tx2:start');
            const res = await deps.ejecutor.finalizarNotificacion(cid, fn);
            orden.push('tx2:end');
            return res;
          },
        },
        emailSender: { enviar: enviarSpy },
      },
      { clinicaId: 'clinica-1', email: 'paciente@ejemplo.test' },
    );

    expect(orden).toEqual(['tx1:start', 'tx1:end', 'enviar', 'tx2:start', 'tx2:end']);
  });
});
