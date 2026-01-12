// src/hooks/usePlantillas.js
import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function usePlantillas({ year, scopeType, scopeId, tipoFiltro }) {
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {

    setLoading(true);
    try {

      const buildQS = (extra = {}) => {
        const p = new URLSearchParams();
        p.set("year", String(year));
        if (scopeType) p.set("scopeType", scopeType);
        if (scopeId) p.set("scopeId", scopeId);
        if (tipoFiltro) p.set("tipoFiltro", tipoFiltro);
        Object.entries(extra).forEach(([k, v]) => v != null && v !== "" && p.set(k, String(v)));
        return p.toString();
      };

      // Estrategia: si hay alcance => 1 intento; sin alcance => intentos alternativos
      const attempts = [];
      if (scopeType || scopeId) {
        attempts.push(buildQS());
      } else {
        attempts.push(buildQS());                              // solo year
        attempts.push(buildQS({ all: "true" }));               // flag all
        attempts.push(buildQS({ scopeType: "all" }));          // alcance all
      }

      let finalArr = null;
      for (const qs of attempts) {
        console.debug("[usePlantillas] TRY -> /templates?", qs);
        try {
          const resp = await api(`/templates?${qs}`);
          const arr =
            Array.isArray(resp) ? resp :
              Array.isArray(resp?.items) ? resp.items :
                Array.isArray(resp?.data) ? resp.data :
                  Array.isArray(resp?.results) ? resp.results :
                    Array.isArray(resp?.rows) ? resp.rows :
                      Array.isArray(resp?.templates) ? resp.templates : [];
          console.debug("[usePlantillas] RESULT len =", arr.length, "for qs:", qs);
          if (arr.length || (attempts.length === 1)) { finalArr = arr; break; }
          // si vació, sigo probando siguientes variantes
        } catch (err) {
          console.warn("[usePlantillas] intento fallido:", err?.status || err);
          // sigo con el siguiente intento
        }
      }
      setPlantillas(finalArr || []);




    } catch (e) {
      console.error(e);
      toast.error("No se pudieron cargar plantillas");
    } finally {
      setLoading(false);
    }
  }, [year, scopeType, scopeId, tipoFiltro]);

  useEffect(() => { load(); }, [load]);

  const addLocal = (tpl) => setPlantillas(prev => [tpl, ...prev]);
  const updateLocal = (tpl) => setPlantillas(prev => prev.map(p => p._id === tpl._id ? tpl : p));
  const removeLocal = (id) => setPlantillas(prev => prev.filter(p => p._id !== id));

  return {
    plantillas,
    loading,
    reload: load,
    setPlantillas,
    addLocal,
    updateLocal,
    removeLocal,
  };
}
