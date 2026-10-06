// src/pages/EstadoContratos.jsx
//
// El estado de los contratos del sistema, dentro de la app.
//
// La misma información que `npm run contratos`, en el lugar donde se trabaja.
// La pantalla no evalúa nada: el backend corre el catálogo y acá se muestra.
//
// Lo que esta pantalla tiene que dejar claro, y por eso el diseño insiste:
// un contrato que el backend IMPIDE y uno que solo se revisa después no son
// lo mismo. Mostrarlos iguales haría creer que todo está igual de protegido.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, ShieldAlert, Eye, AlertTriangle, CheckCircle2,
  Loader2, ChevronDown, ChevronRight, HelpCircle, RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";
import { getCurrentFiscalYear } from "@/lib/fiscalYear";

/* Las tres capas. La diferencia entre ellas es el dato más importante de
   la pantalla: solo la primera garantiza algo. */
const CAPA = {
  guard: {
    Icono: ShieldCheck,
    etiqueta: "El backend lo impide",
    ayuda: "Si alguien intenta hacerlo, lo rechaza y no se guarda.",
    chip: "bg-emerald-100 text-emerald-700",
  },
  validacion: {
    Icono: ShieldAlert,
    etiqueta: "Se avisa, se puede guardar",
    ayuda: "Se muestra la advertencia, pero la decisión queda en quien carga.",
    chip: "bg-amber-100 text-amber-700",
  },
  revision: {
    Icono: Eye,
    etiqueta: "Solo se revisa acá",
    ayuda: "Todavía no se puede impedir sin romper datos que ya existen. Es una deuda declarada.",
    chip: "bg-slate-200 text-slate-600",
  },
};

const GRUPOS = {
  OBJ: "Definición de objetivos",
  EVA: "Carga de resultados",
  NOTA: "La nota",
  TRZ: "Trazabilidad",
  ACC: "Acceso",
};

function Contrato({ c }) {
  const [abierto, setAbierto] = useState(c.estado === "incumplido" && c.severidad === "critico");
  const capa = CAPA[c.capa] || CAPA.revision;
  const { Icono } = capa;

  const roto = c.estado === "incumplido";
  const critico = roto && c.severidad === "critico";
  const noVerificable = c.estado === "no_verificable";

  const borde = critico ? "border-rose-300 bg-rose-50/40"
    : roto ? "border-amber-300 bg-amber-50/40"
    : noVerificable ? "border-slate-300 bg-slate-50"
    : "border-slate-200 bg-white";

  return (
    <div className={`rounded-xl border ${borde} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/60"
      >
        {abierto ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        )}

        <span className="shrink-0 mt-0.5">
          {noVerificable ? <HelpCircle className="w-4 h-4 text-slate-400" />
            : roto ? <AlertTriangle className={`w-4 h-4 ${critico ? "text-rose-600" : "text-amber-600"}`} />
            : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold text-slate-400">{c.id}</span>
            <span className="font-semibold text-slate-800 text-sm">{c.titulo}</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{c.promesa}</p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {roto && (
            <span className={`text-[11px] font-bold ${critico ? "text-rose-700" : "text-amber-700"}`}>
              {c.cantidad} caso{c.cantidad === 1 ? "" : "s"}
            </span>
          )}
          <span
            className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${capa.chip}`}
            title={capa.ayuda}
          >
            <Icono className="w-3 h-3" />
            {capa.etiqueta}
          </span>
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
          {/* El porqué va primero: sin el caso real que lo motivó, un contrato
              se discute en la primera reunión en que moleste. */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
              Por qué existe
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{c.porque}</p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
              Cómo se sostiene
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{c.seImpone}</p>
            <p className="text-[11px] text-slate-400 mt-1">{capa.ayuda}</p>
            {c.verificadoPor && (
              <p className="text-[11px] text-slate-400 font-mono mt-1">{c.verificadoPor}</p>
            )}
          </div>

          {noVerificable && (
            <div className="text-xs bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-slate-600">
              No se pudo verificar: {c.error}
            </div>
          )}

          {roto && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">
                Lo que no lo cumple ({c.cantidad})
              </div>
              <ul className="space-y-1">
                {c.violaciones.map((v, i) => (
                  <li key={i} className="text-[11px] leading-snug flex gap-1.5">
                    <span className="text-slate-300 shrink-0">·</span>
                    <span>
                      <strong className="text-slate-700">{v.que}</strong>
                      {v.detalle && <span className="text-slate-500"> — {v.detalle}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EstadoContratos() {
  const [year, setYear] = useState(getCurrentFiscalYear());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = async (anio = year) => {
    setCargando(true);
    try {
      setDatos(await api(`/contratos?year=${anio}`));
    } catch (e) {
      toast.error(`No se pudo verificar: ${e?.message || "error"}`);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar(year);
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const porGrupo = useMemo(() => {
    if (!datos?.contratos) return [];
    return Object.entries(GRUPOS)
      .map(([prefijo, titulo]) => ({
        titulo,
        contratos: datos.contratos.filter((c) => c.id.startsWith(prefijo)),
      }))
      .filter((g) => g.contratos.length);
  }, [datos]);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-indigo-600" /> Contratos del Sistema
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Reglas que el sistema promete no romper. Cada una nació de algo que pasó, dice dónde se
              hace cumplir, y se verifica contra los datos reales. Esta pantalla no evalúa nada: el
              backend corre el catálogo y acá se muestra el resultado.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => cargar()}
              disabled={cargando}
              className="text-xs font-semibold text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cargando ? "animate-spin" : ""}`} /> Verificar
            </button>
            <div className="flex items-center bg-white rounded-2xl px-3 py-2 border border-slate-200 shadow-sm">
              <SelectorAnioFiscal value={year} onChange={setYear} variant="stepper" size="md" showCaption />
            </div>
          </div>
        </div>

        {cargando && !datos ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 p-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Verificando los contratos contra los datos…
          </div>
        ) : !datos ? null : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                <div className="text-[9px] uppercase tracking-wider text-emerald-500 font-bold">Se cumplen</div>
                <div className="text-2xl font-black text-emerald-700">{datos.cumplidos}</div>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-center">
                <div className="text-[9px] uppercase tracking-wider text-rose-500 font-bold">No se cumplen</div>
                <div className="text-2xl font-black text-rose-700">{datos.incumplidos}</div>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-3 text-center">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Críticos rotos</div>
                <div className={`text-2xl font-black ${datos.criticosRotos ? "text-rose-700" : "text-slate-700"}`}>
                  {datos.criticosRotos}
                </div>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-3 text-center">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Total</div>
                <div className="text-2xl font-black text-slate-700">{datos.total}</div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mb-5">
              Verificado sobre {datos.universo.personas} personas · {datos.universo.objetivos} objetivos ·{" "}
              {datos.universo.resultados} resultados cargados · {datos.universo.feedbacks} feedbacks.
            </p>

            {/* Qué significa cada sello. Sin esto, "se cumple" se lee igual en
                los tres casos y la pantalla da una seguridad que no corresponde. */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
                Cómo se sostiene cada contrato
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(CAPA).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2">
                    <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${v.chip}`}>
                      <v.Icono className="w-3 h-3" /> {v.etiqueta}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Solo el primero garantiza algo: el backend rechaza el pedido y no escribe. Los otros
                dos dependen de que alguien mire.
              </p>
            </div>

            <div className="space-y-5">
              {porGrupo.map((g) => (
                <div key={g.titulo}>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {g.titulo}
                  </h2>
                  <div className="space-y-2">
                    {g.contratos.map((c) => (
                      <Contrato key={c.id} c={c} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
