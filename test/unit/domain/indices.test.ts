import { describe, expect, it } from 'vitest';

import * as agenda from '../../../src/domain/agenda/index.js';
import * as shared from '../../../src/domain/shared/index.js';
import * as turno from '../../../src/domain/turno/index.js';

/** Fija la API pública congelada: quitar o renombrar una exportación rompe esta prueba. */
describe('API pública de dominio (contrato congelado)', () => {
  it('agenda exporta funciones y fábricas de error', () => {
    expect(Object.keys(agenda).sort()).toEqual(
      [
        'calcularDisponibilidad',
        'contiene',
        'crearFechaLocal',
        'crearIntervalo',
        'crearIntervaloOLanzar',
        'detectarSolape',
        'diaSemanaDe',
        'esAdyacente',
        'estadoTurnoInvalido',
        'fechaHoraLocalInvalida',
        'franjaAIntervalo',
        'horaLocalInexistente',
        'instanteALocal',
        'intervaloInvalido',
        'localAInstante',
        'ocupacionInvalida',
        'parsearHoraLocal',
        'rangoProfesional',
        'rangoSillon',
        'seSolapa',
        'sumarDias',
        'transicionTurnoInvalida',
        'turnoAunNoIniciado',
        'turnoEnBloqueo',
        'turnoEnFeriado',
        'turnoFueraDeHorario',
        'turnoInicioEnPasado',
        'turnoModificadoConcurrentemente',
        'turnoNoAlineado',
        'turnoSolapadoProfesional',
        'turnoSolapadoSillon',
        'validarDentroDeHorario',
        'validarGranularidad',
        'validarInicioNoPasado',
        'validarNoFeriado',
        'validarSinBloqueo',
        'validarTurnoPrevio',
        'zonaHorariaInvalida',
      ].sort(),
    );
  });

  it('turno y shared exportan su API', () => {
    expect(Object.keys(turno).sort()).toEqual(
      [
        'ESTADOS_INICIALES',
        'ESTADOS_TURNO',
        'TRANSICIONES',
        'crearTurno',
        'esActivo',
        'parsearEstado',
        'puedeTransicionar',
        'transicionar',
      ].sort(),
    );
    expect(Object.keys(shared).sort()).toEqual(
      ['ErrorDeDominio', 'error', 'ok', 'valorOLanzar'].sort(),
    );
  });
});
