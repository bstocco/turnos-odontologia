import { ErrorDeDominio } from '../shared/errores.js';

/**
 * Códigos de área argentinos de 3 dígitos vigentes (ENACOM).
 * `11` corresponde a AMBA (2 dígitos) y el resto de áreas geográficas (`2xxx`/`3xxx`) son de 4 dígitos.
 */
const CODIGOS_AREA_3_DIGITOS: ReadonlySet<string> = new Set([
  '220',
  '221',
  '223',
  '230',
  '236',
  '237',
  '249',
  '260',
  '261',
  '263',
  '264',
  '266',
  '280',
  '291',
  '294',
  '297',
  '298',
  '299',
  '341',
  '342',
  '343',
  '345',
  '348',
  '351',
  '353',
  '358',
  '362',
  '364',
  '370',
  '376',
  '379',
  '380',
  '381',
  '383',
  '385',
  '387',
  '388',
]);

const CARACTERES_TELEFONO_PERMITIDOS = /^\+?[\d\s().-]+$/;
const PREFIJO_AREA_4_DIGITOS = /^[23]\d{3}$/;
const PREFIJO_ABONADO_RESERVADO = /^(?:0|15)/;

function errorTelefonoInvalido(): ErrorDeDominio {
  return new ErrorDeDominio(
    'TELEFONO_INVALIDO',
    'solicitud_invalida',
    'El número de teléfono no tiene un formato argentino válido.',
  );
}

function extraerParteNacional(recortado: string): string {
  if (recortado.length === 0 || !CARACTERES_TELEFONO_PERMITIDOS.test(recortado)) {
    throw errorTelefonoInvalido();
  }

  const digitos = recortado.replace(/\D/g, '');
  if (recortado.startsWith('+') && !digitos.startsWith('54')) {
    throw errorTelefonoInvalido();
  }

  let nacional = digitos;
  if (nacional.startsWith('0054')) {
    nacional = nacional.slice(2);
  } else if (nacional.startsWith('00')) {
    throw errorTelefonoInvalido();
  }

  if (nacional.startsWith('54')) {
    nacional = nacional.slice(2);
    if (nacional.startsWith('9')) {
      nacional = nacional.slice(1);
    }
  }

  if (nacional.startsWith('0')) {
    nacional = nacional.slice(1);
  }

  return nacional;
}

function resolverLongitudArea(nacional: string): number | null {
  if (nacional.startsWith('11')) return 2;

  const area3 = nacional.slice(0, 3);
  if (CODIGOS_AREA_3_DIGITOS.has(area3)) {
    // `220` (Merlo) comparte prefijo con `2202` (González Catán): si en largo 12 el `15` aparece
    // tras 4 dígitos y no tras 3, corresponde al área de 4 dígitos.
    if (
      nacional.length === 12 &&
      nacional.slice(3, 5) !== '15' &&
      PREFIJO_AREA_4_DIGITOS.test(nacional.slice(0, 4))
    ) {
      return 4;
    }
    return 3;
  }

  if (PREFIJO_AREA_4_DIGITOS.test(nacional.slice(0, 4))) return 4;
  return null;
}

function separarAreaYAbonado(nacional: string): { area: string; abonado: string } {
  if (nacional.length !== 10 && nacional.length !== 12) {
    throw errorTelefonoInvalido();
  }

  const longitudArea = resolverLongitudArea(nacional);
  if (longitudArea === null) {
    throw errorTelefonoInvalido();
  }

  const area = nacional.slice(0, longitudArea);
  const resto = nacional.slice(longitudArea);

  if (nacional.length === 12) {
    if (!resto.startsWith('15')) {
      throw errorTelefonoInvalido();
    }
    return { area, abonado: resto.slice(2) };
  }

  return { area, abonado: resto };
}

/**
 * Normaliza un celular argentino al formato internacional exigido por `wa.me`:
 * `549` + código de área + número local (13 dígitos, sin `+`, `0` ni `15`).
 * Nunca incluye el número recibido en el mensaje de error (Ley 25.326).
 */
export function normalizarTelefonoAr(telefono: string): string {
  const nacional = extraerParteNacional(telefono.trim());
  const { area, abonado } = separarAreaYAbonado(nacional);

  if (area.length + abonado.length !== 10 || PREFIJO_ABONADO_RESERVADO.test(abonado)) {
    throw errorTelefonoInvalido();
  }

  return `549${area}${abonado}`;
}
