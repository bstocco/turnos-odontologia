import { describe, expect, it } from 'vitest';

import {
  ZONA_HORARIA_POR_DEFECTO,
  formatearFechaHoraEnZona,
  plantillaCancelacionTurno,
  plantillaCodigoVerificacion,
  plantillaConfirmacionTurno,
  plantillaCreacionTurno,
  plantillaRecordatorioTurno,
  plantillaRecordatorioWhatsapp,
  plantillaReprogramacionTurno,
} from '../../../src/domain/comunicacion/plantillas.js';
import { construirEnlaceWhatsapp } from '../../../src/domain/comunicacion/whatsapp.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

const BASE_TURNO = {
  nombreClinica: 'Clínica Sonrisa',
  nombrePaciente: 'Lucía Gómez',
  nombreProfesional: 'Dra. Sofía Méndez',
  nombrePrestacion: 'Limpieza dental',
  inicio: new Date('2026-06-15T01:30:00Z'),
  zonaHoraria: 'America/Argentina/Buenos_Aires',
} as const;

describe('formatearFechaHoraEnZona', () => {
  it('aplica el cruce de día respecto a UTC en America/Argentina/Buenos_Aires', () => {
    const formateada = formatearFechaHoraEnZona(
      new Date('2026-06-15T01:30:00Z'),
      ZONA_HORARIA_POR_DEFECTO,
    );
    expect(formateada.fecha).toBe('14/06/2026');
    expect(formateada.hora).toBe('22:30');
    expect(formateada.texto).toBe('14/06/2026 a las 22:30');
  });

  it('formatea la medianoche exacta como 00:00 y no como 24:00', () => {
    const formateada = formatearFechaHoraEnZona(new Date('2026-06-15T03:00:00Z'));
    expect(formateada.fecha).toBe('15/06/2026');
    expect(formateada.hora).toBe('00:00');
  });

  it('respeta otras zonas IANA explícitas como UTC', () => {
    const formateada = formatearFechaHoraEnZona(new Date('2026-06-15T01:30:00Z'), 'UTC');
    expect(formateada.fecha).toBe('15/06/2026');
    expect(formateada.hora).toBe('01:30');
  });

  it.each(['', '   ', 'America/NoExiste', 'UTC-3', 'GMT+3', '-03:00', 'Etc/GMT+3'])(
    'rechaza zona horaria inválida o desplazamiento fijo (%j) con ZONA_HORARIA_INVALIDA',
    (zonaInvalida) => {
      let capturado: unknown;
      try {
        formatearFechaHoraEnZona(new Date('2026-06-15T12:00:00Z'), zonaInvalida);
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(ErrorDeDominio);
      const errorDominio = capturado as ErrorDeDominio;
      expect(errorDominio.codigo).toBe('ZONA_HORARIA_INVALIDA');
      expect(errorDominio.tipo).toBe('solicitud_invalida');
    },
  );

  it('rechaza un instante Date inválido con PARAMETRO_INVALIDO', () => {
    let capturado: unknown;
    try {
      formatearFechaHoraEnZona(new Date('fecha-invalida'));
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorDeDominio);
    const errorDominio = capturado as ErrorDeDominio;
    expect(errorDominio.codigo).toBe('PARAMETRO_INVALIDO');
    expect(errorDominio.tipo).toBe('solicitud_invalida');
  });
});

describe('plantillas de comunicación en español', () => {
  it('plantillaCreacionTurno distingue pendiente_confirmacion y confirmado e incluye solo los enlaces provistos', () => {
    const pendiente = plantillaCreacionTurno({
      ...BASE_TURNO,
      estado: 'pendiente_confirmacion',
      enlaceConfirmar: 'https://api.example/accion?t=abc',
      enlaceCancelar: 'https://api.example/accion?t=xyz',
    });

    expect(pendiente.asunto).toContain('Clínica Sonrisa');
    expect(pendiente.cuerpo).toContain('pendiente de confirmación');
    expect(pendiente.cuerpo).toContain('14/06/2026');
    expect(pendiente.cuerpo).toContain('22:30');
    expect(pendiente.cuerpo).toContain('https://api.example/accion?t=abc');
    expect(pendiente.cuerpo).toContain('https://api.example/accion?t=xyz');

    const confirmado = plantillaCreacionTurno({
      ...BASE_TURNO,
      estado: 'confirmado',
      enlaceCancelar: 'https://api.example/accion?t=xyz',
    });

    expect(confirmado.cuerpo).toContain('confirmado');
    expect(confirmado.cuerpo).not.toContain('pendiente de confirmación');
    expect(confirmado.cuerpo).toContain('https://api.example/accion?t=xyz');
    expect(confirmado.cuerpo).not.toContain('Confirmar');
  });

  it('plantillaConfirmacionTurno incluye datos del turno y enlace de cancelación solo si se provee', () => {
    const conEnlace = plantillaConfirmacionTurno({
      ...BASE_TURNO,
      enlaceCancelar: 'https://api.example/cancelar?t=123',
    });
    expect(conEnlace.asunto).toContain('confirmado');
    expect(conEnlace.cuerpo).toContain('Dra. Sofía Méndez');
    expect(conEnlace.cuerpo).toContain('https://api.example/cancelar?t=123');

    const sinEnlace = plantillaConfirmacionTurno(BASE_TURNO);
    expect(sinEnlace.cuerpo).not.toContain('http');
  });

  it('plantillaCancelacionTurno incluye el motivo solo cuando se informa', () => {
    const conMotivo = plantillaCancelacionTurno({
      ...BASE_TURNO,
      motivo: 'Imprevisto del profesional',
    });
    expect(conMotivo.asunto).toContain('cancelado');
    expect(conMotivo.cuerpo).toContain('Motivo: Imprevisto del profesional');

    const sinMotivo = plantillaCancelacionTurno(BASE_TURNO);
    expect(sinMotivo.cuerpo).not.toContain('Motivo:');
  });

  it('plantillaReprogramacionTurno muestra la fecha/hora anterior y la nueva en zona local', () => {
    const email = plantillaReprogramacionTurno({
      ...BASE_TURNO,
      inicioAnterior: new Date('2026-06-14T15:00:00Z'),
      inicio: new Date('2026-06-16T18:30:00Z'),
      enlaceCancelar: 'https://api.example/cancelar?t=999',
    });

    expect(email.asunto).toContain('reprogramado');
    expect(email.cuerpo).toContain('14/06/2026 a las 12:00');
    expect(email.cuerpo).toContain('16/06/2026 a las 15:30');
    expect(email.cuerpo).toContain('https://api.example/cancelar?t=999');
  });

  it('plantillaRecordatorioTurno y plantillaRecordatorioWhatsapp generan mensajes en español utilizables', () => {
    const email = plantillaRecordatorioTurno({
      ...BASE_TURNO,
      enlaceConfirmar: 'https://api.example/confirmar?t=1',
      enlaceCancelar: 'https://api.example/cancelar?t=2',
    });
    expect(email.asunto).toContain('Recordatorio');
    expect(email.cuerpo).toContain('14/06/2026');
    expect(email.cuerpo).toContain('22:30');
    expect(email.cuerpo).toContain('https://api.example/confirmar?t=1');

    const textoWa = plantillaRecordatorioWhatsapp(BASE_TURNO);
    expect(textoWa).toContain('Lucía Gómez');
    expect(textoWa).toContain('14/06/2026');
    expect(textoWa).toContain('22:30');
    expect(textoWa).toContain('Clínica Sonrisa');
    expect(() => construirEnlaceWhatsapp('011 15 5555-1234', textoWa)).not.toThrow();
  });

  it('plantillaCodigoVerificacion preserva ceros a la izquierda, muestra vigencia y valida parámetros', () => {
    const email = plantillaCodigoVerificacion({
      nombreClinica: 'Clínica Sonrisa',
      codigo: '004219',
      vigenciaMinutos: 10,
    });

    expect(email.asunto).toContain('Código de verificación');
    expect(email.cuerpo).toContain('004219');
    expect(email.cuerpo).toContain('10 minutos');

    let capturado: unknown;
    try {
      plantillaCodigoVerificacion({
        nombreClinica: 'Clínica Sonrisa',
        codigo: '   ',
        vigenciaMinutos: 10,
      });
    } catch (error) {
      capturado = error;
    }
    expect(capturado).toBeInstanceOf(ErrorDeDominio);
    expect((capturado as ErrorDeDominio).codigo).toBe('PARAMETRO_INVALIDO');

    let errorVigencia: unknown;
    try {
      plantillaCodigoVerificacion({
        nombreClinica: 'Clínica Sonrisa',
        codigo: '987654',
        vigenciaMinutos: 0,
      });
    } catch (error) {
      errorVigencia = error;
    }
    expect(errorVigencia).toBeInstanceOf(ErrorDeDominio);
    expect((errorVigencia as ErrorDeDominio).codigo).toBe('PARAMETRO_INVALIDO');
    expect((errorVigencia as ErrorDeDominio).message).not.toContain('987654');
  });

  it('sanea saltos de línea en el asunto y nunca expone DNI ni obra social', () => {
    const datosConSaltos = {
      ...BASE_TURNO,
      nombreClinica: 'Clínica\r\nBcc: atacante@example.com',
      nombrePrestacion: 'Consulta\ninyección',
    };

    const asuntos = [
      plantillaCreacionTurno({ ...datosConSaltos, estado: 'confirmado' }),
      plantillaConfirmacionTurno(datosConSaltos),
      plantillaCancelacionTurno(datosConSaltos),
      plantillaReprogramacionTurno({
        ...datosConSaltos,
        inicioAnterior: new Date('2026-06-14T15:00:00Z'),
      }),
      plantillaRecordatorioTurno(datosConSaltos),
      plantillaCodigoVerificacion({
        nombreClinica: 'Clínica\r\nSubject: Falso',
        codigo: '123456',
        vigenciaMinutos: 10,
      }),
    ];

    for (const email of asuntos) {
      expect(email.asunto).not.toMatch(/[\r\n]/);
      expect(email.cuerpo.toLowerCase()).not.toContain('dni');
      expect(email.cuerpo.toLowerCase()).not.toContain('obra social');
    }
  });
});
