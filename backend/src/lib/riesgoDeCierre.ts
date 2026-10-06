// backend/src/lib/riesgoDeCierre.ts
//
// ============================================================================
//  QUÉ LE VA A PASAR A ESTA NOTA CUANDO SE CIERRE
// ============================================================================
//
//  Durante el año la pantalla muestra avance sobre lo que ya pasó. Al cerrar,
//  las metas configuradas como "todo o nada" o con umbral de períodos se
//  evalúan con la regla estricta, y el número puede caer de golpe.
//
//  No es un error del cálculo: son dos preguntas distintas y las dos están
//  bien respondidas. Una meta que exige 10 de 12 períodos y lleva 9 cumplidos
//  va 90% —ese es su avance real— y al cerrar da 0, porque le falta uno.
//
//  EL PROBLEMA ES QUE LLEGA DE SORPRESA
//  Guido Barretto vio 88,9 todo el año y su feedback final dijo 76,1. Una de
//  sus metas pasó de 92% a 0 el día del cierre. Nadie se lo avisó: la
//  información estaba en el sistema desde el primer mes.
//
//  Este módulo la saca a la superficie. No cambia ningún número: compara los
//  dos modos del motor y describe la diferencia, meta por meta, para que la
//  persona y su jefe la vean mientras todavía se puede hacer algo.
//
//  Medido: 16 personas y 20 metas en el AF2025. En el AF2026 hay 40 metas
//  configuradas así, esperando a que carguen datos.
// ============================================================================

import {
  calculateMetaScore,
  calculateObjectiveProgress,
  calculatePeriodCompliance,
} from "./scoringCore.ts";
import type { Meta, Hito, Objetivo } from "./tipos.ts";

/** Diferencia mínima, en puntos, para que valga la pena avisar. */
const UMBRAL_AVISO = 0.5;

export interface RiesgoDeMeta {
  nombre: string;
  /** Lo que muestra hoy el seguimiento. */
  seguimiento: number;
  /** Lo que daría si se cerrara ahora. */
  cierre: number;
  /** Negativo = la nota baja al cerrar. */
  diferencia: number;
  /** Por qué cambia, en palabras. */
  motivo: string;
  /** Qué haría falta para que no baje. */
  queFalta: string | null;
}

export interface RiesgoDeObjetivo {
  objetivoId: string;
  nombre: string;
  peso: number;
  seguimiento: number;
  cierre: number;
  diferencia: number;
  /** Cuántos puntos de la nota final se juegan acá. */
  impactoEnLaNota: number;
  metas: RiesgoDeMeta[];
}

/**
 * Cuántos períodos de esta meta están CUMPLIDOS.
 *
 * No es lo mismo que cargados, y la diferencia es justamente lo que el aviso
 * necesita decir: alguien puede tener los 12 períodos cargados y solo 11
 * cumplidos, que es el caso que hace caer la nota a 0.
 *
 * Se evalúa con `reconoceEsfuerzo` apagado, así el motor devuelve 100 o 0
 * según se alcance el objetivo, que es la pregunta de acá.
 */
function periodosCumplidos(meta: Meta, hitos: Hito[]): { cumplidos: number; cargados: number } {
  const metaId = String(meta.metaId ?? meta._id ?? "");
  const binaria = String(meta.unidad || "").toLowerCase().includes("cumple");
  const esperado = meta.esperado ?? meta.target;

  let cumplidos = 0;
  let cargados = 0;

  for (const h of hitos) {
    const r = (h.metas || []).find((m) => String(m.metaId ?? m._id) === metaId);
    const v = r?.resultado;
    if (v === null || v === undefined || v === "") continue;
    cargados++;

    if (binaria) {
      if (v && Number(v) !== 0) cumplidos++;
      continue;
    }
    const p = calculatePeriodCompliance(v, esperado, {
      operador: meta.operador,
      tolerancia: meta.tolerancia,
      reconoceEsfuerzo: false,
      permiteOver: false,
    });
    if ((p ?? 0) >= 100) cumplidos++;
  }

  return { cumplidos, cargados };
}

/**
 * Por qué una meta va a cambiar al cerrar, y qué haría falta para evitarlo.
 *
 * El texto se arma acá y no en la pantalla para que el jefe y la persona lean
 * exactamente lo mismo.
 */
function explicar(meta: Meta, hitos: Hito[]): { motivo: string; queFalta: string | null } {
  const regla = meta.reglaCierre || "promedio";
  const umbral = Number(meta.umbralPeriodos || 0);
  const { cumplidos, cargados } = periodosCumplidos(meta, hitos);

  if (regla === "umbral_periodos" || regla === "umbral_Periodos") {
    const faltan = Math.max(0, umbral - cumplidos);
    return {
      motivo:
        `Esta meta pide cumplir ${umbral} períodos y lleva ${cumplidos} cumplido(s) ` +
        `de ${cargados} cargado(s). Hoy se muestra el avance; al cerrar es todo o ` +
        `nada: si no llega a ${umbral}, da 0.`,
      queFalta: faltan > 0
        ? `Faltan ${faltan} período(s) CUMPLIDO(s) para que no caiga a 0.`
        : null,
    };
  }

  if (meta.reconoceEsfuerzo === false) {
    return {
      motivo:
        "Esta meta no reconoce el esfuerzo parcial: al cerrar, o se alcanza el " +
        "objetivo y vale 100, o no se alcanza y vale 0. El avance que se ve " +
        "ahora acompaña el año, pero no es lo que va a quedar.",
      queFalta: "Hay que alcanzar el objetivo para que no caiga a 0.",
    };
  }

  return {
    motivo: `La regla de cierre "${regla}" evalúa distinto que el seguimiento.`,
    queFalta: null,
  };
}

/**
 * Metas de un objetivo cuyo número cambia al cerrar.
 *
 * @returns [] si el objetivo cierra igual que como se ve hoy.
 */
export function riesgoDeObjetivo(objetivo: Objetivo): RiesgoDeObjetivo | null {
  const hitos = objetivo.hitos || [];
  if (!hitos.length) return null;

  const metas: RiesgoDeMeta[] = [];
  for (const m of objetivo.metas || []) {
    const seguimiento = calculateMetaScore(m, hitos, false);
    const cierre = calculateMetaScore(m, hitos, true);
    const diferencia = +(cierre - seguimiento).toFixed(1);
    if (Math.abs(diferencia) <= UMBRAL_AVISO) continue;

    const { motivo, queFalta } = explicar(m, hitos);
    metas.push({
      nombre: String(m.nombre || "meta"),
      seguimiento: +seguimiento.toFixed(1),
      cierre: +cierre.toFixed(1),
      diferencia,
      motivo,
      queFalta,
    });
  }

  if (!metas.length) return null;

  const seguimiento = calculateObjectiveProgress(objetivo, hitos, false);
  const cierre = calculateObjectiveProgress(objetivo, hitos, true);
  const peso = Number(objetivo.peso || 0);

  return {
    objetivoId: String(objetivo._id ?? ""),
    nombre: String(objetivo.nombre || ""),
    peso,
    seguimiento: +seguimiento.toFixed(1),
    cierre: +cierre.toFixed(1),
    diferencia: +(cierre - seguimiento).toFixed(1),
    // Cuántos puntos de la nota final (sobre 100) se juegan en este objetivo.
    // Es el número que importa: una meta que cae 100 puntos en un objetivo de
    // peso 5 mueve 3,5 de la nota, no 100.
    impactoEnLaNota: +(((cierre - seguimiento) * peso) / 100 * 0.7).toFixed(1),
    metas,
  };
}

/**
 * El panorama completo de una persona.
 *
 * @param objetivos  los del dashboard, con sus hitos
 */
export function riesgoDeCierre(objetivos: Objetivo[] = []) {
  const enRiesgo = objetivos
    .map((o) => riesgoDeObjetivo(o))
    .filter((r): r is RiesgoDeObjetivo => r !== null);

  const impactoTotal = +enRiesgo.reduce((s, r) => s + r.impactoEnLaNota, 0).toFixed(1);

  return {
    hayRiesgo: enRiesgo.length > 0,
    /** Cuántos puntos de la nota final cambian si se cierra hoy. */
    impactoTotal,
    objetivos: enRiesgo.sort((a, b) => a.impactoEnLaNota - b.impactoEnLaNota),
  };
}
