# Auditoría Técnica - Plataforma de Desempeño (Diagnos S.A.)

> Documento interno de auditoría para revisión técnica del sistema de Gestión de Desempeño.
> Versión de aplicación: `5.2` (ver `src/lib/appInfo.js`).
> Rama analizada: `refactor-ui-monolitos`.
> Repositorio local: `e:/Bruno/PROYECTOS/DESEMPEÑO`.

---

## 1. Resumen ejecutivo

La **Plataforma de Desempeño** (interna de Diagnos S.A.) es una aplicación web full-stack desarrollada
para gestionar de forma integral el ciclo anual de evaluación de desempeño de los colaboradores: definición
y asignación de objetivos por área/sector/empleado, carga periódica de avances, cálculo de aptitudes
(competencias) y consolidación en una nota final que alimenta el cálculo del **bono anual**. Además, integra
un módulo paralelo de **Gestión ISO de Calidad** para hacer seguimiento mensual de los objetivos del sistema
de calidad, un tablero ejecutivo (Gantt) para directores, un asistente conversacional (BonoBot) y una página
de Sistemas con auditoría, snapshots y backups automáticos.

El stack es **Node.js + Express 5 + Mongoose 8** en el backend (autenticación JWT, archivos vía Multer,
documentación con Swagger UI, cron jobs con `node-cron`, rate limiting con `express-rate-limit`, e
integración con Groq SDK para el asistente IA); en el frontend, **React 19 + Vite 7 + React Router 7 +
Tailwind v4 + Radix UI + Recharts + Framer Motion + Sonner**. La base de datos es **MongoDB** y los
backups se exportan a archivos comprimidos vía `archiver`.

A nivel funcional, la plataforma cubre **toda la nómina** de la empresa (estructura completa: Áreas →
Sectores → Empleados, con legajos completos: documentación, sueldo histórico, carrera, capacitaciones).
Implementa **6 roles** (superadmin, rrhh, directivo, jefe_area, jefe_sector, visor) con un sistema de
permisos granulares por capacidad (capability strings), más una flag transversal `isCalidad` para acceso
al módulo ISO. El sistema soporta **enmascaramiento de usuario** (impersonation) para soporte de
superadmin, **período fiscal 01/09 → 31/08**, y mantiene un **versionado de plantillas** con timeline.

---

## 2. Historial de versiones

La plataforma se desarrolló entre **noviembre de 2025 y mayo de 2026**, con un total de
**75 commits**. Hasta esta release no se usó versionado explícito, por lo que **se asignan
versiones SemVer retroactivamente** según el criterio formal del estándar:

- **MAJOR** (`vN.0.0`) → cuando un cambio **rompe compatibilidad** con datos, schemas,
  contratos de API o flujos vigentes; es decir, no se puede revertir trivialmente al
  estado anterior sin perder funcionalidad o información.
- **MINOR** (`v5.1.0`) → features nuevas que se suman sin romper lo anterior.
- **PATCH** (`v5.0.1`) → bugfixes, estabilización, refactors internos sin impacto en
  usuarios ni en datos.

Aplicando este criterio, la plataforma llega a la versión actual **v5.0.0**. Hubo **5 bumps
mayores** en estos seis meses, lo que refleja el ritmo de cambios estructurales típico de
una plataforma joven en producción interna.

> **Trazabilidad**: la lista detallada de los 75 commits con hash, fecha y autor se mantiene
> en el **Apéndice A** al final de este documento, para uso de auditoría interna.

### v0.1.0 — Bootstrap inicial (10 al 25 de noviembre de 2025)

Primera versión funcional. Se monta el esqueleto del sistema con las pantallas básicas:

- **Página de Evaluación**: visualización inicial del flujo de evaluar empleados, con
  filtros y agrupación de objetivos/aptitudes.
- **Legajo del empleado**: edición rápida desde tarjetas + página completa con tablas de
  carrera, capacitaciones, historial de sueldo y documentación.
- **Mi Desempeño**: gráfico de evolución y panel de conformidades.
- **Cierre RRHH**: pantalla dedicada para que RRHH cierre el flujo de evaluación de un
  empleado.
- Soporte inicial de **plantillas con scope** (área / sector / empleado), overrides
  consistentes entre vistas y validación de fecha-fin de objetivos.

22 commits. Sin release publicada — equivalente a una "alpha" interna.

### v1.0.0 — Modo acumulativo y atributos extendidos (1 al 4 de diciembre de 2025)

**Tipo: MAJOR** — el modelo de Plantilla y el modelo de evaluación de resultados cambiaron
de schema. Plantillas creadas en v0.x no son compatibles con la nueva lógica sin migración.

- Se incorpora el **modo acumulativo** para plantillas (evaluación por período además del
  modo simple).
- **Schema extendido**: se agregan atributos al modelo de plantilla y al modelo de
  evaluación de resultados.
- Rediseño del **Home**, privacidad en Legajo, control de acceso al Simulador.
- **Vista Gantt** de objetivos con visualización por estados y agrupación.
- **Permisos híbridos**: usuarios que son jefes de sector Y área a la vez.

13 commits.

### v2.0.0 — Bonos productivos + Tablero Ejecutivo (5 al 18 de diciembre de 2025)

**Tipo: MAJOR** — entra en producción el sistema de Bonos. Se introduce el modelo de
scoring (Snapshot) con pesos 70/30 y tope 100% — los datos de evaluación de v1.x no
producen bonos compatibles sin recalcular.

- **Perfil del empleado**: cada colaborador puede ver sus datos y editar email, teléfono y
  foto.
- **Customización del Home por rol**: oculta secciones de simulador / gestión de equipo
  para empleados sin rol jerárquico.
- **Implementación completa de Bonos**: cálculo con pesos 70/30, tope al 100%, snapshot
  de scores.
- Cierre de RRHH con alertas visuales y comentarios.
- **Página de Cálculo de Bono** y **Página de Resultados de Bono**.
- **Tablero Ejecutivo** para vista de dirección.
- Rediseño del **Navbar** y mejoras en Legajo.

24 commits.

### v2.0.1 — Estabilización y pre-producción (12 al 29 de enero de 2026)

**Tipo: PATCH** — sprint de bugfixes y ajustes visuales sin features nuevas ni cambios de
schema. La app pasa a ser usable en producción interna sin romper compatibilidad con v2.0.0.

8 commits, con mensajes genéricos del tipo "Cambios realizados 15-01", "Ultimos Cambios
16-01". **Recomendación retroactiva**: a partir de v5.0.0 se adopta Conventional Commits
(ver sección 2.9).

### v3.0.0 — Core de Desempeño y backend de scoring rebuilt (febrero de 2026)

**Tipo: MAJOR** — reescritura del motor de scoring en backend. Snapshots de bonos de v2.x
no son comparables con los de v3.x sin recálculo. Nuevos endpoints de analytics y
restauración con contratos propios.

- **Sistema de scoring** completo en backend, con módulos de **analytics** y
  **restauración**.
- Páginas dedicadas para **templates** y **departments**.
- Bases del módulo **ISO** (todavía como sub-módulo, sin dashboard).
- Endpoint de **analytics** independiente con autenticación propia por token.

4 commits, incluido uno grande (`0ec965d`) que toca todo el core.

### v4.0.0 — ISO Quality + Avisos + UI system-wide (marzo y abril de 2026)

**Tipo: MAJOR** — se introducen nuevos modelos (`ObjetivoISO`, `GlobalAviso`, `ProcesoISO`)
y se rehace el lenguaje visual de toda la plataforma. Componentes UI cambian de API
(props), formularios refactorizados — clientes/integraciones que dependieran del DOM o
de schemas viejos no son compatibles.

- **ISO Quality Dashboard** con seguimiento mensual automatizado.
- **Avisos globales** que se muestran a todos los usuarios al loguearse.
- **Formularios** de objetivos y aptitudes refactorizados.
- **Vista Gantt** del seguimiento de objetivos con lógica detallada de estados.
- Mejoras de **UI/UX** transversales en toda la plataforma.

3 commits — pocos en número pero cada uno con cambios muy grandes (estilo "release
commit").

### v4.0.1 — Hardening: rate limiting, tests, limpieza (18 de mayo de 2026)

**Tipo: PATCH** — refuerzos de seguridad y calidad interna sin features nuevas ni cambios
de schema.

- **Rate limiting** en el BonoBot (máx. 30 req/min) para mitigar abuso de la API de IA.
- Suite de **tests** del engine de scoring (jest).
- Limpieza de scripts de debug que estaban sueltos en el repo.
- Warning visual en formularios cuando hay cambios sin guardar.

1 commit (`82bcb12`).

### v5.0.0 — Filtros de desvinculados, AnalisisISO y refactor MiDesempeno (26 de mayo de 2026 — **release actual**)

**Tipo: MAJOR** — `GET /empleados` cambia su comportamiento por default: ahora excluye
desvinculados salvo que se pase `?incluirDesvinculados=true`. Cualquier cliente que asumía
recibir la nómina completa rompe sin actualizar la llamada. Lo mismo aplica a dashboards
de área/sector y a seguimiento, que dejan de contar desvinculados en los KPIs vigentes.

- **Filtros end-to-end de empleados desvinculados** en Nómina, Gestión de Personal,
  Dashboards, Seguimiento y cálculo de Bono. Se introduce el toggle "Incluir
  desvinculados" sólo visible para RRHH / Directivo / Super.
- **Página Análisis ISO** rediseñada: leyenda custom con referencia a Meta, área degradada
  bajo el avance acumulado, filtro de KPIs por proceso al expandir un proceso, eliminación
  del bloque "Justificación del Avance (Resumen)".
- **Modal de confirmación al desvincular** un empleado en el Legajo, con selector de fecha
  de desvinculación (defaultea a hoy, editable).
- **Refactor de Mi Desempeño**: split del archivo monolítico en `src/pages/MiDesempeno/`
  con `components/` y `hooks/`.
- **Footer** nuevo con información de versión y fecha de build inyectada por Vite.
- Banner de **modo enmascarado** (impersonation) con fallbacks correctos para mostrar el
  nombre real del usuario impersonado.

1 commit (`43ce5d2`). Esta versión también introduce las primeras dos piezas de
documentación interna: `docs/AUDITORIA.md` (este archivo) y `docs/GUIA_USO.md`, además del
versionado SemVer formal del repo (`APP_VERSION = "5.0.0"`).

---

### 2.9 Política de versionado de acá en adelante

A partir de v5.0.0 se adopta **SemVer** (`MAJOR.MINOR.PATCH`):

- **PATCH** (`5.0.1`): bugfixes que no cambian funcionalidad. Releases ad-hoc según se
  necesite.
- **MINOR** (`5.1.0`): features nuevas que **no rompen** flujos existentes (ej. agregar un
  campo opcional, una pantalla nueva, un toggle).
- **MAJOR** (`6.0.0`): cambios que rompen compatibilidad de datos o flujos (ej. modificar
  un schema de forma no retrocompatible, eliminar una pantalla, cambiar permisos por
  defecto, cambiar el default de un endpoint que ya usaban clientes).

**Mantener sincronizado** `APP_VERSION` en [src/lib/appInfo.js](../src/lib/appInfo.js) en
cada release. El Footer ya lo muestra automáticamente junto con la fecha de build.

**Mensajes de commit recomendados** (Conventional Commits):

| Prefijo | Cuándo usarlo |
|---|---|
| `feat:` | Feature nueva visible al usuario. |
| `fix:` | Corrección de bug. |
| `refactor:` | Cambio interno sin impacto funcional. |
| `chore:` | Mantenimiento (deps, configs, scripts). |
| `docs:` | Cambios en documentación. |
| `test:` | Agregado o modificación de tests. |
| `perf:` | Mejoras de performance. |

---

## 3. Cambios por módulo

A continuación se sintetiza la evolución de los grandes módulos en función del log y de la inspección de
código actual.

### 3.1 Nómina / Empleados / Legajo

- **Origen** (noviembre 2025): la nómina existió desde la primera versión con el modelo
  `backend/src/models/Empleado.model.js`. Contiene: datos personales (nombre, apellido, DNI, CUIL,
  domicilio, email, celular), datos laborales (puesto, fechaIngreso, antigüedad reconocida, área, sector),
  género, categoría, **estadoLaboral** (`VINCULADO` / `DESVINCULADO`), URL de CV y de foto.
- **Sueldo versionado**: subdocumento `sueldoBase` con `monto`, `moneda`, `vigenteDesde` y un array
  `historico` con cada cambio (commit `a36f39a` introduce el historial de sueldo y la documentación).
- **Legajo**: la página dedicada (`fb59909`, PR #3) agrega vista de carrera, capacitaciones, documentación
  y edición rápida desde las cards.
- **Filtros de desvinculados**: el último commit (`43ce5d2`, 26/05/2026) implementa filtros end-to-end por
  estado laboral en la lógica de nómina, evaluaciones y bono — es decir, las personas marcadas como
  `DESVINCULADO` quedan fuera de los cálculos por defecto.
- **Privacidad**: `8ed6e96` y `fe03db6` ocultan información sensible (chip de sueldo, accesos rápidos) a
  perfiles no-RRHH; los colaboradores pueden ver su propio legajo pero con campos reducidos
  (`eeb58aa`).

### 3.2 Evaluaciones (Plantillas + Asignaciones + Feedback)

- **Modelo de plantilla** (`backend/src/models/Plantilla.model.js`): soporta dos tipos (`objetivo` /
  `aptitud`), con scope (`area` / `sector` / `empleado`), frecuencia (`mensual` / `trimestral` /
  `semestral` / `anual`), `pesoBase`, metas con operadores y unidades, modo de acumulación
  (`periodo` vs `acumulativo`), regla de cierre (`promedio` / `umbral_periodos` / `cierre_unico`),
  versionado (campos `version`, `parentPlantillaId`, `estadoAprobacion`, `motivoVersion`,
  `comentarioVersion`) y fechas fiscales automáticas (01/09 → 31/08).
- **Página de evaluación** (`bb512d0`): primera versión funcional como página dedicada en lugar de modal.
- **Filtros y agrupación** (`4e35b01`): mejora de filtros y selección dentro de SEGUIMIENTO.
- **Modo acumulativo y por período** (`f206f34`, diciembre 2025): introduce los modos
  `periodo` y `acumulativo` con adaptación de todos los schemas. Es un cambio estructural relevante.
- **Cierre de evaluación por RRHH** (`ad9179f`): nueva página específica para que RRHH cierre el flujo.
- **Versionado de plantillas**: timeline visual (`VersionesTimelinePage.jsx`, `VersionesTimelineDialog.jsx`),
  con motivos y comentarios por versión.
- **Override de objetivos**: hay dos modelos relacionados (`EmployeeObjetiveOverride.js`,
  `OverrideObjetivo.model.js`) para personalizar pesos o metas por empleado, con corrección
  de visualización en commit `543ab1a`.

### 3.3 Mi Desempeño (vista del colaborador)

- **Origen**: surge con `2704dd4` (12/11/2025), enfocado en optimizar la vista del propio empleado con
  gráfico de evolución y conformidades.
- **Mejoras iterativas**: `7d2e078` y `01ac8ee` (mismo día, 05/12/2025) corrigen el gráfico, plazos y
  estilos. `8c1f0ef` arregla el orden de objetivos con la devolución del jefe.
- **Refactor mayo 2026**: el commit `43ce5d2` incluye un refactor de `MiDesempeno`; en working tree hay
  un directorio nuevo `src/pages/MiDesempeno/` (untracked) indicando que se está partiendo el monolito
  en sub-componentes.

### 3.4 Objetivos y Bono

- **Modelo BonoConfig** (`backend/src/models/BonoConfig.model.js`): por año, define escala
  (`lineal` o `tramos`), umbral, `maxPct` (% del sueldo), `bonoTarget` (multiplicador del sueldo) y
  `overrides` específicos por área o empleado. Auditoría con `updatedBy`.
- **Modelo BonoAnual** (`BonoAnual.model.js`): persiste el cálculo por empleado + año con snapshot
  congelado del contexto (puesto, área, sector, CUIL, DNI, ingreso), pesos (70/30 obj/comp por defecto),
  arrays de `objetivos` y `competencias`, resultado, `condiciones` (antigüedad, sanción, licencia),
  feedback y estado (`borrador` / `en_proceso` / `aprobado` / `pagado`). Índice único
  `(empleado, anio)`.
- **Cronología**:
  - `3371c4c` (10/12/2025) - Implementación completa del flujo de bonos + rediseño Navbar.
  - `15ae792` (12/12/2025) - Alineación de Score Bono con Feedback: pesos 70/30, tope 100%, lógica
    de snapshot.
  - `e490858` (15/12/2025, PR #16) - Página de Cálculo de Bono.
- **Simulador de objetivos** (`SimuladorObjetivos.jsx`) - permite proyectar resultados sin tocar la BD.

### 3.5 ISO de Calidad

- **Modelo ObjetivoISO** (`backend/src/models/ObjetivoISO.model.js`): por año, con
  `codigo`, `nombre`, `representante` (empleado), `meta` (porcentaje), `unidadMeta`, `operador`
  (`=`, `>`, `<`), `progreso`, `desarrollo` y un array `seguimientoMensual` con `{ mes, year, progreso,
  resultadoMes, comentario, adjunto }`.
- **Procesos ISO**: modelo aparte (`ProcesoISO.model.js`) y rutas dedicadas (`procesosISO.routes.js`).
- **Cronología**:
  - `0ec965d` (20/02/2026) - Páginas iniciales de ISO + analytics + scoring backend.
  - `3c0a10b` (14/04/2026) - **ISO Quality Dashboard** con tracking mensual automático y mejoras UI/UX.
  - `43ce5d2` (26/05/2026) - Mejoras `AnalisisISO`.
- **Acceso**: rutas `/gestion-iso` y `/analisis-iso` requieren `superadmin` o flag `isCalidad=true`
  (ver App.jsx líneas 247-262).
- **Carga mensual**: componente `ModalCargaAvanceISO.jsx` para registrar avance de cada mes.

### 3.6 Avisos globales (GlobalAviso)

- Introducido en `d3db2f2` (10/03/2026).
- Modelo `GlobalAviso.model.js`: título, mensaje, **alcance** (`GLOBAL` / `AREA` / `SECTOR`) con
  `targetId` dinámico, `fechaInicio`, `fechaFin`, `tipo` (`RRHH` / `SISTEMAS`), `activo`,
  `creadoPor`.
- Página `GestionAvisos.jsx` para CRUD, ruta `/gestion-avisos` (solo superadmin / directivo / rrhh).

### 3.7 Sistemas / Auth / Usuarios

- **JWT** con secreto en `process.env.JWT_SECRET` y cache en memoria de 15 segundos por token
  (`auth.middleware.js` líneas 29-30).
- **Modelo Role** (`Role.model.js`) - persistido en BD, `seedRoles.js` carga los 6 roles base la primera vez.
- **Permisos granulares**: el seed asigna capabilities tipo `nomina:ver`, `objetivos:editar`, etc., con
  soporte de wildcard (`nomina:*`).
- **Referente** (`auth.middleware.js` líneas 96-128): si un empleado figura como `referente` en alguna
  Área o Sector, el sistema extiende sus permisos automáticamente y eleva su `rolEfectivo` a
  `jefe_area` o `jefe_sector` aunque su rol grabado sea `visor`. Esta es una decisión clave para no
  duplicar usuarios.
- **Impersonation / Modo enmascarado**: `whoami` (líneas 225-313) soporta que un superadmin se haga
  pasar por otro usuario pasando `?empleadoId=...`. El frontend (`App.jsx` líneas 93-113) muestra una
  barra rosa fija arriba del navbar con el botón "Volver a modo Admin".
- **Página Sistemas** (`/sistemas`): combina pestañas de Usuarios, Roles, panel de **auditoría de scores**
  (recalcula scores en vivo y los compara con la BD), gestión de backups y restauración por colecciones.
- **Inactividad**: `useInactivityTimer(handleInactivity, 600_000, authed)` desloguea automáticamente a
  los 10 minutos sin actividad.

### 3.8 BonoBot (asistente IA)

- Backend `bot.routes.js`, integración con **Groq SDK** (`groq-sdk: ^1.1.1`).
- Limitado a 30 req/min por IP (`botLimiter`).
- Componente frontend `BonoBot/BonoBot.jsx` montado globalmente en `App.jsx`.

---

## 4. Decisiones técnicas clave

### 4.1 Autenticación y autorización

- **JWT firmado con HS256** (default de `jsonwebtoken`) usando `process.env.JWT_SECRET`.
- **Cache en memoria** de los `req.user` resueltos durante 15 segundos por token (línea 30 de
  `auth.middleware.js`) - reduce queries a la DB en ráfagas. Se invalida explícitamente al cambiar
  rol/`isCalidad` vía `invalidateUserCacheByUserId()`.
- **Tres niveles de control**:
  1. `requireCap(cap)` - chequea capability granular.
  2. `requireRole(...roles)` - chequea rol efectivo o slug.
  3. `requireCapOrSelf(cap)` - permite acceso a recursos propios del empleado.
- **Wildcards**: `matchCap` (línea 13) soporta `*` global, capability exacta y prefijo `modulo:*`.
- **Anónimo controlado**: usuarios sin token quedan con `rol=visor` y `permisos=[]`.

### 4.2 Rate limiting

Definido en `backend/src/middleware/rateLimiter.middleware.js`:

| Limiter             | Endpoint            | Ventana   | Máx requests | Notas                                         |
|---------------------|---------------------|-----------|--------------|-----------------------------------------------|
| `loginLimiter`      | `/api/auth/login`   | 15 min    | 10           | No cuenta exitosos (`skipSuccessfulRequests`) |
| `forgotPasswordLimiter` | forgot-password | 60 min    | 5            | Cuenta todos los intentos                     |
| `botLimiter`        | `/api/bot`          | 1 min     | 30           | Protege contra spam al asistente Groq         |

- Headers `draft-7` de RateLimit-* habilitados.
- `keyGenerator` usa `req.ip` (requiere `app.set('trust proxy', 1)` en producción detrás de proxy).

### 4.3 Sistema de permisos por roles

Los permisos están definidos en `backend/seedRoles.js`:

- `superadmin` → `["*"]` (todo).
- `rrhh` y `directivo` → caps completas sobre estructura, nómina, objetivos, aptitudes, asignaciones,
  evaluaciones RRHH y usuarios.
- `jefe_area` → ver/editar/evaluar nómina, objetivos, aptitudes y asignaciones.
- `jefe_sector` → similar a `jefe_area` pero sin `objetivos:editar` ni `aptitudes:editar`.
- `visor` → sólo lectura básica (`estructura:ver`, `nomina:ver`, `aptitudes:ver`).
- Flag transversal **`isCalidad`** en `Usuario.model.js` da acceso al módulo ISO independientemente del
  rol.

### 4.4 Snapshots y auditoría

- **Snapshot de bono** (`BonoAnual.snapshot`): congela puesto/área/sector/CUIL/DNI/fechaIngreso al
  momento del cálculo para que mover al empleado luego no altere el bono ya pagado.
- **Snapshot de scores**: hay archivos `backend/snapshot_scores_before.json` y
  `backend/snapshot_scores_after.json` (untracked) que se usan para verificar la consistencia de scores
  antes/después de cambios masivos (commits que mencionan "scoring alignment").
- **Auditoría de Score** (panel en `Sistemas.jsx`): recalcula scores en vivo y los compara con BD para
  detectar discrepancias. Permite arreglar registros desalineados.
- **Versionado de plantillas**: cada modificación crea un nuevo documento con `parentPlantillaId`,
  conservando el historial completo (ver `VersionesTimelinePage.jsx`).

### 4.5 Backups automáticos

- En `server.js` líneas 53-62: cron job diario a las **03:00 AM** (`cron.schedule('0 3 * * *', ...)`).
- Llama a `runBackup()` de `backend/scripts/backup.js`.
- Carpeta destino: `backend/backups/`.
- Restauración disponible desde la página `/sistemas` (modal con doble confirmación y opción de elegir
  colecciones específicas o restaurar todo - ver `Sistemas.jsx` línea 606).

### 4.6 Año fiscal

- Definido en `backend/src/models/Plantilla.model.js` líneas 7-13.
- **Inicio**: 1 de septiembre del año `year`.
- **Fin**: 31 de agosto del año `year + 1` (23:59:59.999).
- Los períodos se generan automáticamente según la frecuencia (mensual → `2025M09`, `2025M10`, ...;
  trimestral → `2025Q1`, `2025Q2`, ...; semestral → `2025S1`, `2025S2`; anual → `2025A1`).

### 4.7 Analytics API independiente

- Montada en `/api/analytics` **antes** del middleware JWT global (server.js línea 177).
- Usa un token propio (`X-Analytics-Token`) en lugar de JWT.
- Está pensada para que **Power BI** consuma los datos sin necesidad de loguearse como usuario.
- Documentación Swagger en `/api/docs` con spec dinámico (incluye enum de empleados actualizado en
  cada llamada para facilitar pruebas).

### 4.8 Inactividad y seguridad de sesión

- Auto-logout a los **10 minutos** sin actividad (`useInactivityTimer` en `App.jsx` línea 58).
- Overlay bloqueador con CTA para reloguear.
- Si está en modo enmascarado, se detiene la impersonation antes de cerrar sesión.

### 4.9 Subida de archivos

- `multer` con almacenamiento local en `backend/uploads/` (servido público vía
  `express.static('/uploads')`).
- Filtro `'Solo imágenes'` para fotos de empleado.
- Manejo centralizado de errores Multer (`LIMIT_FILE_SIZE` → 413, `LIMIT_UNEXPECTED_FILE` → 400).
- Existe `cloudinary` en `package.json` del frontend (versión 2.7.0) - sospechosamente sin uso visible
  en código, posiblemente legacy.

### 4.10 Lazy loading del frontend

- Todas las páginas se importan con `React.lazy` (líneas 15-40 de `App.jsx`).
- `<Suspense fallback={<Spinner />}>` envuelve el `<Routes>`.
- Reduce el bundle inicial.

---

## 5. Riesgos / TODOs visibles

### 5.1 TODO/FIXME hallados en el código

| Archivo                                  | Línea | Comentario                                                                                              |
|------------------------------------------|-------|---------------------------------------------------------------------------------------------------------|
| `backend/src/routes/roles.routes.js`     | 78    | `TODO: Verificar si hay usuarios usando este rol antes de borrar` (rol huérfano si se borra)            |
| `backend/src/controllers/auth.controller.js` | 95 | `TODO: disparar email al usuario con la contraseña temporal o preferible: link de invitación`            |
| `src/utils/calculos.js`                  | 231   | `CÁLCULO FINAL ESTRICTO (ADAPTATIVO - TODO O NADA AL CIERRE)` (regla de negocio comentada)             |
| `backend/src/lib/recalculoEmpleado.js`   | 16    | `Recalcula TODO el año de un empleado` (operación costosa, considerar throttling)                      |

### 5.2 Archivos sueltos en working tree (no commiteados)

```
?? backend/create_snapshot.js
?? backend/snapshot_scores_after.json
?? backend/snapshot_scores_before.json
?? src/components/Footer.jsx
?? src/lib/appInfo.js
?? src/pages/MiDesempeno/
```

- `Footer.jsx` y `appInfo.js` ya se usan en `App.jsx` (import line 6 y 7) - convendría incluirlos en el
  próximo commit para no perderlos.
- `MiDesempeno/` es un directorio de descomposición del monolito - confirmar si está incompleto
  antes de mergear.
- Los snapshots de scoring son útiles como verificación puntual pero **no deberían commitearse** porque
  pueden contener datos productivos.

### 5.3 Archivos legacy / posibles a limpiar

En la raíz del repo aparecen:

- `debug_cecilia_discrepancy.js` - script de debug puntual.
- `test_hitos.js`, `test_sim.json` - tests ad-hoc.
- `estructura.txt`, `git status` (archivo con nombre raro), `deps.dot`, `graph.png`, `components.png`,
  `frontend-map.png`, `full-map.svg`, `backend-map.svg` - artefactos de mapeo y exploración.
- `ad`, `z` - archivos con nombre de un carácter, posiblemente accidentales.
- Carpeta `backend/debug_archive/` y `backend/query/` - artefactos de debug.

El commit `82bcb12` ("limpieza de scripts") ya empezó a depurar; falta una pasada más.

### 5.4 Riesgos de configuración / producción

- **CORS dinámico** (server.js líneas 67-84): en desarrollo se permite todo cuando `CORS_ORIGIN` está
  vacío. En producción la whitelist debe estar bien definida o se cae en `Not allowed by CORS`.
- **`trust proxy`** no se configura explícitamente - **necesario** si la app va detrás de Nginx /
  Railway / Render para que el rate limiter use la IP real y no la del proxy.
- **JWT_SECRET**: no hay verificación al arranque de que la variable exista. Si falta, el servidor
  igual arranca y todos los `jwt.verify` fallarán con `Token inválido o expirado`.
- **Cache de usuario de 15 s**: si se cambia el `isCalidad` o el rol y no se invalida con
  `invalidateUserCacheByUserId`, hay hasta 15 segundos donde el usuario sigue con sus permisos viejos.
  Hay invalidación explícita en algunos puntos del código - convendría auditar que cubra todos los
  cambios de permisos.
- **Modelo dual `Usuario`/`User`** (líneas 95-100 de `Usuario.model.js`): se registra el mismo schema
  con dos nombres. Funciona, pero es frágil si Mongoose cambia su comportamiento.
- **Sin restricción de tamaño de body** explícita en Express - usa el default de `express.json()`.
  Recomendable agregar `{ limit: '10mb' }` o similar.
- **Backups locales únicamente** (`backend/backups/`): si el disco se corrompe, se pierde todo.
  Recomendado replicar a S3/cloud.

### 5.5 Riesgos funcionales / regulatorios

- **Datos personales en uploads** (`/uploads` es **público sin JWT**, server.js línea 88). Si se suben
  documentos personales (CV, DNI, contratos), cualquiera con la URL puede descargarlos. **Crítico de
  revisar** desde el punto de vista de Ley 25.326 (protección de datos personales).
- **Snapshots con datos**: los archivos `snapshot_scores_*.json` no deberían commitearse (contienen
  IDs de empleados y scores reales).
- **Borrado de roles** (`roles.routes.js` línea 78): si un superadmin borra un rol custom usado por
  usuarios, esos usuarios quedan con `rolePerms = []` (warning en consola pero sin bloqueo).
- **Modo enmascarado**: no hay log de auditoría visible al impersonar - cualquier acción que haga el
  superadmin queda atribuida al usuario enmascarado en los timestamps de Mongoose. Sería deseable
  registrar `impersonatedBy` en cada acción.

### 5.6 Cosas explícitamente marcadas como "Diseño a mejorar" en commits

- `ad9179f` (13/11/2025): "Se agrega pagina para rrhh para cerrar el flujo de evaluacion, completa,
  funcional. **Diseño a mejorar**".
- `1634f3f` (16/12/2025): "**RECOVERY POINT** - Saved surviving local changes" - indica que hubo un
  evento de pérdida parcial de cambios locales.
- `82bcb12` (18/05/2026): "tests de engine y warning en form" - implica que aún hay un warning visible
  en formulario sin resolver del todo.

### 5.7 Cobertura de tests

- Existe `backend/jest.config.js` y `backend/tests/` (mencionado en commit `82bcb12`: "tests de
  engine").
- **No hay tests en el frontend** (no figura jest/vitest en `package.json` raíz).
- Cobertura aparente baja - sólo se testea el engine de scoring.

---

## 6. Inventario de modelos Mongoose

(Para referencia rápida del auditor)

| Modelo                     | Archivo                                              | Propósito                                            |
|----------------------------|------------------------------------------------------|------------------------------------------------------|
| `Usuario`                  | `models/Usuario.model.js`                            | Cuentas de acceso. Vinculado 1:1 con Empleado.       |
| `Empleado`                 | `models/Empleado.model.js`                           | Datos personales + sueldo versionado + estado laboral.|
| `Area`                     | `models/Area.model.js`                               | Áreas con referentes.                                |
| `Sector`                   | `models/Sector.model.js`                             | Sectores con referentes.                             |
| `Role`                     | `models/Role.model.js`                               | Roles con capabilities persistidas.                  |
| `Plantilla`                | `models/Plantilla.model.js`                          | Objetivo o aptitud, con versionado + período fiscal. |
| `Objetivo`                 | `models/Objetivo.model.js`                           | Objetivo individual.                                 |
| `ObjetiveTemplate`         | `models/ObjetiveTemplate.js`                         | Plantilla genérica de objetivo (legacy/alterna).     |
| `OverrideObjetivo`         | `models/OverrideObjetivo.model.js`                   | Override de pesos/metas a nivel objetivo.            |
| `EmployeeObjetiveOverride` | `models/EmployeeObjetiveOverride.js`                 | Override por empleado.                               |
| `EmployeeSector`           | `models/EmployeeSector.js`                           | Relación N:M empleado-sector (si aplica).            |
| `Aptitud`                  | `models/Aptitud.model.js`                            | Competencia / aptitud.                               |
| `Evaluacion`               | `models/Evaluacion.model.js`                         | Resultado de una evaluación.                         |
| `Feedback`                 | `models/Feedback.model.js`                           | Feedback periódico empleado-jefe.                    |
| `ParticipacionEmpleado`    | `models/ParticipacionEmpleado.model.js`              | Participación de empleado en plantilla.              |
| `BonoConfig`               | `models/BonoConfig.model.js`                         | Config anual del bono.                               |
| `BonoAnual`                | `models/BonoAnual.model.js`                          | Bono calculado por empleado/año.                     |
| `GlobalAviso`              | `models/GlobalAviso.model.js`                        | Avisos para toda la nómina o segmentos.              |
| `AppFeedback`              | `models/AppFeedback.model.js`                        | Feedback de los usuarios sobre la app.               |
| `ObjetivoISO`              | `models/ObjetivoISO.model.js`                        | Objetivo del sistema de calidad ISO.                 |
| `ProcesoISO`               | `models/ProcesoISO.model.js`                         | Proceso ISO.                                         |
| `Incidencia`               | `models/Incidencia.model.js`                         | Incidencia / mejora reportada.                       |
| `Carrera`                  | `models/Carrera.model.js`                            | Carrera del empleado.                                |
| `Capacitacion`             | `models/Capacitacion.model.js`                       | Capacitaciones cursadas.                             |
| `Documento`                | `models/Documento.model.js`                          | Documentos del legajo.                               |

---

## 7. Recomendaciones para próximas iteraciones

1. **Mover `/uploads` detrás de JWT** o usar URLs firmadas - documentos privados no deberían ser
   públicos.
2. **Auditar log de impersonation**: persistir cada acción hecha en modo enmascarado con
   `impersonatedBy` y `impersonatedAt`.
3. **Aumentar cobertura de tests** especialmente en `recalculoEmpleado.js`, scoring de aptitudes y
   cálculo de bono (donde ya hubo bugs según commits `449f785` y `15ae792`).
4. **Setear `trust proxy`** explícito en server.js antes del rate limiter.
5. **Limpiar archivos de raíz** (`ad`, `z`, `git status`, `estructura.txt`, etc.).
6. **`.gitignore`** debería excluir `snapshot_scores_*.json` y la carpeta `backend/backups/`.
7. **Documentar política de retención de backups**: actualmente se generan diarios sin rotación visible.
8. **README real** - el `README.md` actual es la plantilla por defecto de Vite, no hay instrucciones de
   levantar el proyecto.
9. **Validar JWT_SECRET y MONGO_URI** al arranque y abortar si faltan.
10. **Considerar partir el monolito de `MiDesempeno`** - ya hay un directorio nuevo iniciado;
    completar la refactorización.

---

## Apéndice A — Trazabilidad de commits

Listado completo de commits (sin merges) ordenados de **más reciente a más antiguo**, para
uso de auditoría interna y trazabilidad fina. Total: **54 commits relevantes** (los 21
restantes hasta 75 son merges automáticos de pull requests).

| Hash | Fecha | Autor | Mensaje |
|------|-------|-------|---------|
| 43ce5d2 | 2026-05-26 | Shootemotion | feat: filtros de desvinculados end-to-end, mejoras AnalisisISO y refactor MiDesempeno |
| 82bcb12 | 2026-05-18 | Shootemotion | chore: limpieza de scripts, rate limiting, tests de engine y warning en form |
| 3c0a10b | 2026-04-14 | Shootemotion | feat: implement ISO Quality Dashboard, automated monthly tracking, and system-wide UI/UX improvements |
| d3db2f2 | 2026-03-10 | Bruno Cleri | feat: Implement performance management system with objective and aptitude forms, global notices, and a dashboard |
| 24e143d | 2026-03-09 | Bruno Cleri | feat: Implement performance tracking Gantt view with detailed status logic and add email utility for user credentials |
| 542f67c | 2026-02-27 | Bruno Cleri | Ultimos Cambios 27-02 |
| 0ec965d | 2026-02-20 | Bruno Cleri | feat: Implement core performance management system with pages for templates, departments, ISO, and performance, along with backend services for scoring, analytics, and data restoration |
| 9d12b63 | 2026-02-09 | Bruno Cleri | Ultimos_Cambios_09_02 |
| f325fc3 | 2026-02-09 | Bruno Cleri | Ultimos_Cambios_09_02 |
| f9f3357 | 2026-01-29 | Bruno Cleri | Version Actualizada al 29_01 |
| 7e8a052 | 2026-01-16 | Bruno Cleri | Ultimos Cambios 16-01 |
| 1631a51 | 2026-01-15 | Bruno Cleri | Cambios Realizados 15_01 |
| 7e697e1 | 2026-01-12 | Bruno Cleri | Cambios realizados al 12/01 |
| f5b3dad | 2026-01-12 | Bruno Cleri | Cambios realizados el 12-01 |
| d9cb99b | 2026-01-12 | Bruno Cleri | Cambios desde Home Office |
| f4fa318 | 2026-01-12 | Bruno Cleri | Ultimos cambios realizados Pre produccion |
| 49d2459 | 2025-12-29 | Bruno Cleri | Feat: Se agregaron cambios varios |
| ee68e5f | 2025-12-23 | Bruno Cleri | Cambios_varios_realizados |
| 8709126 | 2025-12-18 | Bruno Cleri | Refactor UI: Fix Feedback Syntax, Logic & Footer Redundancy |
| 707cd8a | 2025-12-17 | Bruno Cleri | feat: Creacion Pag Tablero Ejecutivo |
| 1634f3f | 2025-12-16 | Bruno Cleri | chore: RECOVERY POINT - Saved surviving local changes (Legajo, etc) |
| 9c63f2e | 2025-12-15 | Bruno Cleri | fix: Arreglos Visuales y de sintaxis |
| e490858 | 2025-12-15 | Bruno Cleri | feat: Creacion pagina Calculo de bono |
| e9d9683 | 2025-12-12 | Bruno Cleri | fix: ocultar feedback en años sin objetivos y limpieza de logs |
| 15ae792 | 2025-12-12 | Bruno Cleri | Fix: Alineación cálculo Score Bono con Feedback (pesos 70/30, tope 100%, lógica snapshot) y mejora UI |
| 3371c4c | 2025-12-10 | Bruno Cleri | Implementación completa de Bonos, rediseño de Navbar y mejoras en Legajo |
| fe03db6 | 2025-12-09 | Bruno Cleri | fix: hide salary chip and quick access for non-HR in profile |
| 68c4b24 | 2025-12-09 | Bruno Cleri | feat: customize home view for employees (hide simulator/team management) |
| eeb58aa | 2025-12-09 | Bruno Cleri | feat: allow employees to view profile and edit basic info (email, phone, photo) |
| bf687f7 | 2025-12-09 | Bruno Cleri | feat: enhance HR feedback closing with visual alerts, correct score logic, and Spanish comments |
| 01ac8ee | 2025-12-05 | Bruno Cleri | Mejoras en Mi Desempeño: corrección de gráfico, plazos y estilos |
| 7d2e078 | 2025-12-05 | Bruno Cleri | Mejoras en Mi Desempeño: corrección de gráfico, plazos y estilos |
| fc415e4 | 2025-12-04 | Bruno Cleri | Fix: Permisos híbridos (Jefe Sector + Área) y agrupación visual en Gantt |
| 5350a4f | 2025-12-04 | Bruno Cleri | Ajustes en Estados de Feedback y Visualización Gantt |
| 449f785 | 2025-12-04 | Bruno Cleri | fix: evaluation scoring, competency saving, and feedback UI |
| 996e26b | 2025-12-03 | Bruno Cleri | feat: update feedback flow states, integrate tabs in filter bar, and add legend |
| 8ed6e96 | 2025-12-03 | Bruno Cleri | refactor: Home redesign, Legajo privacy, Simulator access, Feedback fixes |
| b086385 | 2025-12-01 | Bruno Cleri | feat: Se Agregan Atributos al Schema con la ultima documentacion y modelo de evaluacion de resultados |
| f206f34 | 2025-12-01 | Bruno Cleri | feat: Se agrega Modo Acumulativo y por periodo, se adaptan todos los schemas y la forma de evaluar |
| 06eaefa | 2025-11-25 | Bruno Cleri | fix: EvaluacionFlujo filtering logic, syntax errors and GanttView updates |
| 6793d5b | 2025-11-19 | Bruno Cleri | feat: Se agrega fecha fin de objetivos, se fixea la fecha frecuencia para los hitos |
| 543ab1a | 2025-11-19 | Bruno Cleri | fix: Se corrigen los override, se ven igual en todas las paginas |
| f062988 | 2025-11-19 | Bruno Cleri | fix: Se arregla pagina de evaluacion de RRHH y error en carga de legajo |
| 8c1f0ef | 2025-11-18 | Bruno Cleri | fix: Se arregla bug que no permitia ver al colaborador los objetivos de manera ordenada |
| c065ea8 | 2025-11-13 | Bruno Cleri | refactor: Se corrige Scope, orden, imagen del Home |
| 9edebc3 | 2025-11-13 | Bruno Cleri | fix: Se arreglan listas desplegables, Usuarios sin visualizacion, Scope para carga de plantillas |
| ad9179f | 2025-11-13 | Bruno Cleri | perf: Se agrega pagina para RRHH para cerrar el flujo de evaluacion |
| 2704dd4 | 2025-11-13 | Bruno Cleri | perf: Se optimiza pagina desempeño, se agrega grafico de evolucion |
| a36f39a | 2025-11-12 | Bruno Cleri | feat: Agrega Tablas de carrera y capacitaciones, historial de sueldo y documentacion |
| fb59909 | 2025-11-12 | Bruno Cleri | feat: Agrega Pagina Legajo, Funcional |
| 2a0dcc3 | 2025-11-12 | Bruno Cleri | perf: Se mejora visualizacion, se eliminan redundancias y se crea el calculo de Resultado Global |
| 4e35b01 | 2025-11-11 | Bruno Cleri | fix: Filtros, agrupacion y seleccion de objetivos/aptitudes en pagina SEGUIMIENTO |
| 15aabb2 | 2025-11-11 | Bruno Cleri | feat: Se mejora visualizacion pagina Evaluacion |
| bb512d0 | 2025-11-10 | Bruno Cleri | feat: NuevaPag_Evaluacion |
| 2ebc8bc | 2025-11-10 | Bruno Cleri | init: primera versión del proyecto |

> Para obtener este listado actualizado en cualquier momento:
> `git log --all --date=short --pretty=format:"| %h | %ad | %an | %s |" --no-merges`

---

## Apéndice B — Comandos útiles de auditoría

```bash
# Inventario de commits (sin merges, formato tabla markdown)
git log --all --date=short --pretty=format:"| %h | %ad | %an | %s |" --no-merges

# Buscar TODOs activos
grep -rni "TODO\|FIXME\|HACK" backend/src src

# Listar modelos Mongoose
ls backend/src/models

# Ver rutas Express
ls backend/src/routes

# Verificar cron jobs
grep -rn "cron.schedule" backend

# Ver dependencias críticas
cat backend/package.json
cat package.json
```

---

*Documento generado para uso interno de Diagnos S.A. — Auditoría técnica de la Plataforma de Desempeño v5.0.0 (mayo de 2026).*
