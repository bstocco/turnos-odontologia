import { describe, expect, it } from 'vitest';

import * as e from '../../../../src/domain/agenda/errores-agenda.js';
import { ErrorDeDominio, type TipoDeError } from '../../../../src/domain/shared/errores.js';

const casos: ReadonlyArray<[string, () => ErrorDeDominio, string, TipoDeError]> = [
  ['intervaloInvalido', e.intervaloInvalido, 'INTERVALO_INVALIDO', 'solicitud_invalida'],
  ['ocupacionInvalida', e.ocupacionInvalida, 'OCUPACION_INVALIDA', 'solicitud_invalida'],
  ['estadoTurnoInvalido', e.estadoTurnoInvalido, 'ESTADO_TURNO_INVALIDO', 'solicitud_invalida'],
  ['zonaHorariaInvalida', e.zonaHorariaInvalida, 'ZONA_HORARIA_INVALIDA', 'solicitud_invalida'],
  [
    'fechaHoraLocalInvalida',
    e.fechaHoraLocalInvalida,
    'FECHA_HORA_LOCAL_INVALIDA',
    'solicitud_invalida',
  ],
  [
    'turnoSolapadoProfesional',
    e.turnoSolapadoProfesional,
    'TURNO_SOLAPADO_PROFESIONAL',
    'conflicto',
  ],
  ['turnoSolapadoSillon', e.turnoSolapadoSillon, 'TURNO_SOLAPADO_SILLON', 'conflicto'],
  [
    'turnoModificadoConcurrentemente',
    e.turnoModificadoConcurrentemente,
    'TURNO_MODIFICADO_CONCURRENTEMENTE',
    'conflicto',
  ],
  ['turnoInicioEnPasado', e.turnoInicioEnPasado, 'TURNO_INICIO_EN_PASADO', 'regla_de_negocio'],
  ['turnoNoAlineado', e.turnoNoAlineado, 'TURNO_NO_ALINEADO', 'regla_de_negocio'],
  ['turnoEnFeriado', e.turnoEnFeriado, 'TURNO_EN_FERIADO', 'regla_de_negocio'],
  ['turnoFueraDeHorario', e.turnoFueraDeHorario, 'TURNO_FUERA_DE_HORARIO', 'regla_de_negocio'],
  ['turnoEnBloqueo', e.turnoEnBloqueo, 'TURNO_EN_BLOQUEO', 'regla_de_negocio'],
  [
    'transicionTurnoInvalida',
    e.transicionTurnoInvalida,
    'TRANSICION_TURNO_INVALIDA',
    'regla_de_negocio',
  ],
  ['turnoAunNoIniciado', e.turnoAunNoIniciado, 'TURNO_AUN_NO_INICIADO', 'regla_de_negocio'],
  ['horaLocalInexistente', e.horaLocalInexistente, 'HORA_LOCAL_INEXISTENTE', 'regla_de_negocio'],
];

describe('fábricas de errores de agenda', () => {
  it.each(casos)('%s produce %s con el tipo correcto', (_n, fabrica, codigo, tipo) => {
    const err = fabrica();
    expect(err).toBeInstanceOf(ErrorDeDominio);
    expect(err.codigo).toBe(codigo);
    expect(err.tipo).toBe(tipo);
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('permite agregar detalle opcional al mensaje', () => {
    expect(e.turnoEnBloqueo('bloqueo b-1').message).toContain('bloqueo b-1');
  });
});
