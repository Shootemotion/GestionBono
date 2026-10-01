// src/lib/ayudaMetas.js
//
// Texto de ayuda de los campos de una meta (el bloque "Cómo se mide" del
// formulario de objetivos). Vive acá para corregirse en un solo lugar, y
// coincide con docs/GUIA_USO.md §3.3. Si cambia la semántica del motor
// (backend/src/lib/scoringCore.js), hay que actualizar los dos.

/** Texto de ayuda por campo. `nota` marca lo que no es obvio del cálculo. */
export const AYUDA_CAMPOS_META = {
  nombre: {
    titulo: "Nombre de la meta",
    texto: "El indicador concreto que se va a medir. Ej.: «Ocupación global de consultorios» o «Llamadas no atendidas».",
  },
  pesoMeta: {
    titulo: "Peso de la meta",
    texto: "Cuánto vale esta meta dentro del objetivo. Si el objetivo tiene una sola meta, dejalo vacío. Con varias, los pesos deberían sumar 100.",
    nota: "Si lo dejás vacío en todas, el sistema reparte en partes iguales.",
  },
  unidad: {
    titulo: "Unidad de medida",
    texto: "Qué tipo de valor se va a cargar cada período. Porcentual (%) para cumplimientos, Numérico (#) para cantidades, Binaria para un sí/no.",
  },
  modoAcumulacion: {
    titulo: "Modo de seguimiento",
    texto: "«Por período» (también llamado de mantenimiento): cada carga se compara sola contra el valor esperado, porque hay que sostenerlo todo el año (ej.: cada mes llegar al 95%). «Acumulativo»: se suman todas las cargas del año y ese total se compara con el esperado (ej.: 12 cargas que deben sumar 600).",
    nota: "En acumulativo la Regla de Cierre no interviene: el cierre ya es «sumar y comparar».",
  },
  reglaCierre: {
    titulo: "Regla de cierre anual",
    texto: "Cómo se combinan los períodos al cerrar el año. «Promedio de hitos»: promedia los valores cargados y evalúa una vez. «Umbral de períodos»: alcanza con cumplir en N períodos. «Último valor»: solo cuenta la última carga.",
    nota: "Solo aplica si el modo de seguimiento es «Por período».",
  },
  umbralPeriodos: {
    titulo: "Umbral de períodos",
    texto: "Cuántos períodos hay que cumplir para dar la meta por cumplida. Ej.: 3 sobre 12 meses.",
  },
  operador: {
    titulo: "Operador",
    texto: "La dirección del umbral. «≥» para metas que hay que superar (ocupación, satisfacción); «≤» para las que hay que mantener bajas (reclamos, demoras).",
  },
  esperado: {
    titulo: "Valor esperado",
    texto: "El número que define el cumplimiento. Junto al operador se lee como una condición: «≥ 80» significa que 80 o más cumple.",
  },
  tolerancia: {
    titulo: "Tolerancia",
    texto: "Margen para dar el hito por cumplido aunque no llegue exacto al valor esperado.",
    nota: "Marca el hito como cumplido pero no otorga el 100%: con «Reconoce esfuerzo» activo el puntaje sigue proporcional (esperado 100, tolerancia 5, valor 96 → cumple, pero puntúa 96%).",
  },
  reconoceEsfuerzo: {
    titulo: "Reconoce esfuerzo",
    texto: "Activado, da puntaje proporcional a lo alcanzado. Desactivado, es todo o nada: cumple 100 o no cumple 0.",
    nota: "Solo actúa en el cierre anual. Durante el año el seguimiento siempre muestra el avance proporcional, así que una meta al 50% con la opción desactivada se ve 50% todo el año y cierra en 0.",
  },
  permiteOver: {
    titulo: "Permite superar el 100%",
    texto: "Deja que una meta muy superada puntúe por encima de 100 (hasta 120%), en vez de quedar topeada.",
  },
};
