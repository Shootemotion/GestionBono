import React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, RefreshCw, Calculator, BarChart3, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ReferenceRulesDialog() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-blue-600">
                    <HelpCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Guía de Reglas</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl text-blue-700">
                        <Calculator className="w-6 h-6" />
                        Guía de Lógica de Evaluación
                    </DialogTitle>
                    <DialogDescription>
                        Referencia rápida sobre cómo aplican las reglas de negocio al cálculo de bonos.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-8 py-4">

                    {/* SECCION 1: REGLAS DE CIERRE */}
                    <section className="space-y-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                            <BarChart3 className="w-5 h-5 text-indigo-500" />
                            Reglas de Cierre Anual
                        </h3>
                        <p className="text-sm text-slate-600 mb-4">
                            Determina cómo se calcula el puntaje final del objetivo al terminar el año, basándose en los resultados parciales de cada periodo.
                        </p>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-700">Promedio</Badge>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    <strong>El estándar.</strong> Promedia el porcentaje de cumplimiento de todos los periodos evaluados.
                                    <br /><em className="text-slate-400">Ej: Q1(100%) + Q2(50%) = Final 75%</em>
                                </p>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-700">Cierre Único vs Último Valor</Badge>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    <strong>Sólo importa el final.</strong> El sistema ignora los periodos anteriores y toma únicamente el resultado del último periodo evaluado como el 100% de la nota.
                                    <br /><em className="text-slate-400">Útil para proyectos acumulativos donde el 'status final' es lo que cuenta.</em>
                                </p>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 col-span-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-700">Umbral de Periodos</Badge>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    <strong>Exige constancia.</strong> Requiere que se cumpla la meta en una cantidad mínima de periodos (N) para pagar el bono.
                                    <br />
                                    <ul className="list-disc pl-4 mt-1 space-y-1">
                                        <li>Si cumple >= N periodos: Cobra el Promedio Real.</li>
                                        <li>Si cumple &lt; N periodos: Cobra 0%.</li>
                                    </ul>
                                    <em className="text-slate-400 block mt-1">Ej: 'Umbral 3 meses'. Si cumpliste solo 2 meses, tu bono es 0.</em>
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* SECCION 2: ACUMULACION */}
                    <section className="space-y-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                            <RefreshCw className="w-5 h-5 text-emerald-500" />
                            Acumulación
                        </h3>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="bg-white border-slate-200 text-slate-700">Por Periodo (Default)</Badge>
                                </div>
                                <p className="text-xs text-slate-600">
                                    Cada periodo es independiente. El target se resetea.
                                    <br /><em>Ej: Ventas Mensuales. En Febrero empiezas de 0.</em>
                                </p>
                            </div>

                            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-200">Acumulativo</Badge>
                                </div>
                                <p className="text-xs text-slate-700 leading-relaxed">
                                    El sistema <strong>suma automáticamente</strong> los valores de los periodos anteriores al actual.
                                    <br />
                                    El Target suele ser anual o creciente.
                                    <br />
                                    <strong className="text-emerald-800">¿Qué ingresa el usuario?</strong> Solo lo generado EN ESE periodo. El sistema hace la suma visualmente.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* SECCION 3: EXTRAS */}
                    <section className="space-y-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                            <AlertCircle className="w-5 h-5 text-amber-500" />
                            Condiciones Especiales
                        </h3>

                        <div className="space-y-3">
                            <div className="flex items-start gap-4 p-3 rounded-md bg-amber-50 border border-amber-100">
                                <Badge variant="outline" className="mt-0.5 bg-white text-amber-700 border-amber-200 whitespace-nowrap">Reconoce Esfuerzo</Badge>
                                <div className="text-xs text-slate-700">
                                    <p className="font-bold mb-1">Pago mínimo parcial</p>
                                    Si no llega al 100% de la meta, pero supera un mínimo (usualmente 70-80%), paga proporcional.
                                    <br />
                                    <em>Sin esto activo, es "Todo o Nada" (0% o 100%).</em>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 p-3 rounded-md bg-blue-50 border border-blue-100">
                                <Badge variant="outline" className="mt-0.5 bg-white text-blue-700 border-blue-200 whitespace-nowrap">Permite Over</Badge>
                                <div className="text-xs text-slate-700">
                                    <p className="font-bold mb-1">Superar el 100%</p>
                                    Permite que el resultado supere el 100% (ej. 120%), aumentando el bono global.
                                    <br />
                                    <em>Sin esto, el tope máximo siempre es 100%, aunque hayas vendido el doble.</em>
                                </div>
                            </div>
                        </div>
                    </section>

                </div>
            </DialogContent>
        </Dialog>
    );
}
