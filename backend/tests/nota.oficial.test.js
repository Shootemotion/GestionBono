// backend/tests/nota.oficial.test.js
//
// Cuál es la nota de una persona. Una sola respuesta, porque hasta ahora
// había cuatro y no coincidían: 11 personas veían un número en su pantalla y
// habrían cobrado sobre otro.
//
// Lo que más se cuida acá es que NO elija sola cuando no debe. Un sistema que
// resuelve por descarte "no hay cierre anual, uso el de Q2" convierte una
// decisión de RRHH en un detalle de implementación que nadie ve.

import {
  resolverNotaOficial,
  notaParaMostrar,
  etiquetaEstado,
  notaDelFeedback,
  ESTADO,
} from "../src/lib/notaOficial.js";

const fb = (periodo, global, over = {}) => ({
  _id: `fb-${periodo}`,
  periodo,
  estado: "CLOSED",
  scores: { obj: global * 0.7, comp: global * 0.3, global },
  ...over,
});

/* ================================================================== */
describe("el caso normal: hay cierre anual", () => {
  test("la nota es la del FINAL, no la del último trimestre", () => {
    const r = resolverNotaOficial([fb("Q1", 50), fb("Q2", 60), fb("Q3", 70), fb("FINAL", 85)]);
    expect(r.estado).toBe(ESTADO.PENDIENTE);
    expect(r.nota.global).toBe(85);
    expect(r.periodo).toBe("FINAL");
  });

  test("el orden en que vienen los feedbacks no importa", () => {
    const r = resolverNotaOficial([fb("FINAL", 85), fb("Q1", 50)]);
    expect(r.nota.global).toBe(85);
  });

  test("queda pendiente de confirmar, y se puede confirmar", () => {
    const r = resolverNotaOficial([fb("FINAL", 85)]);
    expect(r.confirmable).toBe(true);
  });

  test("los feedbacks que no están cerrados no cuentan", () => {
    const r = resolverNotaOficial([fb("FINAL", 85, { estado: "PENDING_HR" }), fb("Q3", 70)]);
    expect(r.periodo).toBe("Q3");
    expect(r.estado).toBe(ESTADO.SIN_CIERRE_ANUAL);
  });
});

/* ================================================================== */
describe("una vez confirmada, no se mueve más", () => {
  const confirmado = fb("FINAL", 85, {
    oficial: { confirmada: true, nota: { obj: 59.5, comp: 25.5, global: 85 } },
  });

  test("devuelve la nota congelada", () => {
    const r = resolverNotaOficial([confirmado]);
    expect(r.estado).toBe(ESTADO.CONFIRMADA);
    expect(r.nota.global).toBe(85);
  });

  // Es el punto de todo el mecanismo: el número que se pagó no puede cambiar
  // porque alguien editó algo después.
  test("si `scores` cambia después, la oficial sigue siendo la confirmada", () => {
    const tocado = {
      ...confirmado,
      scores: { obj: 40, comp: 20, global: 60 },
    };
    const r = resolverNotaOficial([tocado]);
    expect(r.nota.global).toBe(85);
  });

  test("ya confirmada no se vuelve a confirmar", () => {
    expect(resolverNotaOficial([confirmado]).confirmable).toBe(false);
  });

  test("una confirmada en un trimestre le gana a un FINAL sin confirmar", () => {
    // Si RRHH confirmó Q3 como la nota del año, esa es.
    const r = resolverNotaOficial([
      fb("Q3", 70, { oficial: { confirmada: true, nota: { obj: 49, comp: 21, global: 70 } } }),
      fb("FINAL", 85),
    ]);
    expect(r.nota.global).toBe(70);
    expect(r.periodo).toBe("Q3");
  });
});

/* ================================================================== */
// CASO REAL: 6 personas sin FINAL cerrado. A Cristian Lescano el bono le
// salía de Q2 (41,7) cuando su cálculo anual da 74,5.
describe("sin cierre anual: no se elige por descarte", () => {
  test("se marca como sin cierre anual y NO se puede confirmar", () => {
    const r = resolverNotaOficial([fb("Q1", 50), fb("Q2", 41.7)]);
    expect(r.estado).toBe(ESTADO.SIN_CIERRE_ANUAL);
    expect(r.confirmable).toBe(false);
  });

  test("dice qué período es y que es parcial", () => {
    const r = resolverNotaOficial([fb("Q2", 41.7)]);
    expect(r.periodo).toBe("Q2");
    expect(r.motivo).toMatch(/no tiene el feedback FINAL cerrado/i);
    expect(r.motivo).toMatch(/parcial de mitad de año/i);
  });

  test("igual devuelve la nota, para poder mostrar de qué se está hablando", () => {
    expect(resolverNotaOficial([fb("Q2", 41.7)]).nota.global).toBe(41.7);
  });

  test("toma el trimestre más avanzado de los cerrados", () => {
    const r = resolverNotaOficial([fb("Q1", 50), fb("Q3", 70), fb("Q2", 60)]);
    expect(r.periodo).toBe("Q3");
  });
});

/* ================================================================== */
// CASO REAL: dos feedbacks CERRADOS con 112 y 116,8 sobre una escala de 100.
describe("notas fuera de escala", () => {
  test("una nota de 112 no se puede confirmar", () => {
    const r = resolverNotaOficial([fb("FINAL", 112)]);
    expect(r.estado).toBe(ESTADO.NOTA_INVALIDA);
    expect(r.confirmable).toBe(false);
    expect(r.motivo).toMatch(/la escala llega a 100/i);
  });

  test("una negativa tampoco", () => {
    expect(resolverNotaOficial([fb("FINAL", -5)]).estado).toBe(ESTADO.NOTA_INVALIDA);
  });

  test("100 justo es válida", () => {
    expect(resolverNotaOficial([fb("FINAL", 100)]).estado).toBe(ESTADO.PENDIENTE);
  });

  test("se tolera el medio punto del redondeo de las dos partes", () => {
    expect(resolverNotaOficial([fb("FINAL", 100.4)]).estado).toBe(ESTADO.PENDIENTE);
    expect(resolverNotaOficial([fb("FINAL", 101)]).estado).toBe(ESTADO.NOTA_INVALIDA);
  });
});

/* ================================================================== */
describe("sin evaluar", () => {
  test("sin ningún feedback", () => {
    const r = resolverNotaOficial([]);
    expect(r.estado).toBe(ESTADO.SIN_EVALUAR);
    expect(r.nota).toBeNull();
  });

  test("con feedbacks pero ninguno cerrado", () => {
    expect(resolverNotaOficial([fb("FINAL", 85, { estado: "DRAFT" })]).estado).toBe(
      ESTADO.SIN_EVALUAR
    );
  });

  test("un feedback cerrado sin nota guardada no cuenta como evaluado", () => {
    expect(resolverNotaOficial([fb("FINAL", 85, { scores: {} })]).estado).toBe(ESTADO.SIN_EVALUAR);
  });
});

/* ================================================================== */
describe("la nota que usan las salidas", () => {
  test("devuelve null y no 0 cuando no hay nota", () => {
    // Un 0 se suma, se promedia y se paga. Un null se nota.
    expect(notaParaMostrar([])).toBeNull();
  });

  test("devuelve la confirmada cuando existe", () => {
    const r = notaParaMostrar([
      fb("FINAL", 85, { oficial: { confirmada: true, nota: { obj: 59.5, comp: 25.5, global: 85 } } }),
    ]);
    expect(r.global).toBe(85);
  });

  test("devuelve la del cierre anual aunque no esté confirmada todavía", () => {
    expect(notaParaMostrar([fb("FINAL", 85)]).global).toBe(85);
  });

  test("y la parcial cuando es lo único que hay, igual que hoy", () => {
    // Se decidió dejarlo como está: la pantalla lo marca, el número no cambia.
    expect(notaParaMostrar([fb("Q2", 41.7)]).global).toBe(41.7);
  });
});

/* ================================================================== */
describe("etiquetas", () => {
  test("cada estado tiene una etiqueta legible", () => {
    for (const e of Object.values(ESTADO)) {
      expect(etiquetaEstado(e)).not.toBe(e);
    }
  });
});

/* ================================================================== */
// La nota de UN feedback. Existe porque media docena de pantallas leían
// `fb.scores` a mano, y cuando RRHH confirma otro número ese campo conserva
// el viejo: a Tania Simunovich se le confirmó 79,9 y su pantalla seguía
// diciendo 63,6.
describe("la nota de un feedback", () => {
  const sinConfirmar = fb("FINAL", 63.6);
  const confirmado = fb("FINAL", 63.6, {
    oficial: {
      confirmada: true,
      origen: "vista_jefe",
      nota: { obj: 58.3, comp: 21.6, global: 79.9 },
    },
  });

  test("sin confirmar, devuelve la foto guardada", () => {
    const r = notaDelFeedback(sinConfirmar);
    expect(r.global).toBe(63.6);
    expect(r.confirmada).toBe(false);
  });

  test("confirmado, devuelve la confirmada y NO la foto", () => {
    const r = notaDelFeedback(confirmado);
    expect(r.global).toBe(79.9);
    expect(r.confirmada).toBe(true);
    expect(r.origen).toBe("vista_jefe");
  });

  // `scores` se conserva a propósito: es el registro de lo que el navegador
  // calculó ese día, y perderlo haría imposible revisar el caso después.
  test("la foto original sigue intacta en el documento", () => {
    expect(confirmado.scores.global).toBe(63.6);
  });

  test("sin nota de ningún tipo, devuelve null y no 0", () => {
    expect(notaDelFeedback(fb("FINAL", 63.6, { scores: {} }))).toBeNull();
    expect(notaDelFeedback(null)).toBeNull();
  });

  test("una confirmación sin nota adentro cae a la foto", () => {
    const raro = fb("FINAL", 63.6, { oficial: { confirmada: true } });
    expect(notaDelFeedback(raro).global).toBe(63.6);
  });

  test("un feedback no cerrado igual devuelve su nota si la tiene", () => {
    // Acá no se filtra por estado: eso lo decide quien llama.
    expect(notaDelFeedback(fb("Q1", 50, { estado: "SENT" })).global).toBe(50);
  });
});
