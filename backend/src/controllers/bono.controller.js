import BonoConfig from "../models/BonoConfig.model.js";
import BonoAnual from "../models/BonoAnual.model.js";
import Empleado from "../models/Empleado.model.js";
import Feedback from "../models/Feedback.model.js";
import Incidencia from "../models/Incidencia.model.js";
import { mixGlobal, bonoLineal, bonoTramos, montoBono } from "../lib/bono.js";
import { computeForEmployees } from "./dashboard.controller.js";

// --- CONFIG ---

export const getConfig = async (req, res, next) => {
    try {
        const { year } = req.params;
        const config = await BonoConfig.findOne({ anio: Number(year) });
        res.json(config || { anio: Number(year), isNew: true });
    } catch (err) {
        next(err);
    }
};

export const saveConfig = async (req, res, next) => {
    try {
        const { year } = req.params;
        const data = req.body;

        const config = await BonoConfig.findOneAndUpdate(
            { anio: Number(year) },
            { ...data, updatedBy: req.user._id },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        res.json(config);
    } catch (err) {
        next(err);
    }
};

// --- CALCULATION ---

export const calculateAll = async (req, res, next) => {
    try {
        const { year } = req.params;
        const { targetId, type } = req.query; // Support targeted recalc
        const anio = Number(year);

        // 1. Get Config
        const config = await BonoConfig.findOne({ anio });
        if (!config) return res.status(400).json({ message: "No hay configuración para este año." });

        // 2. Get Active Employees
        const filter = {};
        if (targetId) {
            if (type === 'empleado') {
                filter._id = targetId;
            } else if (type === 'area') {
                filter.area = targetId;
            }
        } else {
            // If manual calculation, respect strict filter or allow both?
            // Let's use robust filter here too
            filter.estadoLaboral = { $in: ["ACTIVO", "VINCULADO"] };
        }

        const empleadosDocs = await Empleado.find(filter, '_id').lean();
        const empIds = empleadosDocs.map(e => e._id);

        if (empIds.length === 0) {
            return res.json({ count: 0, message: "No se encontraron empleados para calcular." });
        }

        const results = [];
        const debugs = [];

        // 3. Bulk Compute Metrics (Efficient)
        const metricsList = await computeForEmployees(empIds, anio);

        // 4. Process each metric result and save
        for (const metrics of metricsList) {
            if (!metrics) continue;

            const emp = metrics.empleado;

            const safeFeedbacks = Array.isArray(metrics.feedbacks) ? metrics.feedbacks : [];
            const feedback = safeFeedbacks.find(f =>
                f.periodo === "FINAL" &&
                ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED", "CONFIRMADO", "SIGNED"].includes(f.estado)
            );

            if (!feedback) {
                continue;
            }

            // 5. Apply Rules (With Overrides)
            let activeConfig = { ...config.toObject() };
            let configSource = "GLOBAL";

            if (config.overrides && config.overrides.length > 0) {
                const empOverride = config.overrides.find(o => o.type === "empleado" && String(o.targetId) === String(emp._id));
                if (empOverride) {
                    activeConfig.escala = { ...activeConfig.escala, ...empOverride.escala };
                    if (empOverride.success) activeConfig.escala = empOverride.escala;
                    if (empOverride.bonoTarget !== undefined) activeConfig.bonoTarget = empOverride.bonoTarget;
                    configSource = "OVERRIDE_EMP";
                } else {
                    const areaOverride = config.overrides.find(o => o.type === "area" && String(o.targetId) === String(emp.area?._id));
                    if (areaOverride) {
                        activeConfig.escala = { ...activeConfig.escala, ...areaOverride.escala };
                        if (areaOverride.bonoTarget !== undefined) activeConfig.bonoTarget = areaOverride.bonoTarget;
                        configSource = "OVERRIDE_AREA";
                    }
                }
            }

            const globalScore = metrics.scoreFinal || 0;

            let bonoPct = 0;
            let calcMeta = "";

            if (activeConfig.escala.tipo === "lineal") {
                const lin = bonoLineal({
                    global: globalScore,
                    minPct: activeConfig.escala.minPct,
                    maxPct: activeConfig.escala.maxPct,
                    umbral: activeConfig.escala.umbral
                });
                bonoPct = lin.pct;
                calcMeta = lin.meta;
            } else {
                const tr = bonoTramos({
                    global: globalScore,
                    tramos: activeConfig.escala.tramos
                });
                bonoPct = tr.pct;
                calcMeta = "tramos";
            }

            // --- REGLAS DE NEGOCIO (Antigüedad, Incidencias) ---
            const condiciones = [];
            let factorTiempo = 1;
            let disqualified = false;

            // 1. Antigüedad al 31 de Agosto del año del bono
            if (emp.fechaIngreso) {
                const ingreso = new Date(emp.fechaIngreso);
                const fechaCorte = new Date(anio + 1, 7, 31);

                let months = (fechaCorte.getFullYear() - ingreso.getFullYear()) * 12 + (fechaCorte.getMonth() - ingreso.getMonth());
                if (fechaCorte.getDate() < ingreso.getDate()) months--;

                if (months < 6) {
                    disqualified = true;
                    condiciones.push({ tipo: "ANTIGUEDAD", descripcion: `Menor a 6 meses (${months}m)`, impacto: "ANULA" });
                } else if (months < 12) {
                    factorTiempo = Math.min(1, months / 12);
                    condiciones.push({ tipo: "ANTIGUEDAD", descripcion: `Proporcional (${months} meses)`, impacto: "REDUCE" });
                }
            }

            // 2. Incidencias del año Fiscal (1 Sep Anio - 31 Ago Anio+1)
            const startYear = new Date(anio, 8, 1);
            const endYear = new Date(anio + 1, 7, 31);
            const incidencias = await Incidencia.find({
                empleado: emp._id,
                fecha: { $gte: startYear, $lte: endYear }
            });

            // a) Suspensiones / Sanciones
            const sanciones = incidencias.filter(i => ["SANCION", "SUSPENSION"].includes(i.tipo));
            if (sanciones.length > 0) {
                disqualified = true;
                condiciones.push({ tipo: "SANCION", descripcion: `${sanciones.length} Sanciones disciplinarias`, impacto: "ANULA" });
            }

            // b) Apercibimientos > 2
            const apercibimientos = incidencias.filter(i => i.tipo === "APERCIBIMIENTO");
            if (apercibimientos.length > 2) {
                disqualified = true;
                condiciones.push({ tipo: "SANCION", descripcion: `${apercibimientos.length} Apercibimientos (>2)`, impacto: "ANULA" });
            }

            // c) Inasistencias Injustificadas > 3
            const inasistencias = incidencias.filter(i => i.tipo === "INASISTENCIA" && !i.justificada);
            if (inasistencias.length > 3) {
                disqualified = true;
                condiciones.push({ tipo: "PRESENTISMO", descripcion: `${inasistencias.length} Inasistencias Injust. (>3)`, impacto: "ANULA" });
            }

            // d) Licencias (Acumular días)
            const misLicencias = incidencias.filter(i => i.tipo === "LICENCIA" && i.fechaHasta);
            let totalDiasLicencia = 0;

            misLicencias.forEach(l => {
                const ini = new Date(l.fecha);
                const fin = new Date(l.fechaHasta);
                const diffTime = Math.abs(fin - ini);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                totalDiasLicencia += diffDays;
            });

            if (totalDiasLicencia > 60) {
                const factorDescuento = totalDiasLicencia / 365;
                factorTiempo = Math.max(0, factorTiempo - factorDescuento);
                condiciones.push({
                    tipo: "LICENCIA",
                    descripcion: `Licencias acumuladas (${totalDiasLicencia} días)`,
                    impacto: "REDUCE"
                });
            }

            // d) Performance Threshold
            if (activeConfig.escala.umbral && globalScore < activeConfig.escala.umbral) {
                condiciones.push({
                    tipo: "DESEMPEÑO",
                    descripcion: `No alcanza objetivo global (${Math.round(globalScore)} < ${activeConfig.escala.umbral})`,
                    impacto: "ANULA"
                });
            }

            // 3. Resultado final
            const sueldo = emp.sueldoBase?.monto || 0;
            const bonoBase = sueldo * (activeConfig.bonoTarget || 0);

            const bonoFinal = disqualified ? 0 : (bonoBase * bonoPct * factorTiempo);

            results.push({
                empleado: emp._id,
                anio,
                update: {
                    estado: "borrador",
                    snapshot: {
                        puesto: emp.puesto,
                        fechaCierre: feedback.updatedAt,
                        areaNombre: emp.area?.nombre
                    },
                    bonoBase,
                    bonoFinal,
                    condiciones
                }
            });
        }

        const savePromises = results.map(r =>
            BonoAnual.findOneAndUpdate(
                { empleado: r.empleado, anio: r.anio },
                r.update,
                { new: true, upsert: true }
            )
        );

        await Promise.all(savePromises);

        res.json({
            count: results.length,
            message: "Cálculo finalizado",
            debugs: debugs.slice(0, 10)
        });
    } catch (err) {
        next(err);
    }
};

export const getResults = async (req, res, next) => {
    try {
        const { year } = req.params;
        const { area, sector } = req.query;
        const anio = Number(year);

        // 1. Get Config
        let config = await BonoConfig.findOne({ anio });
        if (!config) {
            config = new BonoConfig({
                anio,
                bonoTarget: 0,
                escala: { tipo: "lineal", minPct: 0, maxPct: 1, umbral: 60, tramos: [] },
                overrides: []
            });
        }

        // 2. Get All Active Employees (Robust Filter)
        const empleadosDocs = await Empleado.find({ estadoLaboral: { $in: ["ACTIVO", "VINCULADO"] } }, "_id").lean();
        const ids = empleadosDocs.map(e => e._id);

        if (ids.length === 0) return res.json([]);

        // 3. Compute Metrics (Live)
        const metrics = await computeForEmployees(ids, anio);

        // --- PRE-FETCH INCIDENCIAS FOR ALL EMPLOYEES (Optimization) ---
        const startYear = new Date(anio, 8, 1);
        const endYear = new Date(anio + 1, 7, 31);
        const allIncidencias = await Incidencia.find({
            fecha: { $gte: startYear, $lte: endYear },
            empleado: { $in: ids }
        }).lean();

        // 4. Map to Result Format
        const results = metrics.map(m => {
            const emp = m.empleado;
            const globalScore = m.scoreFinal || 0;

            // --- Apply Overrides Logic ---
            let activeConfig = { ...config.toObject() };
            if (config.overrides && config.overrides.length > 0) {
                const empOverride = config.overrides.find(o => o.type === "empleado" && String(o.targetId) === String(emp._id));
                if (empOverride) {
                    activeConfig.escala = { ...activeConfig.escala, ...empOverride.escala };
                    if (empOverride.bonoTarget !== undefined) activeConfig.bonoTarget = empOverride.bonoTarget;
                } else {
                    const areaOverride = config.overrides.find(o => o.type === "area" && String(o.targetId) === String(emp.area?._id));
                    if (areaOverride) {
                        activeConfig.escala = { ...activeConfig.escala, ...areaOverride.escala };
                        if (areaOverride.bonoTarget !== undefined) activeConfig.bonoTarget = areaOverride.bonoTarget;
                    }
                }
            }

            // Calculate Bono Pct
            let bonoPct = 0;
            if (activeConfig.escala.tipo === "lineal") {
                bonoPct = bonoLineal({
                    global: globalScore,
                    minPct: activeConfig.escala.minPct,
                    maxPct: activeConfig.escala.maxPct,
                    umbral: activeConfig.escala.umbral
                }).pct;
            } else {
                bonoPct = bonoTramos({
                    global: globalScore,
                    tramos: activeConfig.escala.tramos
                }).pct;
            }

            // --- REGLAS DE NEGOCIO (Antigüedad, Incidencias) ---
            const condiciones = [];
            let factorTiempo = 1;
            let disqualified = false;

            // 1. Antigüedad
            if (emp.fechaIngreso) {
                const ingreso = new Date(emp.fechaIngreso);
                const fechaCorte = new Date(anio + 1, 7, 31);
                let months = (fechaCorte.getFullYear() - ingreso.getFullYear()) * 12 + (fechaCorte.getMonth() - ingreso.getMonth());
                if (fechaCorte.getDate() < ingreso.getDate()) months--;

                if (months < 6) {
                    disqualified = true;
                    condiciones.push({ tipo: "ANTIGUEDAD", descripcion: `Menor a 6 meses (${months}m)`, impacto: "ANULA" });
                } else if (months < 12) {
                    factorTiempo = Math.min(1, months / 12);
                    condiciones.push({ tipo: "ANTIGUEDAD", descripcion: `Proporcional (${months} meses)`, impacto: "REDUCE" });
                }
            }

            // 2. Incidencias (Filter from pre-fetched)
            const misIncidencias = allIncidencias.filter(i => String(i.empleado) === String(emp._id));

            // a) Sanciones
            const sanciones = misIncidencias.filter(i => ["SANCION", "SUSPENSION"].includes(i.tipo));
            if (sanciones.length > 0) {
                disqualified = true;
                condiciones.push({ tipo: "SANCION", descripcion: `${sanciones.length} Sanciones`, impacto: "ANULA" });
            }
            // b) Apercibimientos
            const apercibimientos = misIncidencias.filter(i => i.tipo === "APERCIBIMIENTO");
            if (apercibimientos.length > 2) {
                disqualified = true;
                condiciones.push({ tipo: "SANCION", descripcion: `${apercibimientos.length} Apercibimientos (>2)`, impacto: "ANULA" });
            }
            // c) Inasistencias Injustificadas > 3
            const inasistencias = misIncidencias.filter(i => i.tipo === "INASISTENCIA" && !i.justificada);
            if (inasistencias.length > 3) {
                disqualified = true;
                condiciones.push({ tipo: "PRESENTISMO", descripcion: `${inasistencias.length} Inasistencias Injust. (>3)`, impacto: "ANULA" });
            }
            // d) Licencias (Acumular días)
            const licencias = misIncidencias.filter(i => i.tipo === "LICENCIA" && i.fechaHasta);
            let totalDiasLicencia = 0;

            licencias.forEach(l => {
                const ini = new Date(l.fecha);
                const fin = new Date(l.fechaHasta);
                const diffTime = Math.abs(fin - ini);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                totalDiasLicencia += diffDays;
            });

            if (totalDiasLicencia > 60) {
                const factorDescuento = totalDiasLicencia / 365;
                factorTiempo = Math.max(0, factorTiempo - factorDescuento);
                condiciones.push({
                    tipo: "LICENCIA",
                    descripcion: `Licencias acumuladas (${totalDiasLicencia} días)`,
                    impacto: "REDUCE"
                });
            }

            // d) Performance Threshold
            if (activeConfig.escala.umbral && globalScore < activeConfig.escala.umbral) {
                condiciones.push({
                    tipo: "DESEMPEÑO",
                    descripcion: `No alcanza objetivo global (${Math.round(globalScore)} < ${activeConfig.escala.umbral})`,
                    impacto: "ANULA"
                });
            }

            // Calculate Final Amounts
            const sueldo = emp.sueldoBase?.monto || 0;
            const bonoBase = sueldo * (activeConfig.bonoTarget || 0);
            const bonoFinal = disqualified ? 0 : (bonoBase * bonoPct * factorTiempo);

            // Get Feedback Comment
            const safeFeedbacks = Array.isArray(m.feedbacks) ? m.feedbacks : [];
            const finalFeedback = safeFeedbacks.find(f => f.periodo === "FINAL");
            const feedbackComentario = finalFeedback?.comentario || "";

            return {
                _id: emp._id,
                empleado: {
                    _id: emp._id,
                    nombre: emp.nombre,
                    apellido: emp.apellido,
                    fotoUrl: emp.fotoUrl
                },
                snapshot: {
                    areaNombre: emp.area?.nombre || "Sin Área",
                    sectorNombre: emp.sector?.nombre || "Sin Sector",
                    puesto: emp.puesto,
                    fechaIngreso: emp.fechaIngreso,
                    sueldo: sueldo
                },
                pesos: {
                    objetivos: 70,
                    competencias: 30
                },
                resultado: {
                    objetivos: m.scoreObj,
                    competencias: m.scoreApt,
                    total: globalScore
                },
                condiciones,
                feedbackComentario,
                bonoBase,
                bonoFinal,
                bonusConfig: {
                    target: activeConfig.bonoTarget || 0,
                    type: activeConfig.escala?.tipo || "N/A",
                    umbral: activeConfig.escala?.umbral || 0,
                    min: activeConfig.escala?.minPct || 0,
                    max: activeConfig.escala?.maxPct || 0,
                },
                estado: "calculado"
            };
        });

        // 5. Filter by Area/Sector if requested
        let filtered = results;
        if (area) filtered = filtered.filter(r => r.snapshot.areaNombre === area);

        res.json(filtered);

    } catch (err) {
        next(err);
    }
};
