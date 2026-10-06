// src/pages/Sistemas/Integridad.jsx
//
// Agrupa las herramientas que responden una sola pregunta: ¿el sistema y sus
// datos están sanos?
//
// Estaban sueltas como pestañas de primer nivel —Registro de Cambios,
// Comparar Backup, Objetivos sin Datos, Auditoría Scores— y entre todas
// llevaban la barra a 9 solapas que ya no entraban en una línea. Juntarlas
// bajo una deja la barra en 6 y, sobre todo, las presenta como lo que son:
// cinco vistas del mismo tema, no cinco funciones sin relación.
//
// "Integridad" y no "Desarrollo" a propósito: esto lo usa RRHH y dirección
// tanto como sistemas, y nadie entra a una sección llamada "Desarrollo" si no
// se considera desarrollador.

import { useState } from "react";
import { ShieldCheck, History, GitCompare, Ghost, AlertTriangle } from "lucide-react";

import EstadoContratos from "@/pages/EstadoContratos";
import RegistroCambios from "./RegistroCambios";
import CompararBackup from "./CompararBackup";
import ObjetivosSinDatos from "./ObjetivosSinDatos";

/**
 * @param {Object} props
 * @param {React.ReactNode} props.auditoriaScores  el panel vive en Sistemas.jsx
 *   y se pasa como prop en vez de importarlo: moverlo a su propio archivo es
 *   otro cambio, y mezclarlo con este haría más difícil revisar cualquiera.
 */
export default function Integridad({ auditoriaScores = null }) {
  const [vista, setVista] = useState("contratos");

  const VISTAS = [
    {
      id: "contratos",
      label: "Contratos",
      icon: <ShieldCheck className="w-4 h-4" />,
      descripcion: "Las reglas que el sistema promete no romper, y cuáles se cumplen hoy.",
      contenido: <EstadoContratos />,
    },
    {
      id: "cambios",
      label: "Registro de Cambios",
      icon: <History className="w-4 h-4" />,
      descripcion: "Quién tocó qué y cuándo, con el documento anterior al cambio.",
      contenido: <RegistroCambios />,
    },
    {
      id: "comparar",
      label: "Comparar Backup",
      icon: <GitCompare className="w-4 h-4" />,
      descripcion: "Diferencias entre un backup y la base actual, campo por campo.",
      contenido: <CompararBackup />,
    },
    {
      id: "sindatos",
      label: "Objetivos sin Datos",
      icon: <Ghost className="w-4 h-4" />,
      descripcion: "Objetivos que le aparecen a la gente y nunca se evaluaron.",
      contenido: <ObjetivosSinDatos />,
    },
    ...(auditoriaScores
      ? [
          {
            id: "audit",
            label: "Auditoría de Notas",
            icon: <AlertTriangle className="w-4 h-4" />,
            descripcion: "Diferencias entre la nota guardada y la que da el motor.",
            contenido: auditoriaScores,
          },
        ]
      : []),
  ];

  const actual = VISTAS.find((v) => v.id === vista) || VISTAS[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVista(v.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all border ${
              vista === v.id
                ? "bg-white border-blue-200 text-blue-700 shadow-sm"
                : "bg-transparent border-transparent text-slate-500 hover:bg-white/60 hover:text-slate-700"
            }`}
          >
            {v.icon}
            {v.label}
          </button>
        ))}
      </div>

      {/* Qué hace la vista elegida. Son cinco herramientas parecidas y sin esto
          hay que entrar a cada una para acordarse de cuál era cuál. */}
      <p className="text-xs text-slate-500 -mt-2">{actual.descripcion}</p>

      <div key={actual.id}>{actual.contenido}</div>
    </div>
  );
}
