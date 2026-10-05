// src/components/objetivos/AvisosValidacion.jsx
//
// Muestra lo que el backend responde sobre la configuración de un objetivo.
//
// Deliberadamente no sabe NADA de las reglas: no decide qué es un error, ni
// cuándo, ni qué decir. Le pregunta a /templates/validar y pinta la respuesta.
//
// Esa es toda la gracia. La alternativa —que el formulario traiga su propia
// copia de las reglas para avisar sin ir al servidor— es exactamente lo que
// venía pasando con el cálculo: tres implementaciones que se separaban de a
// poco, y nadie se enteraba hasta que dos pantallas mostraban cosas distintas.
// Acá, si mañana cambia una regla, cambia en un archivo del backend y esta
// pantalla ya la está mostrando.

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { AlertTriangle, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

/** Espera a que el usuario deje de tipear antes de preguntar. */
const DEMORA_MS = 600;

export function useValidacionObjetivo(payload, { habilitado = true, id = null } = {}) {
  const [estado, setEstado] = useState({ cargando: false, datos: null });
  const ultimoPedido = useRef(0);

  // El payload cambia de identidad en cada tecla; lo que importa es si cambió
  // su contenido. Serializar es más barato que volver a pedirle al servidor.
  const huella = JSON.stringify(payload ?? null);

  useEffect(() => {
    if (!habilitado || !payload) {
      setEstado({ cargando: false, datos: null });
      return;
    }

    const timer = setTimeout(async () => {
      const pedido = ++ultimoPedido.current;
      setEstado((e) => ({ ...e, cargando: true }));
      try {
        const datos = await api("/templates/validar", {
          method: "POST",
          body: id ? { ...payload, _id: id } : payload,
        });
        // Si mientras tanto salió otro pedido, esta respuesta ya es vieja.
        if (pedido === ultimoPedido.current) setEstado({ cargando: false, datos });
      } catch {
        // La validación en vivo es una ayuda, no un portero: si el servidor no
        // contesta, el formulario sigue funcionando y el guardado valida igual.
        if (pedido === ultimoPedido.current) setEstado({ cargando: false, datos: null });
      }
    }, DEMORA_MS);

    return () => clearTimeout(timer);
  }, [huella, habilitado, id]); // eslint-disable-line react-hooks/exhaustive-deps

  return estado;
}

function Hallazgo({ item, tono }) {
  const estilos =
    tono === "error"
      ? { caja: "border-red-200 bg-red-50", icono: "text-red-600", titulo: "text-red-900", cuerpo: "text-red-700" }
      : { caja: "border-amber-200 bg-amber-50", icono: "text-amber-600", titulo: "text-amber-900", cuerpo: "text-amber-700" };

  const Icono = tono === "error" ? AlertCircle : AlertTriangle;

  return (
    <div className={`flex gap-2.5 rounded-md border p-2.5 ${estilos.caja}`}>
      <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${estilos.icono}`} />
      <div className="min-w-0 space-y-1">
        <p className={`text-sm font-medium leading-snug ${estilos.titulo}`}>{item.mensaje}</p>
        {item.efecto && <p className={`text-xs leading-relaxed ${estilos.cuerpo}`}>{item.efecto}</p>}
      </div>
    </div>
  );
}

/**
 * Panel de avisos. Se monta en el formulario y se actualiza solo.
 *
 * @param {Object}  payload     el objetivo tal como quedaría al guardar
 * @param {Boolean} habilitado  false mientras faltan campos obligatorios
 * @param {String}  id          id del objetivo, si se está editando uno
 */
export default function AvisosValidacion({ payload, habilitado = true, id = null }) {
  const { cargando, datos } = useValidacionObjetivo(payload, { habilitado, id });

  if (!datos) {
    return cargando ? (
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Revisando la configuración…
      </p>
    ) : null;
  }

  const { errores = [], advertencias = [], periodos, estricto } = datos;

  if (!errores.length && !advertencias.length) {
    return (
      <p className="flex items-center gap-2 text-xs text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        La configuración es consistente{periodos ? ` · ${periodos} períodos de carga` : ""}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {errores.map((e, i) => (
        <Hallazgo key={`e${i}`} item={e} tono="error" />
      ))}
      {advertencias.map((a, i) => (
        <Hallazgo key={`a${i}`} item={a} tono="aviso" />
      ))}

      {errores.length > 0 && (
        <p className="text-xs text-red-600">
          {errores.length === 1 ? "Este problema impide" : "Estos problemas impiden"} guardar el objetivo.
        </p>
      )}
      {!estricto && (
        // En años ya cerrados nada bloquea: esos objetivos se usaron para
        // calcular notas que ya se comunicaron y hay que poder seguir editándolos.
        <p className="text-xs text-slate-500">
          Es un año fiscal anterior, así que se puede guardar igual. Los avisos quedan a la vista.
        </p>
      )}
    </div>
  );
}
