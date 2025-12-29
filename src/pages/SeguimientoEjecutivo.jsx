// --- Modal Component for Employee List ---
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import {
  ChevronDown,
  ChevronUp,
  Users,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Building2,
  User,
  MoreHorizontal
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";

// Helpers
const nf = new Intl.NumberFormat("es-AR");
const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(n || 0);

// Global Colors
const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

export default function SeguimientoEjecutivo() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Expanded Areas State
  const [expanded, setExpanded] = useState({});
  const [chartMode, setChartMode] = useState('sector');

  // Modal State
  const [selectedAreaForTable, setSelectedAreaForTable] = useState(null);

  const toggleArea = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    loadData();
  }, [anio]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api(`/dashboard/ejecutivo?anio=${anio}`);
      setData(res);
    } catch (e) {
      console.error(e);
      toast.error("Error cargando tablero ejecutivo");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center">No hay datos disponibles.</div>;

  const { metrics, charts, areas } = data;

  // Pie Data for Feedback Status
  const pieData = [
    { name: "Cerrados", value: metrics.approvedPct },
    { name: "Pendientes", value: 100 - metrics.approvedPct }
  ];
  // Better Pie Data: Evaluated vs Pending
  const evalPie = [
    { name: "Evaluados", value: metrics.evaluatedPct },
    { name: "Pendientes", value: 100 - metrics.evaluatedPct }
  ];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="space-y-8 pb-20 pt-8 max-w-[80%] mx-auto">
        {/* HEADER IMPONENTE */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-2xl text-white p-8 md:p-10">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-200 to-white">
                Tablero Ejecutivo
              </h1>
              <p className="text-slate-400 mt-2 text-base md:text-lg max-w-2xl font-light">
                Visión macro de desempeño, cumplimiento y presupuesto proyectado.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-white/10 rounded-2xl p-1.5 backdrop-blur-md shadow-inner border border-white/5">
              <button
                onClick={() => setAnio(anio - 1)}
                className="p-3 hover:bg-white/10 rounded-xl transition-colors text-slate-300 hover:text-white"
              >
                <ChevronDown className="rotate-90 w-5 h-5" />
              </button>
              <span className="text-2xl font-bold font-mono px-4 text-white tracking-widest">{anio}</span>
              <button
                onClick={() => setAnio(anio + 1)}
                className="p-3 hover:bg-white/10 rounded-xl transition-colors text-slate-300 hover:text-white"
              >
                <ChevronDown className="-rotate-90 w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Background blobs */}
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-purple-600/20 rounded-full blur-[80px]"></div>
        </div>

        {/* METRICAS GLOBALES */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <MetricCard
            icon={<Users className="text-blue-500 w-6 h-6" />}
            label="Total Colaboradores"
            value={metrics.headcount}
            sub={`${data.areas?.length || 0} Áreas`}
            color="border-l-4 border-blue-500 shadow-md hover:shadow-lg transition-shadow"
          />
          <MetricCard
            icon={<AlertCircle className="text-amber-500 w-6 h-6" />}
            label="Feedbacks Pendientes"
            value={metrics.headcount - Math.round((metrics.headcount * metrics.evaluatedPct) / 100)}
            sub={`${100 - metrics.evaluatedPct}% del total`}
            color="border-l-4 border-amber-500 shadow-md hover:shadow-lg transition-shadow"
          />
          {/* New Metrics for Agreement */}
          <MetricCard
            icon={<CheckCircle2 className="text-emerald-500 w-6 h-6" />}
            label="En Acuerdo"
            value={metrics.agreementCount || 0}
            sub="Feedbacks firmados/ack"
            color="border-l-4 border-emerald-500 shadow-md hover:shadow-lg transition-shadow"
          />
          <MetricCard
            icon={<AlertCircle className="text-rose-500 w-6 h-6" />}
            label="En Desacuerdo"
            value={metrics.disagreementCount || 0}
            sub="Feedbacks cuestionados"
            color="border-l-4 border-rose-500 shadow-md hover:shadow-lg transition-shadow"
          />
          <MetricCard
            icon={<DollarSign className="text-purple-500 w-6 h-6" />}
            label="Bono Proyectado"
            value={money(metrics.totalBudgetEstimated)}
            sub="Total a pagar estimado"
            color="border-l-4 border-purple-500 shadow-md hover:shadow-lg transition-shadow"
          />
        </div>

        {/* GRAFICOS MACRO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Distribución Presupuesto (Bar Chart) */}
          <div className="lg:col-span-2 bg-white rounded-3xl shadow-lg border border-slate-100 p-8 flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <DollarSign className="w-6 h-6 text-purple-600" />
                </div>
                Distribución de Presupuesto
              </h3>

              {/* Toggle Buttons */}
              <div className="bg-slate-100 p-1 rounded-lg flex gap-1 self-start md:self-auto">
                <button
                  onClick={() => setChartMode('sector')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${chartMode === 'sector' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Por Sector
                </button>
                <button
                  onClick={() => setChartMode('area')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${chartMode === 'area' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Por Área
                </button>
              </div>
            </div>

            <div className="w-full overflow-hidden flex-1 min-h-[400px]" style={{ height: Math.max(400, (chartMode === 'sector' ? charts.budgetBySector.length : areas.length) * 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartMode === 'sector'
                    ? charts.budgetBySector
                    : areas.map(a => ({ name: a.nombre, value: a.totalBudget || 0 })).sort((a, b) => b.value - a.value)
                  }
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} interval={0} />
                  <Tooltip
                    formatter={(val) => money(val)}
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={24}>
                    {(chartMode === 'sector' ? charts.budgetBySector : areas).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Estado de Evaluaciones (Pie Chart) */}
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -mr-10 -mt-10"></div>

            <h3 className="text-xl font-bold text-slate-800 mb-6 w-full flex items-center gap-3 relative z-10">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              Progreso Actual
            </h3>
            <div className="h-64 w-full relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={evalPie}
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    cornerRadius={6}
                  >
                    {evalPie.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? "#10b981" : "#f1f5f9"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centro del Pie */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-8">
                <span className="text-4xl font-extrabold text-slate-800 tracking-tight">{metrics.evaluatedPct}%</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Completado</span>
              </div>
            </div>
            <div className="flex gap-6 mt-2 relative z-10">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-100"></span>
                <span className="text-sm font-medium text-slate-600">Evaluados</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-200 ring-2 ring-slate-50"></span>
                <span className="text-sm font-medium text-slate-400">Pendientes</span>
              </div>
            </div>
          </div>
        </div>

        {/* LISTADO DE AREAS (ACORDIONES) */}
        <div className="space-y-5">
          <h2 className="text-2xl font-bold text-slate-800 px-2 flex items-center gap-2">
            <Building2 className="text-slate-400" />
            Desglose por Áreas
          </h2>

          {areas.map((area) => {
            const isOpen = expanded[area.id];

            return (
              <div key={area.id} className={`bg-white rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden ${isOpen ? 'ring-2 ring-blue-500/20 border-blue-500/30' : 'border-slate-100 hover:border-slate-300 hover:shadow-md'}`}>
                {/* Header Clickable - GRID LAYOUT */}
                <div
                  onClick={() => toggleArea(area.id)}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 items-center cursor-pointer hover:bg-slate-50/50 transition-colors"
                >
                  {/* Col 1-4: Area Info */}
                  <div className="lg:col-span-4 min-w-0">
                    <h3 className="text-lg font-bold text-slate-800 truncate">{area.nombre}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      {area.referentes && area.referentes.length > 0 ? (
                        <>
                          <div className="flex -space-x-1.5 hover:space-x-1 transition-all">
                            {area.referentes.slice(0, 3).map((ref, idx) => (
                              <Avatar key={idx} src={ref.fotoUrl} alt={ref.nombre} size="xs" />
                            ))}
                          </div>
                          <span className="text-xs text-slate-500 font-medium truncate">
                            {area.referentes[0].nombre} {area.referentes[0].apellido}
                            {area.referentes.length > 1 && ` +${area.referentes.length - 1}`}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Sin referente</span>
                      )}
                    </div>
                  </div>

                  {/* Col 5-6: Empleados Box */}
                  <div className="lg:col-span-2 hidden lg:block">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col items-center justify-center h-full">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Colaboradores</span>
                      <span className="text-xl font-bold text-slate-700">{area.headcount}</span>
                    </div>
                  </div>

                  {/* Col 7-8: Score Box */}
                  <div className="lg:col-span-2 hidden lg:block">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col items-center justify-center h-full">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Score Prom.</span>
                      <div className="flex items-center gap-2 w-full px-2">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${area.avgScore}%` }}></div>
                        </div>
                        <span className="text-sm font-bold text-blue-600">{area.avgScore}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Col 9-10: Pendientes Box */}
                  <div className="lg:col-span-2 hidden lg:block">
                    <div className={`rounded-xl p-3 border flex flex-col items-center justify-center h-full
                            ${area.pendingPct > 20 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}
                         `}>
                      <span className={`text-[10px] uppercase font-bold tracking-wider ${area.pendingPct > 20 ? 'text-amber-500' : 'text-emerald-500'}`}>Feedback Pendiente</span>
                      <span className={`text-xl font-bold ${area.pendingPct > 20 ? 'text-amber-700' : 'text-emerald-700'}`}>{area.pendingPct}%</span>
                    </div>
                  </div>

                  {/* Col 11-12: Acuerdos & Toggle */}
                  <div className="lg:col-span-2 flex items-center justify-between pl-4 border-l border-slate-100">
                    <div className="flex gap-4">
                      <div className="text-center">
                        <span className="block text-sm font-bold text-emerald-600">{area.countAgreement}</span>
                        <span className="text-[9px] text-slate-400 uppercase font-bold">OK</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-sm font-bold text-rose-600">{area.countDisagreement}</span>
                        <span className="text-[9px] text-slate-400 uppercase font-bold">NO</span>
                      </div>
                    </div>
                    <div className={`p-2 rounded-full transition-all duration-300 ${isOpen ? 'bg-blue-100 rotate-180 text-blue-600' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}>
                      <ChevronDown className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isOpen && (
                  <div className="px-5 pb-6 pt-2 border-t border-slate-100 bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                      {/* Top Performers */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                              <TrendingUp className="w-4 h-4" />
                            </div>
                            <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Top Performance</h4>
                          </div>
                          <div className="flex gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                            <span className="w-12">Prelim</span>
                            <span className="w-12">Cierre</span>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {area.topPerformers && area.topPerformers.filter(p => p.score >= 80).length > 0 ? (
                            area.topPerformers.filter(p => p.score >= 80).slice(0, 5).map((p) => (
                              <PerformerRow key={p.id} person={p} />
                            ))
                          ) : (
                            <p className="text-xs text-slate-400 italic py-2 text-center">No hay destacados aún.</p>
                          )}
                        </div>
                      </div>

                      {/* Potencial a Desarrollar (Low Scores or Disagreement) */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                              <AlertCircle className="w-4 h-4" />
                            </div>
                            <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Alertas / Mejora</h4>
                          </div>
                          <div className="flex gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                            <span className="w-12">Prelim</span>
                            <span className="w-12">Cierre</span>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {area.criticalCases && area.criticalCases.length > 0 ? (
                            area.criticalCases.map((p) => (
                              <PerformerRow key={p.id} person={p} isCritical />
                            ))
                          ) : (
                            <p className="text-xs text-slate-400 italic py-2 text-center text-emerald-600">¡Todo en orden! Sin casos críticos.</p>
                          )}
                        </div>
                      </div>

                    </div>
                    {/* End Grid */}

                    <div className="mt-6 flex justify-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedAreaForTable(area); }}
                        className="bg-white border-2 border-slate-200 hover:border-slate-800 text-slate-600 hover:text-slate-900 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                      >
                        <Users size={16} /> Ver Nómina Completa ({area.employees?.length || 0})
                      </button>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- MODAL TABLE --- */}
      {selectedAreaForTable && (
        <Dialog open={!!selectedAreaForTable} onOpenChange={() => setSelectedAreaForTable(null)}>
          <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl">
            <div className="p-6 border-b border-slate-100 bg-white z-10">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600">
                    <Building2 size={24} />
                  </div>
                  <div>
                    {selectedAreaForTable.nombre}
                    <span className="text-slate-400 font-normal text-base ml-2">Nómina Completa</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-sm font-bold">
                      {selectedAreaForTable.employees?.length} Colaboradores
                    </span>
                  </div>
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[350px] py-4 pl-6">Colaborador / Puesto</TableHead>
                      <TableHead className="text-center py-4">Score Prelim</TableHead>
                      <TableHead className="text-center py-4">Score Cierre</TableHead>
                      <TableHead className="text-center py-4">Estado Feedback</TableHead>
                      <TableHead className="text-right py-4 pr-6">Situación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedAreaForTable.employees?.map((emp) => (
                      <TableRow key={emp.id} className="hover:bg-blue-50/30 transition-colors">
                        <TableCell className="font-medium pl-6 py-3">
                          <div className="flex items-center gap-4">
                            <Avatar src={emp.foto} alt={emp.nombre} size="md" />
                            <div>
                              <div className="text-slate-800 font-bold text-sm">{emp.nombre}</div>
                              <div className="text-slate-500 text-xs mt-0.5">{emp.puesto || emp.sector || "Sin Puesto"}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className={`text-sm font-bold ${emp.scorePrelim >= 70 ? 'text-blue-600' : 'text-slate-400'}`}>
                              {emp.scorePrelim != null ? Math.round(emp.scorePrelim) : '-'}%
                            </span>
                            {emp.scorePrelim && <span className="text-[9px] text-slate-400 uppercase">Prelim</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className={`text-lg font-bold ${emp.scoreClosing >= 70 ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {emp.scoreClosing != null ? Math.round(emp.scoreClosing) : '-'}%
                            </span>
                            {emp.scoreClosing && <span className="text-[9px] text-emerald-600/70 uppercase font-bold">Final</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase
                                            ${['SIGNED', 'CONFIRMADO', 'ACK'].includes(emp.feedbackStatus)
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'}
                                        `}>
                            {emp.feedbackStatus === "SIGNED" || emp.feedbackStatus === "CONFIRMADO" ? "Cerrado" : emp.feedbackStatus}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {emp.disagreement ? (
                            <div className="flex items-center justify-end gap-1 text-rose-600">
                              <AlertCircle size={14} />
                              <span className="font-bold text-xs">EN DESACUERDO</span>
                            </div>
                          ) : (
                            <span className="text-emerald-600 text-xs font-bold flex items-center justify-end gap-1">
                              <CheckCircle2 size={14} /> OK
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}

// COmponentes UI Pequeños
function MetricCard({ icon, label, value, sub, color }) {
  return (
    <div className={`bg-white rounded-xl p-5 shadow-sm border border-slate-100 ${color || ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
      </div>
      <div className="text-2xl font-extrabold text-slate-800">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-1">{label}</div>
      <div className="text-xs text-slate-400 mt-2">{sub}</div>
    </div>
  );
}

function PerformerRow({ person, isCritical }) {
  // Helpers for displaying score cells
  const ScoreCell = ({ score, isClosing }) => {
    if (score === null || score === undefined) return <span className="text-slate-300 w-8 text-center">-</span>;
    // Color logic
    let color = "text-slate-600";
    if (score >= 90) color = "text-emerald-600";
    else if (score >= 70) color = "text-blue-600";
    else if (score < 60) color = "text-rose-500";

    return <span className={`font-bold w-8 text-center ${color}`}>{Math.round(score)}%</span>;
  };

  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors group">
      <div className="flex items-center gap-3 overflow-hidden">
        <Avatar src={person.foto} alt={person.nombre} size="sm" />
        <div className="truncate min-w-0">
          <div className="text-sm font-semibold text-slate-700 truncate">{person.nombre}</div>
          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{person.puesto || person.sector || "Sin Puesto"}</div>
          {/* Mobile Only Flags */}
          {person.disagreement && (
            <span className="text-[9px] font-bold text-rose-600 block md:hidden">EN DESACUERDO</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-right pl-2 text-sm">
        {/* Prelim Column */}
        <div className="w-12 flex justify-center">
          <ScoreCell score={person.scorePrelim} />
        </div>

        {/* Closing Column */}
        <div className="w-12 flex justify-center relative">
          <ScoreCell score={person.scoreClosing} isClosing />
          {person.disagreement && (
            <div className="absolute -top-1 -right-0 text-rose-500" title="En desacuerdo">
              <AlertCircle size={10} fill="currentColor" className="text-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ src, alt, size = "md" }) {
  const s = size === "xs" ? "w-6 h-6 border-2 border-white" : size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const f = size === "xs" ? "text-[8px]" : size === "sm" ? "text-xs" : "text-sm";

  if (src) {
    // Fix relative URL like before
    const url = /^https?:\/\//i.test(src) ? src : `${(typeof API_ORIGIN === 'string' ? API_ORIGIN : window.location.origin).replace(/\/+$/, '')}/${src.replace(/^\/+/, '')}`;
    return <img src={url} alt={alt} className={`${s} rounded-full object-cover bg-slate-200`} />;
  }

  return (
    <div className={`${s} rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold ${f}`}>
      {alt ? alt[0].toUpperCase() : "?"}
    </div>
  );
}