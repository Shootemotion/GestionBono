// backend/src/lib/tipos.ts
//
// Los tipos del dominio: qué es una meta, un hito, una nota.
//
// Hasta ahora estas formas vivían en la cabeza de quien escribía cada función
// y en los comentarios. Escribirlas no cambia el comportamiento —Node borra
// los tipos al ejecutar— pero deja que el editor marque cuando alguien lee un
// campo que no existe, que fue la causa de varios de los números distintos
// que aparecieron este año: `oficial.nota` contra `scores`, `notaComunicada`
// llegando vacío, un tercer argumento que la función ignoraba.
//
// Por qué sin `enum`: Node ejecuta TypeScript borrando los tipos, y un enum
// no es un tipo —genera código— así que no se puede borrar. Los literales
// unidos (`"a" | "b"`) dan lo mismo y desaparecen solos.

/* ------------------------------------------------------------------ *
 * Configuración de una meta
 * ------------------------------------------------------------------ */

/** Cómo se compara el resultado contra lo esperado. */
export type Operador = ">=" | ">" | "<=" | "<" | "==" | "!=" | "=" | "===";

/**
 * Qué clase de valor se carga.
 * "Cumple/No Cumple" es binaria: cada período vale 100 o 0, sin proporción.
 */
export type Unidad = "Cumple/No Cumple" | "Porcentual" | "Numerico";

/**
 * Cómo se agregan los períodos al cerrar el año.
 *
 * `umbral_Periodos` y `ultimo_valor` son variantes históricas que quedaron en
 * datos viejos. Están en el tipo porque el motor las acepta; si se las saca
 * de acá hay que migrar esos documentos primero.
 */
export type ReglaCierre =
  | "promedio"
  | "umbral_periodos"
  | "cierre_unico"
  | "umbral_Periodos"
  | "ultimo_valor";

export type ModoAcumulacion = "periodo" | "acumulativo";

/** La definición de una meta, como la configura el jefe. */
export interface Meta {
  _id?: unknown;
  metaId?: unknown;
  nombre?: string;
  unidad?: Unidad | string;
  operador?: Operador | string;
  /** Valor objetivo. `target` es el nombre viejo del mismo dato. */
  esperado?: number | string | null;
  target?: number | string | null;
  /** Peso de la meta dentro del objetivo. Sin esto, se reparte en partes iguales. */
  pesoMeta?: number | null;
  /** Margen con el que un valor cercano cuenta como cumplido. */
  tolerancia?: number | null;
  /** true = puntúa la proporción alcanzada. false = todo o nada. */
  reconoceEsfuerzo?: boolean;
  /** Permite superar el 100% hasta `maxOver`. */
  permiteOver?: boolean;
  maxOver?: number | null;
  reglaCierre?: ReglaCierre | string;
  umbralPeriodos?: number | null;
  acumulativa?: boolean;
  modoAcumulacion?: ModoAcumulacion | string;
}

/* ------------------------------------------------------------------ *
 * Lo que se carga
 * ------------------------------------------------------------------ */

/** El valor cargado para una meta en un período. */
export interface ResultadoDeMeta {
  metaId?: unknown;
  _id?: unknown;
  nombre?: string;
  resultado?: number | string | boolean | null;
}

/** Un período con sus resultados. */
export interface Hito {
  periodo?: string;
  /** Resumen del hito. Solo lo usa el cálculo viejo, el de objetivos sin metas. */
  actual?: number | null;
  metas?: ResultadoDeMeta[];
}

/** Un objetivo con su configuración y lo que se le cargó. */
export interface Objetivo {
  _id?: unknown;
  nombre?: string;
  peso?: number;
  pesoBase?: number;
  frecuencia?: string;
  metas?: Meta[];
  hitos?: Hito[];
}

/** Una competencia. Se promedian sus valores, sin reglas de cierre. */
export interface Aptitud {
  peso?: number | string;
  hitos?: Hito[];
}

/* ------------------------------------------------------------------ *
 * El modo de cálculo
 * ------------------------------------------------------------------ */

/**
 * SEGUIMIENTO vs CIERRE: la distinción que más confusión causó este año.
 *
 * Durante el año la pantalla muestra avance sobre lo que ya pasó, y la
 * configuración "todo o nada" del jefe NO se aplica: cumplir 1 de 12 períodos
 * da 8,3% y eso acompaña el ciclo en vez de juzgarlo.
 *
 * Al CERRAR sí se aplica. Una meta que exige los 12 períodos y tiene 11 pasa
 * de 91,7% a 0. Le pasó a Guido Barretto: vio 88,9 todo el año y su feedback
 * final dijo 76,1.
 *
 * Hoy esto viaja como un booleano llamado `isFinalYearClosure`. El tipo no lo
 * cambia —hacerlo obligaría a tocar los siete lugares que lo llaman— pero le
 * pone nombre a lo que significa.
 *
 * Medido sobre el AF2025: a 16 de 76 personas la nota les cambia entre un
 * modo y el otro, todas hacia abajo, hasta 23 puntos. En el AF2026 hay 40
 * metas configuradas así, esperando a que carguen datos.
 */
export type ModoDeCalculo = "seguimiento" | "cierre";

/** `true` = cierre anual (regla estricta). `false` = seguimiento. */
export type EsCierreAnual = boolean;

/* ------------------------------------------------------------------ *
 * El resultado
 * ------------------------------------------------------------------ */

/**
 * Una nota, en sus tres partes.
 *
 * `obj` llega hasta 70 y `comp` hasta 30: son aportes al global, no puntajes
 * sobre 100. Confundir las dos escalas es de dónde salieron varios de los
 * números que no cerraban.
 */
export interface Nota {
  /** Aporte de los objetivos. Máximo 70. */
  obj: number;
  /** Aporte de las competencias. Máximo 30. */
  comp: number;
  /** La suma de los dos. Máximo 100. */
  global: number;
}

/** Configuración con la que se puntúa un período. */
export interface ConfigDeCalculo {
  operador?: Operador | string;
  tolerancia?: number | null;
  permiteOver?: boolean;
  reconoceEsfuerzo?: boolean;
  maxOver?: number | null;
}
