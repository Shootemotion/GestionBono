# Analytics API — Documentación

API de solo lectura diseñada para consumo desde **Power BI** (conector Web) u otras herramientas de BI.

Todos los endpoints devuelven **arrays de objetos planos** (sin anidamiento), listos para transformarse
en tablas directamente en Power BI sin necesidad de Power Query complejo.

---

## Autenticación

Todos los endpoints requieren el header:

```
X-Analytics-Token: <ANALYTICS_SECRET>
```

Configurá el token en el archivo `.env` del backend:

```env
ANALYTICS_SECRET=tu_token_secreto_aqui
```

---

## Base URL

```
http://localhost:5000/api/analytics
```

En producción reemplazá con tu dominio.

---

## Endpoints

### 1. `GET /api/analytics/empleados`

Directorio completo de empleados con su estructura organizacional.

| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | string | ID MongoDB del empleado |
| `nombre` | string | Nombre |
| `apellido` | string | Apellido |
| `dni` | string | DNI |
| `cuil` | string | CUIL |
| `email` | string | Email |
| `puesto` | string | Puesto/cargo |
| `categoria` | string | Categoría laboral |
| `genero` | string | Masculino / Femenino / Otro |
| `estadoLaboral` | string | VINCULADO / DESVINCULADO |
| `fechaIngreso` | date | Fecha de ingreso |
| `antigüedadAnios` | number | Antigüedad en años al día de hoy |
| `sueldo` | number | Sueldo base vigente (ARS) |
| `areaNombre` | string | Nombre del área |
| `sectorNombre` | string | Nombre del sector/dependencia |
| `createdAt` | date | Fecha de alta en el sistema |

---

### 2. `GET /api/analytics/evaluaciones`

Una fila por evaluación (hito de seguimiento).  
Incluye el resultado global y los resultados por meta (expandidos como columnas separadas).

| Campo | Tipo | Descripción |
|---|---|---|
| `evaluacion_id` | string | ID de la evaluación |
| `empleado_id` | string | ID del empleado |
| `empleado_nombre` | string | Nombre completo |
| `area` | string | Área al momento de evaluación |
| `sector` | string | Sector al momento de evaluación |
| `puesto` | string | Puesto al momento de evaluación |
| `plantilla_id` | string | ID de la plantilla usada |
| `plantilla_nombre` | string | Nombre del objetivo evaluado |
| `plantilla_tipo` | string | objetivo / aptitud |
| `plantilla_proceso` | string | Proceso ISO asociado |
| `plantilla_peso` | number | Peso base del objetivo (%) |
| `plantilla_frecuencia` | string | mensual / trimestral / semestral / anual |
| `year` | number | Año fiscal |
| `periodo` | string | Ej: 2025Q1, 2025M09, 2025S1, 2025A1 |
| `estado` | string | MANAGER_DRAFT / PENDING_EMPLOYEE / PENDING_HR / CLOSED |
| `score` | number | Resultado global 0–100 |
| `escala` | number | Escala 0–100 |
| `empleadoAck` | string | ACK / CONTEST / null |
| `closedAt` | date | Fecha de cierre |
| `createdAt` | date | Fecha de creación |

**Query params opcionales:**
- `?year=2025` — filtrar por año fiscal
- `?estado=CLOSED` — solo evaluaciones cerradas

---

### 3. `GET /api/analytics/feedback`

Una fila por sesión de feedback (Q1 / Q2 / Q3 / FINAL).

| Campo | Tipo | Descripción |
|---|---|---|
| `feedback_id` | string | ID del feedback |
| `empleado_id` | string | ID del empleado |
| `empleado_nombre` | string | Nombre completo |
| `area` | string | Área |
| `sector` | string | Sector |
| `puesto` | string | Puesto |
| `year` | number | Año fiscal |
| `periodo` | string | Q1 / Q2 / Q3 / FINAL |
| `estado` | string | DRAFT / SENT / PENDING_HR / CLOSED |
| `score_obj` | number | Score de objetivos 0–100 |
| `score_comp` | number | Score de competencias 0–100 |
| `score_global` | number | Score global 0–100 |
| `empleadoAck` | string | ACK / CONTEST / SYSTEM_CLOSED / null |
| `motivoDesacuerdo` | string | Motivo si CONTEST |
| `closedAt` | date | Fecha de cierre |
| `createdAt` | date | Fecha de creación |

**Query params opcionales:**
- `?year=2025`
- `?periodo=FINAL`

---

### 4. `GET /api/analytics/bonos`

Una fila por empleado por año con el resultado del bono.

| Campo | Tipo | Descripción |
|---|---|---|
| `bono_id` | string | ID del registro |
| `empleado_id` | string | ID del empleado |
| `empleado_nombre` | string | Nombre completo |
| `area` | string | Área (snapshot del año) |
| `sector` | string | Sector (snapshot del año) |
| `puesto` | string | Puesto (snapshot del año) |
| `cuil` | string | CUIL |
| `anio` | number | Año del bono |
| `estado` | string | borrador / en_proceso / aprobado / pagado |
| `peso_objetivos` | number | Peso objetivos (%) |
| `peso_competencias` | number | Peso competencias (%) |
| `resultado_objetivos` | number | Score final objetivos 0–100 |
| `resultado_competencias` | number | Score final competencias 0–100 |
| `resultado_total` | number | Score global 0–100 |
| `bono_base` | number | Monto base de referencia |
| `bono_final` | number | Monto final calculado |
| `createdAt` | date | Fecha de creación |

**Query params opcionales:**
- `?anio=2025`
- `?estado=aprobado`

---

### 5. `GET /api/analytics/plantillas`

Catálogo de plantillas/objetivos configurados.

| Campo | Tipo | Descripción |
|---|---|---|
| `plantilla_id` | string | ID de la plantilla |
| `tipo` | string | objetivo / aptitud |
| `year` | number | Año fiscal |
| `nombre` | string | Nombre del objetivo |
| `proceso` | string | Proceso ISO (ej: P01 - Proceso Preanalitico) |
| `scopeType` | string | area / sector / empleado |
| `scopeNombre` | string | Nombre del área/sector/empleado al que aplica |
| `frecuencia` | string | mensual / trimestral / semestral / anual |
| `pesoBase` | number | Peso base (%) |
| `activo` | boolean | Si está activa |
| `cantMetas` | number | Cantidad de metas configuradas |
| `fechaInicioFiscal` | date | Inicio del período |
| `fechaCierre` | date | Fin del período |

**Query params opcionales:**
- `?year=2025`
- `?tipo=objetivo`
- `?activo=true`

---

## Cómo conectar desde Power BI

1. Abrir Power BI Desktop
2. **Inicio → Obtener datos → Web**
3. Ingresar la URL:
   ```
   http://tu-servidor:5000/api/analytics/evaluaciones?year=2025
   ```
4. En **Configuración avanzada**, agregar el header HTTP:
   ```
   X-Analytics-Token: tu_token_secreto
   ```
5. Hacer clic en **Aceptar** → Power BI importa el JSON como tabla
6. Repetir para cada endpoint (`/empleados`, `/feedback`, `/bonos`, `/plantillas`)
7. En el modelo de datos, relacionar las tablas por `empleado_id`

### Clave de relaciones sugerida en Power BI

```
empleados[_id]       ←→  evaluaciones[empleado_id]
empleados[_id]       ←→  feedback[empleado_id]
empleados[_id]       ←→  bonos[empleado_id]
plantillas[plantilla_id] ←→ evaluaciones[plantilla_id]
```

---

## Refresh programado

Para refresh automático en Power BI Service:
1. Publicar el informe en Power BI Service
2. Configurar una **Data Gateway** (Personal Gateway basta)
3. Programar refresh diario/semanal desde la configuración del dataset

---

## Archivos de esta carpeta

```
analytics/
├── README.md                     ← Este archivo
├── middleware/
│   └── analyticsAuth.middleware.js  ← Validación del token
├── controllers/
│   ├── empleados.analytics.js    ← GET /api/analytics/empleados
│   ├── evaluaciones.analytics.js ← GET /api/analytics/evaluaciones
│   ├── feedback.analytics.js     ← GET /api/analytics/feedback
│   ├── bonos.analytics.js        ← GET /api/analytics/bonos
│   └── plantillas.analytics.js   ← GET /api/analytics/plantillas
└── analytics.routes.js           ← Router principal
```
