/**
 * Plantilla de feriados nacionales de Argentina (design D10, PO-15): una lista por año, ya con los
 * traslados de la Ley 27.399 aplicados. NO incluye días no laborables ni "puentes" turísticos (la
 * clínica los agrega a mano) ni feriados provinciales o locales. Un año nuevo se agrega por PR.
 *
 * Fuentes y estado de verificación (consultadas el 2026-11-24):
 *  - Ley 27.399 (feriados inamovibles y trasladables; martes/miércoles -> lunes anterior,
 *    jueves/viernes -> lunes siguiente) y Decreto 614/2025 (permite mover a viernes o lunes los
 *    trasladables que caen sábado o domingo).
 *  - 2026: mayo a diciembre cotejado con el calendario oficial publicado por la prensa (Resolución
 *    164/2025; trasladados 17/6 -> 15/6 y 20/11 -> 23/11; 12/10 y 17/8 caen lunes). Enero a abril
 *    DERIVADO de la ley y de la Pascua (5/4/2026): Carnaval 16 y 17/2, Viernes Santo 3/4; el
 *    Jueves Santo (2/4) es día no laborable y coincide con el feriado de Malvinas.
 *  - 2027: DERIVADO de la ley y de la Pascua (28/3/2027) y coincide con una fuente secundaria; NO
 *    se halló decreto oficial. El 20/11/2027 cae sábado: se mantiene, pero el Gobierno puede
 *    moverlo (Decreto 614/2025). Revisar contra argentina.gob.ar/jefatura/feriados-nacionales-2027
 *    antes de depender de este año; la clínica puede borrar o agregar feriados.
 */
export interface FeriadoDePlantilla {
  readonly fecha: string;
  readonly descripcion: string;
}

const ANO_NUEVO = 'Año Nuevo';
const CARNAVAL = 'Carnaval';
const MEMORIA = 'Día Nacional de la Memoria por la Verdad y la Justicia';
const MALVINAS = 'Día del Veterano y de los Caídos en la Guerra de Malvinas';
const VIERNES_SANTO = 'Viernes Santo';
const TRABAJADOR = 'Día del Trabajador';
const MAYO = 'Día de la Revolución de Mayo';
const GUEMES = 'Paso a la Inmortalidad del Gral. Martín Miguel de Güemes';
const BELGRANO = 'Paso a la Inmortalidad del Gral. Manuel Belgrano';
const INDEPENDENCIA = 'Día de la Independencia';
const SAN_MARTIN = 'Paso a la Inmortalidad del Gral. José de San Martín';
const DIVERSIDAD = 'Día del Respeto a la Diversidad Cultural';
const SOBERANIA = 'Día de la Soberanía Nacional';
const INMACULADA = 'Inmaculada Concepción de María';
const NAVIDAD = 'Navidad';

export const PLANTILLAS_FERIADOS_NACIONALES: Readonly<
  Record<number, readonly FeriadoDePlantilla[]>
> = {
  2026: [
    { fecha: '2026-01-01', descripcion: ANO_NUEVO },
    { fecha: '2026-02-16', descripcion: CARNAVAL },
    { fecha: '2026-02-17', descripcion: CARNAVAL },
    { fecha: '2026-03-24', descripcion: MEMORIA },
    { fecha: '2026-04-02', descripcion: MALVINAS },
    { fecha: '2026-04-03', descripcion: VIERNES_SANTO },
    { fecha: '2026-05-01', descripcion: TRABAJADOR },
    { fecha: '2026-05-25', descripcion: MAYO },
    { fecha: '2026-06-15', descripcion: GUEMES },
    { fecha: '2026-06-20', descripcion: BELGRANO },
    { fecha: '2026-07-09', descripcion: INDEPENDENCIA },
    { fecha: '2026-08-17', descripcion: SAN_MARTIN },
    { fecha: '2026-10-12', descripcion: DIVERSIDAD },
    { fecha: '2026-11-23', descripcion: SOBERANIA },
    { fecha: '2026-12-08', descripcion: INMACULADA },
    { fecha: '2026-12-25', descripcion: NAVIDAD },
  ],
  2027: [
    { fecha: '2027-01-01', descripcion: ANO_NUEVO },
    { fecha: '2027-02-08', descripcion: CARNAVAL },
    { fecha: '2027-02-09', descripcion: CARNAVAL },
    { fecha: '2027-03-24', descripcion: MEMORIA },
    { fecha: '2027-03-26', descripcion: VIERNES_SANTO },
    { fecha: '2027-04-02', descripcion: MALVINAS },
    { fecha: '2027-05-01', descripcion: TRABAJADOR },
    { fecha: '2027-05-25', descripcion: MAYO },
    { fecha: '2027-06-20', descripcion: BELGRANO },
    { fecha: '2027-06-21', descripcion: GUEMES },
    { fecha: '2027-07-09', descripcion: INDEPENDENCIA },
    { fecha: '2027-08-16', descripcion: SAN_MARTIN },
    { fecha: '2027-10-11', descripcion: DIVERSIDAD },
    { fecha: '2027-11-20', descripcion: SOBERANIA },
    { fecha: '2027-12-08', descripcion: INMACULADA },
    { fecha: '2027-12-25', descripcion: NAVIDAD },
  ],
};

/** Plantilla del año, o `undefined` si todavía no se cargó. */
export function plantillaDeFeriados(anio: number): readonly FeriadoDePlantilla[] | undefined {
  return PLANTILLAS_FERIADOS_NACIONALES[anio];
}
