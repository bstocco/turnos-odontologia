import type { RequestContext, TipoActor } from '../shared/request-context.js';
import { ErrorDeDominio } from '../../domain/shared/errores.js';

import { enmascararDatosAuditoria } from './enmascarar.js';
import type { EntradaAuditoria, RegistroAuditoriaAInsertar } from './puertos.js';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_IDENTIFICADOR = /^[a-z][a-z0-9_]*$/;
const FORMATO_SECCION_IPV4 = /^(0|[1-9]\d{0,2})$/;
const FORMATO_HEXTETO_IPV6 = /^[0-9a-fA-F]{1,4}$/;
const TIPOS_ACTOR_VALIDOS: ReadonlySet<string> = new Set<TipoActor>([
  'usuario',
  'paciente_enlace',
  'sistema',
]);

function esIpv4Valida(valor: string): boolean {
  const octetos = valor.split('.');
  if (octetos.length !== 4) return false;
  return octetos.every((octeto) => FORMATO_SECCION_IPV4.test(octeto) && Number(octeto) <= 255);
}

function esIpv6Valida(valor: string): boolean {
  if (valor.length === 0 || /[^0-9a-fA-F:.]/.test(valor)) return false;

  const mitades = valor.split('::');
  if (mitades.length > 2) return false;

  const tieneCompresion = mitades.length === 2;
  const izquierda = mitades[0] === '' ? [] : (mitades[0] ?? '').split(':');
  const derecha = !tieneCompresion || mitades[1] === '' ? [] : (mitades[1] ?? '').split(':');

  let ipv4Embida = false;
  const segmentosDerecha = [...derecha];
  const segmentosEvaluar = tieneCompresion ? segmentosDerecha : izquierda;
  const ultimo = segmentosEvaluar.at(-1);

  if (ultimo !== undefined && ultimo.includes('.')) {
    if (!esIpv4Valida(ultimo)) return false;
    segmentosEvaluar.pop();
    ipv4Embida = true;
  } else if (tieneCompresion && izquierda.some((s) => s.includes('.'))) {
    return false;
  }

  const todosHextetos = tieneCompresion ? [...izquierda, ...segmentosDerecha] : izquierda;
  if (!todosHextetos.every((segmento) => FORMATO_HEXTETO_IPV6.test(segmento))) return false;

  const totalGrupos = todosHextetos.length + (ipv4Embida ? 2 : 0);
  return tieneCompresion ? totalGrupos < 8 : totalGrupos === 8;
}

/** Valida direcciones IPv4, IPv6 e IPv4 mapeadas en IPv6 (sin puerto ni máscara CIDR). */
export function esIpValida(valor: string): boolean {
  return esIpv4Valida(valor) || esIpv6Valida(valor);
}

function normalizarOpcional(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null) return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

function validarActor(ctx: RequestContext): { tipo: TipoActor; id: string | null } {
  const tipo = ctx.actor?.tipo;
  if (typeof tipo !== 'string' || !TIPOS_ACTOR_VALIDOS.has(tipo)) {
    throw new ErrorDeDominio(
      'AUDITORIA_ACTOR_INVALIDO',
      'solicitud_invalida',
      'El tipo de actor de auditoría debe ser usuario, paciente_enlace o sistema.',
    );
  }
  const actorId = normalizarOpcional(ctx.actor.id);
  if (tipo !== 'sistema' && actorId === null) {
    throw new ErrorDeDominio(
      'AUDITORIA_ACTOR_ID_REQUERIDO',
      'solicitud_invalida',
      'Los actores usuario y paciente_enlace requieren un identificador de actor.',
    );
  }
  return { tipo, id: actorId };
}

/** Valida contexto, entrada e IP, y enmascara `antes`/`despues` sin mutar al llamador. */
export function prepararRegistroAuditoria(
  ctx: RequestContext,
  entrada: EntradaAuditoria,
): RegistroAuditoriaAInsertar {
  if (typeof ctx.clinicaId !== 'string' || !FORMATO_UUID.test(ctx.clinicaId)) {
    throw new ErrorDeDominio(
      'AUDITORIA_CLINICA_INVALIDA',
      'solicitud_invalida',
      'El identificador de la clínica debe ser un UUID válido.',
    );
  }

  const actor = validarActor(ctx);

  const accion = entrada.accion.trim();
  const entidad = entrada.entidad.trim();
  if (!FORMATO_IDENTIFICADOR.test(accion) || !FORMATO_IDENTIFICADOR.test(entidad)) {
    throw new ErrorDeDominio(
      'AUDITORIA_IDENTIFICADOR_INVALIDO',
      'solicitud_invalida',
      'La acción y la entidad deben usar formato snake_case en minúsculas.',
    );
  }

  const entidadId = normalizarOpcional(entrada.entidadId);
  if (entidadId !== null && !FORMATO_UUID.test(entidadId)) {
    throw new ErrorDeDominio(
      'AUDITORIA_ENTIDAD_ID_INVALIDO',
      'solicitud_invalida',
      'El identificador de la entidad debe ser un UUID válido.',
    );
  }

  const ip = normalizarOpcional(entrada.ip);
  if (ip !== null && !esIpValida(ip)) {
    throw new ErrorDeDominio(
      'AUDITORIA_IP_INVALIDA',
      'solicitud_invalida',
      'La dirección IP indicada no es válida.',
    );
  }

  return {
    clinicaId: ctx.clinicaId,
    actorTipo: actor.tipo,
    actorId: actor.id,
    accion,
    entidad,
    entidadId,
    datosAntes: enmascararDatosAuditoria(entrada.antes),
    datosDespues: enmascararDatosAuditoria(entrada.despues),
    ip,
  };
}
