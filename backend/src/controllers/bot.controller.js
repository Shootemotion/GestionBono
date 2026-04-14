import { Groq } from 'groq-sdk';
import Empleado from '../models/Empleado.model.js';
import { computeForEmployees } from './dashboard.controller.js';

// Inicializar Groq con la API key de las variables de entorno
// (Asegurar que exite process.env.GROQ_API_KEY)
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

export const chatWithBot = async (req, res) => {
    try {
        const { messages, clientContext } = req.body;
        const userId = req.user.id;
        const empleadoId = req.user.empleadoId;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Falta el array de mensajes." });
        }

        if (!groq) {
            return res.status(503).json({
                error: "La API de IA no está configurada en el servidor (Falta GROQ_API_KEY)."
            });
        }

        // Obtener datos básicos del usuario para personalizar la charla
        let userInfoStr = "Usuario Desconocido";
        let userDesempenoStr = "";

        if (empleadoId) {
            const empleado = await Empleado.findById(empleadoId).select('nombre apellido puesto sector area corporacion empresa idSistema').lean();
            if (empleado) {
                userInfoStr = `Vos sos un asistente llamado BonoBot. El colaborador con el que estás hablando se llama ${empleado.nombre} ${empleado.apellido}, y su puesto es ${empleado.puesto || 'no especificado'} en el sector de ${empleado.sector || 'no especificado'} de la empresa ${empleado.empresa || 'no especificada'}.`;
            }

            // --- MEJORA: Obtener datos procesados del Dashboard ---
            const now = new Date();
            let currentYear = now.getFullYear();
            // Si estamos entre Enero (0) y Agosto (7), el año fiscal "activo" suele ser el anterior (el periodo Sept-Ago usa el año de inicio)
            if (now.getMonth() < 8) {
                currentYear--;
            }

            console.log(`[BonoBot] Fetching data for empleadoId: ${empleadoId}, Initial Year: ${currentYear}`);
            let dashboardDataArr = await computeForEmployees([empleadoId], currentYear);
            let data = dashboardDataArr?.[0];

            // Fallback: Si no hay objetivos para ese año fiscal, intentamos con el año calendario actual
            if (!data || !data.objetivos || data.objetivos.items.length === 0) {
                const fallbackYear = now.getFullYear();
                if (fallbackYear !== currentYear) {
                    console.log(`[BonoBot] No data for ${currentYear}, trying fallback ${fallbackYear}...`);
                    dashboardDataArr = await computeForEmployees([empleadoId], fallbackYear);
                    if (dashboardDataArr?.[0]?.objetivos?.items?.length > 0) {
                        data = dashboardDataArr[0];
                        currentYear = fallbackYear;
                    }
                }
            }

            console.log(`[BonoBot] Final Data - Year: ${currentYear}, Goals: ${data?.objetivos?.items?.length || 0}`);

            if (data && data.objetivos && data.objetivos.items.length > 0) {
                const metasList = data.objetivos.items.map(obj => {
                    // 1. Definición de cómo se mide (Metas globales)
                    const definicionMetas = obj.metas?.map(m =>
                        `  * Indicador: "${m.nombre}" | Target: ${m.esperado || m.target} ${m.unidad || ''} | Regla: ${m.reglaCierre || 'Promedio'}${m.modoAcumulacion === 'acumulativo' ? ' (Acumulativo)' : ''}`
                    ).join("\n") || "  * No hay indicadores definidos.";

                    // 2. Historial de todos los periodos con data
                    const historialPeriodos = obj.hitos?.filter(h =>
                        h.actual !== null || (h.metas?.some(m => m.resultado !== null))
                    ).map(h => {
                        const metasDetalle = h.metas?.map(m => `    - ${m.nombre}: ${m.resultado || 0} ${m.unidad || ''}`).join("\n");
                        return `  * Período ${h.periodo}: Avance ${h.actual || 0}%\n${metasDetalle}`;
                    }).join("\n") || "  * No hay avances registrados aún.";

                    return `- OBJETIVO: "${obj.nombre}"
  Descripción: ${obj.descripcion || 'Sin descripción disponible.'}
  Peso: ${obj.peso}% | Avance Acumulado Año: ${Math.round(obj.progreso || 0)}%
  ¿Cómo se mide?:
${definicionMetas}
  RESULTADOS POR TRIMESTRE:
${historialPeriodos}`;
                }).join("\n\n");

                userDesempenoStr = `
DATOS DE DESEMPEÑO PROCESADOS (Año Fiscal ${currentYear}):
- Rating / Score Final Proyectado: ${Math.round(data.scoreFinal || 0)}%
- Puntaje en Objetivos: ${Math.round(data.scoreObj || 0)}%
- Puntaje en Competencias/Aptitudes: ${Math.round(data.scoreApt || 0)}%

DETALLE COMPLETO DE OBJETIVOS Y PERIODOS:
${metasList}
`;
            } else {
                userDesempenoStr = "No se encontraron objetivos o metas activas procesadas para este usuario en el periodo actual.";
            }
        }

        // System Prompt dinámico
        const systemPrompt = {
            role: "system",
            content: `
Eres BonoBot, el asistente virtual inteligente, amigable y pedagógico de la plataforma "Diagnos Desempeño".
Tu misión principal no es solo dar datos, sino actuar como un "coach" o mentor que ayuda al empleado a entender su desempeño.

INSTRUCCIONES DE ESTILO Y FORMATO (CRÍTICO):
1. **Visualización**: **USÁ MARKDOWN SIEMPRE**. Usá **negritas** para resaltar cifras, nombres de objetivos y fechas importantes. Usá listas con viñetas para que la información no sea un bloque de texto plano.
2. **Explicaciones Claras**: No te limites a leer indicadores técnicos. Explica *qué se espera* del usuario de forma sencilla y *cómo impacta* su trabajo en la medición.
3. **Estructura**: Si explicás un objetivo, usá este esquema:
   - **¿Qué es?**: Breve descripción funcional.
   - **¿Cómo se mide?**: Indicadores y metas.
   - **Tu avance**: Resultado actual vs Meta.
4. **Tono Cordial (Argentina)**: Usá voseo ("fijate", "tenés", "chequeá") de forma cercana pero profesional.
5. **Brevedad**: Dividí los párrafos. Evitá bloques de texto de más de 3 líneas.

CONTEXTO DE SEGURIDAD Y PRIVACIDAD:
- **Aislamiento Total**: Solo tenés acceso a los datos del usuario que se te pasan en este prompt. **No podés ver datos de otros empleados ni de la nómina general**.
- Si el usuario te pregunta sobre la seguridad de sus datos, aseguralo de que el sistema garantiza que cada charla es privada y solo basada en su propio legajo y desempeño.

CONTEXTO DEL USUARIO:
${userInfoStr}

${userDesempenoStr}

${clientContext ? '\nCONTEXTO ADICIONAL DE LA APP:\n' + clientContext : ''}

REGLAS DE NEGOCIO PARA TU CONOCIMIENTO:
- El sistema de bonos suele componerse de un mix de Objetivos Cuantitativos y Competencias (usualmente un 70% u 80% cuantitativo, y el resto competencias).
- El período evaluativo anual suele ir de Septiembre a Agosto.
- Resultados "Acumulativos" = se suman trimestre a trimestre.
- Resultados "Promedio" = se promedian entre los períodos cargados.

Tu objetivo es que el empleado se vaya de la charla entendiendo perfectamente qué tiene que hacer para mejorar su bono.
            `.trim()
        };

        // Preparar el array de mensajes completo limitando el historial para no exceder tokens
        // Dejemos los ultimos 10 mensajes máximo
        const recentMessages = messages.slice(-10).map(m => ({
            role: m.role === 'bot' ? 'assistant' : 'user', // Convertir roles
            content: m.text || m.content // Soportar ambos formatos de envío
        }));

        const chatPayload = [systemPrompt, ...recentMessages];

        // Llamar a Llama 3 via Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: chatPayload,
            model: "llama-3.1-8b-instant", // Usamos la versión instantánea y moderna
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            stream: false,
        });

        const replyContent = chatCompletion.choices[0]?.message?.content || "Hubo un problema al procesar mi respuesta.";

        return res.json({
            reply: replyContent
        });

    } catch (error) {
        console.error("Error en BonoBot AI Controller:", error);
        res.status(500).json({ error: "No se pudo procesar la consulta de inteligencia artificial.", details: error.message });
    }
};
