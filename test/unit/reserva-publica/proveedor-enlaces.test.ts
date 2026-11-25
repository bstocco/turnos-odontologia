import { describe, expect, it } from 'vitest';

import { crearProveedorEnlacesTurno } from '../../../src/application/reserva-publica/proveedor-enlaces.js';
import type {
  NuevoTokenAccion,
  TokenAccionRegistro,
} from '../../../src/application/reserva-publica/puertos.js';
import type { TurnoId } from '../../../src/domain/shared/ids.js';
import { cryptoComunicacion } from '../../../src/infrastructure/crypto/index.js';

function crearProveedorDePrueba(inicioTurno: Date | null) {
  const ahora = new Date('2026-12-10T10:00:00.000Z');
  const guardados: TokenAccionRegistro[] = [];
  let seq = 0;

  const proveedor = crearProveedorEnlacesTurno({
    publicBaseUrl: 'https://turnos.clinica.test/',
    crypto: cryptoComunicacion,
    reloj: { ahora: () => ahora },
    generarId: () => `tok-id-${++seq}`,
    ejecutor: {
      async ejecutar(clinicaId, _turnoId, fn) {
        return fn({
          inicioTurno,
          tokens: {
            async insertar(entrada: NuevoTokenAccion) {
              const reg: TokenAccionRegistro = {
                id: entrada.id,
                clinicaId,
                turnoId: entrada.turnoId as TurnoId,
                proposito: entrada.proposito,
                hashToken: entrada.hashToken,
                venceEn: entrada.venceEn,
                usadoEn: null,
                creadoEn: ahora,
              };
              guardados.push(reg);
              return reg;
            },
            async obtenerPorHashParaActualizar() {
              return null;
            },
            async marcarUsado() {},
          },
        });
      },
    },
  });

  return { proveedor, guardados, ahora };
}

describe('crearProveedorEnlacesTurno (C-15)', () => {
  it('emite enlaceConfirmar y enlaceCancelar para turno pendiente_confirmacion guardando solo hashes', async () => {
    const inicio = new Date('2026-12-11T15:00:00.000Z');
    const { proveedor, guardados } = crearProveedorDePrueba(inicio);

    const enlaces = await proveedor.obtenerEnlaces({
      clinicaId: 'clinica-1',
      turnoId: 'turno-1',
      tipo: 'creacion',
      estadoTurno: 'pendiente_confirmacion',
    });

    expect(enlaces.enlaceConfirmar).toBeDefined();
    expect(enlaces.enlaceCancelar).toBeDefined();
    expect(guardados).toHaveLength(2);
    expect(guardados.map((g) => g.proposito)).toEqual(['confirmar', 'cancelar']);

    const tokConf = new URL(enlaces.enlaceConfirmar!).searchParams.get('token')!;
    const tokCanc = new URL(enlaces.enlaceCancelar!).searchParams.get('token')!;
    expect(tokConf).not.toBe(tokCanc);
    expect(guardados[0]?.hashToken).toBe(cryptoComunicacion.hashSha256(tokConf));
    expect(guardados[1]?.hashToken).toBe(cryptoComunicacion.hashSha256(tokCanc));
    expect(guardados[0]?.venceEn.toISOString()).toBe(inicio.toISOString());
  });

  it('emite solo enlaceCancelar para turno confirmado o reprogramacion y nada para cancelacion/pasado', async () => {
    const inicio = new Date('2026-12-15T15:00:00.000Z');
    const { proveedor, guardados } = crearProveedorDePrueba(inicio);

    const conf = await proveedor.obtenerEnlaces({
      clinicaId: 'clinica-1',
      turnoId: 'turno-1',
      tipo: 'confirmacion',
      estadoTurno: 'confirmado',
    });
    expect(conf.enlaceConfirmar).toBeUndefined();
    expect(conf.enlaceCancelar).toBeDefined();
    expect(guardados).toHaveLength(1);
    expect(guardados[0]?.proposito).toBe('cancelar');

    const canc = await proveedor.obtenerEnlaces({
      clinicaId: 'clinica-1',
      turnoId: 'turno-1',
      tipo: 'cancelacion',
      estadoTurno: 'cancelado',
    });
    expect(canc).toEqual({});
    expect(guardados).toHaveLength(1);

    const pasado = crearProveedorDePrueba(new Date('2026-12-10T09:00:00.000Z'));
    expect(
      await pasado.proveedor.obtenerEnlaces({
        clinicaId: 'clinica-1',
        turnoId: 'turno-1',
        tipo: 'recordatorio',
        estadoTurno: 'pendiente_confirmacion',
      }),
    ).toEqual({});
    expect(pasado.guardados).toHaveLength(0);
  });
});
