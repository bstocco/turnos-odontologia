import { Faker, base, es } from '@faker-js/faker';

/*
 * Datos SINTÉTICOS para los e2e (Ley 25.326, regla dura 2): nunca se leen ni se copian de una
 * base real. Todo es determinista respecto de la semilla.
 */

/** Rango de DNI ficticio: 8 dígitos que empiezan con 99. */
export const rangoDeDniSintetico = { minimo: 99_000_000, maximo: 99_999_999 } as const;

/** Primo mayor que la cantidad de DNI distintos que necesita una ejecución. */
const MODULO_DNI = 999_983;
const PASO_DNI = 7_919;

export interface PacienteSinteticoDatos {
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email: string;
  readonly obraSocial: string;
}

/** Paciente ficticio: email en `.invalid` (reservado, RFC 2606), DNI ficticio y teléfono con 5555. */
export function pacienteSintetico(semilla: number): PacienteSinteticoDatos {
  const faker = new Faker({ locale: [es, base] });
  faker.seed(semilla);
  const dni = rangoDeDniSintetico.minimo + ((semilla * PASO_DNI) % MODULO_DNI);
  return {
    nombre: faker.person.firstName(),
    apellido: faker.person.lastName(),
    dni: String(dni),
    telefono: `+54 9 11 5555 ${String(1000 + (semilla % 9000))}`,
    email: `paciente.${semilla}@ejemplo.invalid`,
    obraSocial: `Obra social sintética ${semilla}`,
  };
}

let contadorDeSemilla = 1000;

/** Semilla nueva dentro del proceso, para flujos que necesitan varios pacientes distintos. */
export function semillaNueva(): number {
  contadorDeSemilla += 1;
  return contadorDeSemilla;
}
