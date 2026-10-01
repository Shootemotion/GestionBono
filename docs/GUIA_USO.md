# Guía de uso - Plataforma de Desempeño

> Manual funcional para usuarios finales de la Plataforma de Desempeño de Diagnos S.A.
> Versión `5.2`. Soporte: `sistemas@diagnos.com.ar`.
> Ámbito: gestión integral del ciclo anual de evaluación de desempeño, bono anual y seguimiento del
> sistema de calidad ISO.

---

## 1. ¿Qué es?

La **Plataforma de Desempeño** es la herramienta interna de Diagnos S.A. donde se ejecuta el ciclo
anual de evaluación de cada colaborador. Permite definir objetivos por área, sector o persona, asignarles
pesos, cargar avances en cada período (mensual, trimestral, semestral o anual), evaluar competencias
("aptitudes"), generar feedbacks periódicos jefe-colaborador, calcular el bono anual y, en paralelo,
hacer el seguimiento de los objetivos del sistema de calidad ISO. Todo bajo un período fiscal que va del
**1 de septiembre al 31 de agosto del año siguiente**.

---

## 2. Roles y accesos

Hay **6 roles** definidos en el sistema (ver `backend/src/models/Usuario.model.js` y el seed
`backend/seedRoles.js`):

| Rol            | Nombre visible      | Qué puede hacer                                                                                                                                                                |
|----------------|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `superadmin`   | Super Admin         | Acceso total. Único que puede entrar a `/sistemas`, gestionar usuarios y roles, hacer backups/restore, y usar el **modo enmascarado** para hacerse pasar por otro usuario.    |
| `directivo`    | Directivo           | Visión global, gestión estratégica. Mismas caps que RRHH para estructura, nómina, objetivos, aptitudes y cierre de evaluaciones.                                              |
| `rrhh`         | Recursos Humanos    | Gestiona toda la nómina, crea/edita/elimina empleados, define plantillas, configura el bono, publica avisos globales, cierra y reabre flujos de evaluación.                   |
| `jefe_area`    | Jefe de Área        | Ve y edita la nómina de su área, define y edita objetivos y aptitudes de su gente, asigna plantillas y evalúa.                                                                |
| `jefe_sector`  | Jefe de Sector      | Ve la nómina de su sector y evalúa. Puede editar nómina y asignaciones pero **no** crear/editar objetivos ni aptitudes (sólo verlos).                                          |
| `visor`        | Visor               | Sólo lectura básica: ver estructura, ver nómina, ver aptitudes.                                                                                                                |

### Flag transversal `isCalidad`

Independiente del rol, un usuario puede tener la **flag `isCalidad`** activada (campo booleano en
`Usuario`). Esto le da acceso al módulo de **Gestión ISO** (`/gestion-iso` y `/analisis-iso`) sin
necesidad de ser superadmin. Está pensado para el equipo de Calidad que no son superadmins pero
necesitan administrar los objetivos ISO.

### "Referente" - rol efectivo

Si un colaborador (aunque su rol sea `visor`) figura como **referente** en alguna Área o Sector, el
sistema automáticamente:

- Le extiende permisos de `nomina:ver/evaluar/editar/crear`, `objetivos:ver/editar`,
  `aptitudes:ver/editar`.
- Eleva su rol efectivo a `jefe_area` (si es referente de un área) o `jefe_sector` (si lo es de un
  sector).

Esto permite que un empleado actúe como jefe sin tener que tocar su rol grabado en la BD.

### Modo enmascarado (impersonation)

Sólo los **superadmin** pueden activar el modo enmascarado desde `/sistemas`. Cuando lo hacen:

- Aparece una barra rosa fija arriba indicando "MODO ENMASCARADO: Viendo como [Nombre del usuario]".
- Todas las pantallas muestran la vista tal cual la vería ese usuario.
- Para salir, click en **"Volver a modo Admin"** o esperar a que se cierre la sesión por inactividad
  (10 minutos).

### Cierre de sesión automático

Después de **10 minutos sin actividad**, la sesión se cierra sola y aparece un overlay con CTA para
volver a iniciar sesión. Esto aplica a todos los roles.

---

## 3. Módulos principales

### 3.1 Mi Espacio / Mi Desempeño - `/mi-desempeno`

**¿Para qué sirve?** Es la vista personal del colaborador. Ahí ve sus objetivos asignados, las metas que
le pusieron, los plazos de cierre, los avances ya cargados y los feedbacks de sus jefes. Tiene un
gráfico de evolución de resultados a lo largo del año fiscal.

**¿Quién lo usa?** Cualquier colaborador autenticado. La ruta no tiene restricción de rol (cualquier
`RequireAuth` autenticado puede entrar).

**Flujo típico:**

1. El colaborador entra a la plataforma con su usuario y password.
2. Desde el Home, click en la card **"Mi Desempeño"** o en el ítem de menú homónimo.
3. Ve sus objetivos del año fiscal vigente, agrupados por frecuencia (mensual/trimestral/etc.).
4. En cada objetivo puede ver: meta esperada, peso, modo (período / acumulativo), avances cargados por
   su jefe y los comentarios.
5. La sección de **conformidades** muestra las devoluciones de su jefe y permite confirmarlas
   (commit `2704dd4`).
6. El gráfico de evolución muestra el score global por período.

**Pantallas involucradas:**

- `/mi-desempeno` → componente `src/pages/MiDesempeno.jsx` (y el directorio nuevo
  `src/pages/MiDesempeno/` para sub-componentes).
- `/nomina/legajo/:id` → su propio legajo (modo reducido: sin sueldo, sin acceso rápido al equipo).

---

### 3.2 Gestión de Personal / Nómina

Tres rutas relacionadas:

- `/gestion-estructura` - vista de la estructura (Áreas → Sectores → Empleados). Acceso:
  `superadmin`, `directivo`, `rrhh`, `jefe_area`, `visor` y referentes.
- `/nomina` - listado plano de empleados. Acceso: `superadmin`, `directivo`, `rrhh`.
- `/nomina/legajo/:id` - legajo individual completo. Acceso: cualquier autenticado (la página filtra
  internamente qué muestra según el rol).

**¿Para qué sirve?** Ver y mantener al día la base completa de empleados de la empresa: datos
personales, datos laborales, historial de sueldo, documentación, carrera y capacitaciones.

**¿Quién lo usa?**

- **RRHH y Directivos**: alta/baja/modificación de empleados, edición de sueldo, carga de
  documentación.
- **Jefes de área**: ven a su gente, pueden hacer ediciones limitadas.
- **Colaboradores**: ven sólo su propio legajo, con campos reducidos. Pueden editar datos básicos
  (email, teléfono, foto - commit `eeb58aa`).

**Flujo típico (alta de empleado):**

1. RRHH entra a `/nomina`.
2. Click en "Nuevo empleado" o usa el formulario rápido.
3. Carga datos personales (nombre, apellido, DNI, CUIL, domicilio, email, celular, género).
4. Define datos laborales: fecha de ingreso, antigüedad reconocida, puesto, área y opcionalmente
   sector y categoría.
5. Carga foto y CV (opcional, sube a `/uploads`).
6. Define sueldo base (`sueldoBase.monto`, `moneda`, `vigenteDesde`). Cada cambio queda en el
   `historico`.
7. Guarda. El empleado queda en estado `VINCULADO` por defecto.

**Flujo típico (legajo completo):**

1. Click en la card del empleado o en su nombre en cualquier listado.
2. Se abre `/nomina/legajo/:id` con tabs:
   - **Datos personales** (editable según permisos).
   - **Sueldo** (sólo RRHH ve el chip de sueldo y el historial).
   - **Carrera** - historial de puestos.
   - **Capacitaciones** - cursos hechos.
   - **Documentación** - PDFs y archivos subidos.

**Pantallas involucradas:** `GestionNomina.jsx`, `GestionEstructura.jsx`, `Nomina.jsx`,
`LegajoEmpleado.jsx`, `GestionDepartamentos.jsx`.

---

### 3.3 Plantillas de Evaluación - `/plantillas` y `/asignaciones`

**¿Para qué sirve?** Definir qué se evalúa y con qué regla. Una **plantilla** describe un objetivo o
una aptitud en dos niveles: **qué se mide** (el enunciado, a quién aplica, cuánto vale) y **cómo se
mide** (sus metas: unidad, valor esperado, reglas de cierre). Una **asignación** vincula esa
plantilla con las personas, áreas o sectores que deben rendir por ella.

**¿Quién lo usa?** `superadmin`, `directivo`, `rrhh`, `jefe_area`, `jefe_sector`.

**Los dos niveles de una plantilla: QUÉ se mide y CÓMO se mide**

Esta es la distinción que más confunde al cargar, así que conviene tenerla clara antes de
empezar. Una plantilla tiene **dos niveles** y cada campo pertenece a uno solo:

- **Nivel objetivo — QUÉ se mide.** El enunciado, a quién aplica y cuánto vale. No lleva
  ningún número de cumplimiento.
- **Nivel meta — CÓMO se mide.** La regla con la que se decide si eso se cumplió: unidad,
  valor a alcanzar y forma de combinar los períodos. Un objetivo puede tener varias metas;
  en la práctica casi todos tienen una sola.

Ejemplo: *"Garantizar una atención telefónica ágil"* es el **qué**. *"Llamadas no atendidas
`<= 5%`, medición mensual, cada mes por separado"* es el **cómo**.

**Nivel objetivo — QUÉ se mide**

| Campo             | Significado                                                                        |
|-------------------|------------------------------------------------------------------------------------|
| `tipo`            | `objetivo` (mide resultados) o `aptitud` (mide competencias).                       |
| `nombre`          | El enunciado. Sin números de cumplimiento: esos van en la meta.                     |
| `descripcion`     | Detalle libre.                                                                      |
| `proceso`         | Proceso ISO al que pertenece (opcional).                                            |
| `scopeType`       | A quién aplica: `area`, `sector` o `empleado`.                                      |
| `frecuencia`      | `mensual`, `trimestral`, `semestral` o `anual`. Determina **cuándo se carga**.       |
| `pesoBase`        | Porcentaje del objetivo dentro del total de la evaluación.                          |
| `year`            | Año fiscal (01/09 → 31/08 del siguiente).                                           |
| `version`         | Cada modificación crea una versión nueva, con `parentPlantillaId` a la anterior.     |

**Nivel meta (`metas[]`) — CÓMO se mide**

| Campo              | Significado                                                                       |
|--------------------|-----------------------------------------------------------------------------------|
| `nombre`           | Qué indicador concreto se mide.                                                   |
| `unidad`           | `Porcentual`, `Numerico` o `Cumple/No Cumple`.                                    |
| `operador`         | `>=`, `>`, `<=`, `<`, `==`. Junto al esperado forma el umbral.                    |
| `esperado`         | El valor a alcanzar. **Este es el que usa el cálculo** (`target` está en desuso).  |
| `pesoMeta`         | Cuánto vale esta meta dentro del objetivo. Vacío → se reparte en partes iguales.   |
| `modoAcumulacion`  | `periodo`: cada período se mide solo. `acumulativo`: se suma el año y se compara el total. |
| `reglaCierre`      | Cómo se combinan los períodos al cerrar: `promedio`, `umbral_periodos`, `cierre_unico`. |
| `umbralPeriodos`   | Cuántos períodos hay que cumplir (solo con `umbral_periodos`).                     |
| `reconoceEsfuerzo` | Puntaje proporcional en vez de todo-o-nada.                                       |
| `permiteOver`      | Permite pasar del 100% (hasta 120%).                                              |
| `tolerancia`       | Margen para dar el hito por cumplido.                                             |

**Tres cosas del cálculo que no son obvias**

1. **En modo acumulativo, `reglaCierre` no interviene.** El motor suma todas las cargas del
   año y compara ese total contra `esperado`, cualquiera sea la regla elegida
   (`backend/src/lib/scoringCore.js`). El formulario deshabilita el selector para dejarlo claro.
2. **`reconoceEsfuerzo` solo actúa en el cierre anual.** Durante el año el seguimiento
   siempre muestra avance proporcional. Una meta al 50% con la opción desactivada se ve 50%
   todo el año y cierra en 0.
3. **`tolerancia` marca el hito como cumplido, pero no otorga el 100%.** Con `reconoceEsfuerzo`
   activo el puntaje sigue siendo proporcional: esperado 100, tolerancia 5 y un valor de 96
   da `cumple = true` pero puntúa 96%. Con `reconoceEsfuerzo` desactivado sí da 100.

**Flujo típico (crear plantilla):**

1. Entrar a `/plantillas`.
2. Filtrar por año fiscal y por tipo (Objetivo / Aptitud).
3. Click en "Nueva plantilla" → se abre el formulario (`FormularioObjetivos.jsx` o
   `FormularioObjetivoISO.jsx`).
4. En **⚙️ A quién y cuándo aplica**: elegir ámbito (Área / Sector / Empleado) y año fiscal.
5. En **🎯 Qué se mide**: nombre, descripción, proceso, frecuencia y peso.
6. En **📌 Cómo se mide**: definir la meta (o varias). Acá van la unidad, el operador y el
   valor esperado. Si cargás más de una, repartí el `pesoMeta` entre ellas.
7. Opcionalmente vincular **Objetivos de Calidad ISO** (lista múltiple `objetivosCalidad`).
8. Guardar. La plantilla se crea con `version=1`, `estadoAprobacion=aprobada` por defecto.

**Flujo típico (asignar):**

1. Entrar a `/asignaciones` (Editor de Asignación).
2. Elegir la plantilla a editar.
3. Ver la lista de personas comprendidas por el scope.
4. Excluir personas que no deban participar (excepciones).
5. Ajustar pesos individuales si es necesario (genera un **Override**).
6. Guardar.

**Versionado:** Si modificás algo crítico (meta, peso, frecuencia), el sistema crea una **nueva
versión** de la plantilla con un motivo y un comentario. Se puede ver el timeline en
`/versiones-timeline` o desde el diálogo `VersionesTimelineDialog.jsx`.

**Pantallas involucradas:** `GestionPlantillas.jsx`, `EditorAsignacion.jsx`, `PlantillasList.jsx`,
`FormularioObjetivos.jsx`, `FormularioObjetivoISO.jsx`, `VersionesTimelinePage.jsx`.

---

### 3.4 Evaluaciones - `/rrhh-evaluaciones` y `/evaluacion/:plantillaId/:periodo/:empleadoId?`

**¿Para qué sirve?** Es el **flujo de evaluación periódica**: el jefe carga el avance del colaborador
en cada período, deja feedback y cierra el ciclo. RRHH puede reabrir o cerrar masivamente desde su panel
dedicado.

**¿Quién lo usa?**

- Página `/evaluacion/...` → `superadmin`, `directivo`, `rrhh`, `jefe_area`, `jefe_sector` y
  referentes (todos los que pueden evaluar).
- Página `/rrhh-evaluaciones` → sólo `superadmin`, `directivo`, `rrhh` (panel de cierre).

**Flujo típico (jefe evaluando):**

1. El jefe entra a `/seguimiento`.
2. Filtra por su área/sector y por período.
3. Click en una plantilla → se abre `/evaluacion/:plantillaId/:periodo/:empleadoId`.
4. Carga el resultado de cada meta para el período.
5. Escribe el feedback al colaborador.
6. Guarda. El feedback queda en estado "pendiente de respuesta del colaborador".

**Flujo típico (cierre por RRHH):**

1. RRHH entra a `/rrhh-evaluaciones`.
2. Filtra por año/período/área.
3. Ve la lista de evaluaciones con su estado (alertas visuales según commit `bf687f7`).
4. Click en "Cerrar" sobre los registros listos → caps `rrhh:evaluaciones:cierre`.
5. Si hace falta corregir algo después del cierre, click en "Reabrir" → cap
   `rrhh:evaluaciones:reabrir`.

**Pantallas involucradas:** `EvaluacionFlujo.jsx`, `RRHHEvaluaciones.jsx`, `SeguimientoReferente.jsx`.

---

### 3.5 Seguimiento - `/seguimiento` y `/seguimiento-ejecutivo`

Dos vistas diferentes del avance:

**`/seguimiento`** (Dashboard de desempeño):

- **¿Para qué sirve?** Permite a un jefe / referente ver el avance de toda su gente y tomar decisiones.
- **¿Quién?** `superadmin`, `directivo`, `rrhh`, `jefe_area`, `jefe_sector`, `visor`, referentes.
- Muestra una **vista tipo Gantt** (commit `24e143d`) con el estado por período de cada empleado.
- Filtros por año, área, sector, frecuencia y tipo (objetivo/aptitud).

**`/seguimiento-ejecutivo`** (Tablero Ejecutivo):

- **¿Para qué sirve?** Vista global y de alto nivel para directivos. Métricas agregadas, comparativos
  entre áreas, gráficas resumidas.
- **¿Quién?** `superadmin`, `directivo`, `rrhh`, `jefe_area`, `jefe_sector`.
- Introducido en `707cd8a` (17/12/2025).

**Flujo típico:**

1. Entrar al dashboard.
2. Seleccionar año fiscal.
3. Ver el Gantt con colores por estado (verde = OK, amarillo = en riesgo, rojo = atraso, gris = sin
   datos).
4. Click en una celda → abre la evaluación específica.
5. Exportar / filtrar según necesidad.

---

### 3.6 Configuración y Resultados de Bono - `/configuracion-bono` y `/resultados-bono`

**¿Para qué sirve?**

- `/configuracion-bono` → RRHH define las **reglas anuales** del bono.
- `/resultados-bono` → muestra el cálculo final por empleado.

**¿Quién lo usa?** `superadmin`, `directivo`, `rrhh`.

**Modelo de configuración (`BonoConfig`):**

| Campo            | Significado                                                                                         |
|------------------|-----------------------------------------------------------------------------------------------------|
| `anio`           | Año al que aplica (único por año).                                                                  |
| `escala.tipo`    | `lineal` (de `minPct` a `maxPct` según el score) o `tramos` (array de `{ gte, pct }`).             |
| `escala.umbral`  | Score mínimo para cobrar bono (ej: 60).                                                             |
| `escala.maxPct`  | Tope del bono como % del sueldo (ej: 0.3 = 30%).                                                    |
| `bonoTarget`     | Multiplicador del sueldo (ej: 1.0 = 1 sueldo). Si el score es 100% → cobra `bonoTarget * sueldo`.  |
| `globalMessage`  | Mensaje general que se ve en los resultados (ej: explicación del año).                              |
| `fechas`         | `calculo` y `pago`.                                                                                 |
| `overrides[]`    | Excepciones por Área o Empleado con su propia escala / bonoTarget.                                  |

**Modelo de resultado (`BonoAnual`):**

- Se crea uno por empleado + año (índice único).
- Tiene un **snapshot** congelado del puesto, área, sector, CUIL, DNI y fechaIngreso al momento del
  cálculo (que no cambia aunque después se mueva al empleado).
- Pesos default: **70% objetivos / 30% competencias** (ver `15ae792`).
- Estado: `borrador` → `en_proceso` → `aprobado` → `pagado`.
- Tiene `condiciones[]` con eventos que pueden anular, reducir o dejar OK (ej: `ANTIGUEDAD`,
  `SANCION`, `LICENCIA`).
- Guarda comentarios del jefe, del empleado y de RRHH.

**Flujo típico (calcular y publicar bono anual):**

1. RRHH entra a `/configuracion-bono`.
2. Selecciona el año fiscal.
3. Define escala (lineal o tramos), umbral, maxPct y bonoTarget.
4. Agrega overrides para áreas/empleados especiales.
5. Setea fecha de cálculo y fecha de pago.
6. Guarda. Esto queda como la **regla** para ese año.
7. RRHH va a `/resultados-bono`.
8. Sistema calcula automáticamente cruzando: score final del Dashboard de Desempeño × escala vigente.
9. Por cada empleado vincúlado se genera un `BonoAnual` con su snapshot.
10. RRHH revisa, agrega comentarios, registra condiciones especiales (sanciones, licencias).
11. Cuando está aprobado, se cambia el estado a `aprobado`.
12. Tras el pago efectivo, se marca como `pagado`.

**Pantallas involucradas:** `ConfiguracionBono.jsx`, `ResultadosBono.jsx`, `CalculoBono.jsx`.

---

### 3.7 Gestión ISO de Calidad - `/gestion-iso` y `/analisis-iso`

**¿Para qué sirve?** Administrar los **objetivos del sistema de gestión de calidad** ISO y hacer su
seguimiento mensual.

**¿Quién lo usa?** `superadmin` o cualquier usuario con flag `isCalidad=true`.

**Modelo (`ObjetivoISO`):**

- `codigo` (ej: `OBJ-01`), `nombre` (ej: "Gestión Preanalítica"), `descripcion`.
- `year` (año fiscal de inicio: 2025 → ciclo 09/2025 a 08/2026).
- `representante`: empleado responsable del objetivo.
- `meta` (numérica) + `unidadMeta` (%, horas, unidades, etc.) + `operador` (`=`, `>`, `<`).
- `progreso` (0-100) global.
- `seguimientoMensual[]`: un registro por mes con `progreso`, `resultadoMes`, `comentario` y
  `adjunto` (evidencia).

**Flujo típico (carga mensual de avance ISO):**

1. Calidad (o superadmin) entra a `/gestion-iso`.
2. Selecciona el año fiscal y el objetivo a actualizar.
3. Click en **"Cargar avance del mes"** → se abre `ModalCargaAvanceISO.jsx`.
4. Selecciona el mes y el año.
5. Ingresa el `resultadoMes` y el `progreso` (%) alcanzado.
6. Escribe un comentario explicando los logros / desvíos.
7. Adjunta evidencia (archivo).
8. Guarda. El registro se agrega al array `seguimientoMensual`.
9. Posteriormente puede consultar `/analisis-iso` para ver gráficas comparativas, tendencia mensual y
   semáforo de cumplimiento.

**Vinculación con desempeño individual:** las plantillas de objetivos individuales pueden referenciar
uno o varios `ObjetivoISO` (campo `objetivosCalidad`), de modo que el avance del empleado contribuye al
indicador ISO.

**Pantallas involucradas:** `GestionISO.jsx`, `AnalisisISO.jsx`, `ModalCargaAvanceISO.jsx`,
`FormularioObjetivoISO.jsx`.

---

### 3.8 Avisos globales - `/gestion-avisos`

**¿Para qué sirve?** Publicar comunicados visibles en la plataforma para toda la nómina, un área o un
sector específico.

**¿Quién lo usa?** `superadmin`, `directivo`, `rrhh`.

**Modelo (`GlobalAviso`):**

- `titulo`, `mensaje`.
- `alcance`: `GLOBAL` (todos), `AREA` o `SECTOR`.
- `targetId` + `targetModel` (cuando alcance no es global).
- `fechaInicio` y `fechaFin` (controla la visibilidad temporal).
- `tipo`: `RRHH` o `SISTEMAS` (afecta el estilo visual).
- `activo`: se puede desactivar sin borrar.

**Flujo típico:**

1. RRHH entra a `/gestion-avisos`.
2. Click en "Nuevo aviso".
3. Carga título y mensaje (texto con formato).
4. Elige alcance: si es `AREA` o `SECTOR`, selecciona el destino del dropdown.
5. Define rango de fechas de vigencia.
6. Elige tipo (RRHH / Sistemas).
7. Guarda. El aviso aparece en el Home / Mi Desempeño de los usuarios alcanzados mientras esté vigente
   y `activo=true`.

**Pantallas involucradas:** `GestionAvisos.jsx`.

---

### 3.9 Gestión de Mejoras - `/gestion-mejoras`

**¿Para qué sirve?** Registrar incidencias / propuestas de mejora detectadas en la operación. Es una
especie de "tablero de mejora continua" alineado con el sistema de calidad.

**¿Quién lo usa?** `superadmin`, `directivo`, `rrhh`.

**Pantallas involucradas:** `GestionMejoras.jsx` (apoyado en el modelo `Incidencia.model.js`).

---

### 3.10 Simulador de objetivos - `/simulador`

**¿Para qué sirve?** Permite a un jefe o RRHH **proyectar** cómo quedaría el resultado de un empleado
si se modifican pesos, metas o resultados, sin tocar la base de datos. Útil para planificar el cierre
de año o probar escenarios de bono.

**¿Quién lo usa?** `superadmin`, `rrhh`, `directivo`, `jefe_area`, `jefe_sector`.

**Flujo típico:**

1. Entrar a `/simulador`.
2. Elegir empleado y año fiscal.
3. El sistema carga sus objetivos y aptitudes actuales.
4. Modificar valores de prueba (pesos, resultados ficticios).
5. Ver el resultado simulado: score global, score por objetivo y proyección de bono.
6. Cerrar sin guardar - **no afecta nada en BD**.

**Pantallas involucradas:** `SimuladorObjetivos.jsx`.

---

### 3.11 Sistemas / Usuarios / Roles - `/sistemas`, `/usuarios`, `/roles`

Las tres rutas apuntan a la misma página (`Sistemas.jsx`), que internamente usa tabs.

**¿Para qué sirve?** Es el centro de administración técnica de la plataforma.

**¿Quién lo usa?** **Sólo `superadmin`**.

**Tabs disponibles:**

- **Usuarios** (`UsuariosAdmin.jsx`): alta / edición / desactivación de cuentas, asignar rol, marcar
  `isCalidad`, resetear password, vincular con un empleado.
- **Roles** (`RolesAdmin.jsx`): editar permisos por rol, crear roles custom. Los 6 roles base
  (`isSystem=true`) **no se pueden eliminar**.
- **Auditoría de Scores**: panel que carga los feedbacks del año, recalcula scores en vivo y los
  compara con BD para detectar discrepancias. Se ve fila por fila qué empleado tiene divergencia.
- **Backups**: ver lista de backups generados automáticamente (diarios a las 03:00 AM), descargar uno,
  o **restaurar** (modo selectivo por colecciones o full restore con doble confirmación).
- **Modo enmascarado** (impersonation): seleccionar un empleado del dropdown → click "Enmascarar" →
  el navbar superior se vuelve rosa y todas las pantallas se ven como las vería ese usuario. Útil para
  soporte cuando alguien reporta un problema. Salir con "Volver a modo Admin".
- **Cambio de contraseña propia**.
- **App Feedback**: ver los feedbacks de la app que los usuarios dejaron desde el ícono de comentario
  (modelo `AppFeedback`).

**Flujo típico (crear un usuario nuevo):**

1. `/sistemas` → tab Usuarios.
2. Click "Nuevo usuario".
3. Ingresar email, asignar rol, vincular al empleado correspondiente.
4. El sistema genera password temporal (TODO en `auth.controller.js`: idealmente se enviará un email
   con el link de invitación).
5. El usuario recibe sus credenciales y completa el alta vía `/complete-invite`.

**Flujo típico (restaurar backup):**

1. `/sistemas` → tab Backups.
2. Seleccionar el backup deseado de la lista (por fecha).
3. Elegir modo:
   - **Restaurar TODO** (full): sobreescribe todas las colecciones.
   - **Restaurar selectivamente**: tickear sólo las colecciones a restaurar.
4. Confirmar con el texto de alerta (commit `Sistemas.jsx` línea 606: "PELIGRO: ¿Estás seguro...").
5. El sistema ejecuta `restore.js` y muestra el resultado.

**Pantallas involucradas:** `Sistemas.jsx`, `UsuariosAdmin.jsx`, `RolesAdmin.jsx`, `CompleteInvite.jsx`.

---

## 4. Flujos comunes paso a paso

### 4.1 Desvincular a un empleado

Cuando un colaborador deja la empresa:

1. RRHH entra a `/nomina/legajo/:id` del empleado.
2. Click en el botón **"Desvincular"** (visible solo para RRHH/Directivo/Superadmin).
3. Se abre un **modal de confirmación** pidiendo escribir el nombre del empleado para confirmar.
4. Opcionalmente cargar fecha de baja y motivo.
5. Confirmar. El `estadoLaboral` pasa de `VINCULADO` a `DESVINCULADO`.
6. **Efectos automáticos** (commit `43ce5d2`):
   - El empleado deja de aparecer en los filtros default de nómina, seguimiento, evaluaciones y
     resultados de bono.
   - Hay un toggle "Mostrar desvinculados" para auditarlos cuando sea necesario.
   - Sus evaluaciones y bonos ya generados se conservan intactos.

### 4.2 Crear y asignar una plantilla de evaluación

1. **RRHH/Jefe** entra a `/plantillas` y filtra por el año fiscal vigente.
2. Click en **"Nueva plantilla"**.
3. Selecciona tipo (`objetivo` o `aptitud`).
4. Selecciona scope (Área / Sector / Empleado) y el destino concreto.
5. Carga nombre, descripción, proceso.
6. Define frecuencia (mensual / trimestral / semestral / anual) y peso base.
7. Agrega una o varias metas con su `target`, `unidad` y `operador`.
8. Si es un objetivo de calidad: vincula uno o varios `ObjetivoISO`.
9. Guarda. Queda en `version=1`, `activo=false` por defecto (sólo se activa al asignar).
10. Va a `/asignaciones`, selecciona la plantilla recién creada.
11. Ve la lista de personas comprendidas. Excluye las que no apliquen.
12. Ajusta pesos individuales si hay una persona con condiciones especiales (genera un Override).
13. Activa la plantilla. A partir de ahí queda visible para los jefes en `/seguimiento` y para cada
    colaborador en `/mi-desempeno`.

### 4.3 Cargar avance mensual de un objetivo ISO

1. Calidad entra a `/gestion-iso`.
2. Filtra por año fiscal vigente y selecciona el objetivo (por ejemplo "Gestión Preanalítica").
3. Click en **"Cargar avance del mes"** → se abre `ModalCargaAvanceISO.jsx`.
4. Elige el mes (1-12) y el año.
5. Ingresa el valor del mes (`resultadoMes`) y el porcentaje de progreso (`progreso`).
6. Comentario breve sobre el resultado, desvíos y acciones tomadas.
7. Adjunta evidencia (ej: reporte PDF del laboratorio).
8. Guarda. El registro queda en el array `seguimientoMensual` del objetivo.
9. Para analizar: ir a `/analisis-iso` → ver evolución mensual, gauge de cumplimiento vs meta y
   tendencia.

### 4.4 Calcular y publicar el bono anual

1. RRHH entra a `/configuracion-bono`.
2. Selecciona el año fiscal cerrado (ej: 2025/2026 si ya terminó el 31/08).
3. Define la **escala**:
   - Lineal: setear `minPct`, `maxPct`, `umbral`.
   - Por tramos: definir `[{ gte: 60, pct: 0.1 }, { gte: 80, pct: 0.2 }, { gte: 95, pct: 0.3 }]`.
4. Define `bonoTarget` (multiplicador del sueldo).
5. Agrega overrides si hay áreas o empleados con escalas especiales.
6. Setea `fechas.calculo` y `fechas.pago`.
7. Opcional: escribe `globalMessage` que verán los empleados en el detalle.
8. Guarda.
9. Va a `/resultados-bono`.
10. Click en **"Generar"** → el sistema toma el score final del Dashboard (pesos 70/30 obj/comp,
    tope 100%) y aplica la escala correspondiente.
11. Por cada empleado vinculado se crea un `BonoAnual` con su snapshot.
12. RRHH revisa la lista. Para cada uno:
    - Agrega `condiciones` si corresponde (sanción, licencia prolongada, antigüedad insuficiente).
    - Escribe comentario interno.
    - Cambia estado a `en_proceso` y luego a `aprobado`.
13. Una vez aprobado y pagado, marca como `pagado`.
14. Los colaboradores pueden ver su detalle desde su perfil personal (commit `3371c4c`).

---

## 5. Glosario

| Término                       | Definición                                                                                                                                                  |
|-------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Año fiscal**                | Período de evaluación. Va del **1 de septiembre al 31 de agosto** del año siguiente. Ver `getFiscalStart` / `getFiscalEnd` en `Plantilla.model.js`.        |
| **Período**                   | Subdivisión del año fiscal según la frecuencia. Ej: `2025M09`, `2025Q1`, `2025S1`, `2025A1`.                                                              |
| **Plantilla**                 | Definición de un objetivo o aptitud en dos niveles: **qué se mide** (enunciado, alcance, peso) y **cómo se mide** (sus metas). Tiene versionado.           |
| **Asignación**                | Vínculo entre una plantilla y las personas comprendidas, con eventual ajuste de pesos o exclusiones.                                                       |
| **Scope** (`scopeType`)       | A quién aplica una plantilla: `area`, `sector` o `empleado`.                                                                                               |
| **Override**                  | Ajuste individual de peso o meta para un empleado que se sale del default del scope.                                                                      |
| **Frecuencia**                | Cadencia de carga de avances: `mensual`, `trimestral`, `semestral` o `anual`.                                                                              |
| **Objetivo de mantenimiento** | Nombre que usa Mi Desempeño para un objetivo `modoAcumulacion: periodo`. Hay que sostenerlo todo el año, así que cuenta con todo su peso desde el primer día. |
| **Modo acumulativo**          | La meta se evalúa **al final** sumando los aportes de cada período. A mitad de año cuenta proporcional al tiempo transcurrido. Opuesto: `periodo` (mantenimiento). |
| **Regla de cierre**           | Cómo se consolidan los períodos de una meta **no acumulativa**: `promedio`, `umbral_periodos` o `cierre_unico`. En modo acumulativo **no interviene**.      |
| **Reconoce esfuerzo**         | Puntaje proporcional (true) o todo-o-nada (false). Solo se aplica en el **cierre anual**: durante el año el seguimiento siempre es proporcional.            |
| **Permite over**              | Si una meta puede ir por encima del 100% (ej: 120% si superó la meta).                                                                                    |
| **Tolerancia**                | Margen para dar el hito por **cumplido**. No otorga el 100%: con `reconoceEsfuerzo` activo el puntaje sigue proporcional (esperado 100, tol. 5, valor 96 → cumple pero 96%). |
| **Score**                     | Nota numérica (0-100) de un objetivo o aptitud en un período.                                                                                              |
| **Score global**              | Combinación ponderada de todos los scores con pesos 70/30 (objetivos/competencias por defecto).                                                            |
| **Feedback**                  | Conjunto de comentarios y devolución entre jefe y colaborador en un período. Tiene estados (pendiente, aceptado, etc.).                                    |
| **Conformidad**               | Confirmación del colaborador de que recibió y acepta una devolución de su jefe.                                                                            |
| **Referente**                 | Empleado designado como responsable de un Área o Sector (sin ser jefe formal). Hereda permisos de jefe en el sistema automáticamente.                      |
| **Rol efectivo**              | El rol con que el sistema te trata después de aplicar la lógica de referente. Puede diferir del rol grabado.                                              |
| **Visor**                     | Rol de sólo lectura. Si además sos referente, se eleva a jefe_area / jefe_sector.                                                                          |
| **isCalidad**                 | Flag transversal que da acceso al módulo ISO sin ser superadmin.                                                                                           |
| **Modo enmascarado**          | Capacidad del superadmin de hacerse pasar por otro usuario para soporte. Aparece una barra rosa fija en pantalla.                                          |
| **Snapshot**                  | Foto fija del contexto del empleado (puesto, área, etc.) al momento del cálculo del bono. No cambia aunque después se mueva al empleado.                  |
| **Bono target**               | Multiplicador del sueldo que define cuánto cobraría el empleado con un score perfecto. Ej: 1.5 = 1.5 sueldos extra.                                       |
| **Escala**                    | Función que convierte el score (0-100) en el % del sueldo que se paga. Puede ser **lineal** o **por tramos**.                                              |
| **Umbral**                    | Score mínimo para cobrar algo de bono. Por debajo del umbral, el bono es 0.                                                                                |
| **KPI ISO**                   | Indicador del sistema de calidad. Se mide mensualmente con un `resultadoMes` contra una `meta`.                                                            |
| **Objetivo ISO**              | KPI del sistema de calidad con código, nombre, meta, representante y seguimiento mensual. Puede vincularse a objetivos individuales del empleado.        |
| **Versionado de plantilla**   | Cada cambio importante crea una nueva versión con `parentPlantillaId`, conservando el historial. Visible en `/versiones-timeline`.                        |
| **VINCULADO / DESVINCULADO**  | Estado laboral del empleado. Los desvinculados quedan filtrados por defecto en nómina, seguimiento y bono.                                                |
| **Aviso global**              | Mensaje publicado por RRHH visible para toda la nómina, un área o un sector durante un rango de fechas.                                                   |
| **Mejora / Incidencia**       | Registro de una propuesta de mejora o incidencia operativa, gestionado desde `/gestion-mejoras`.                                                          |
| **Simulador**                 | Sandbox para proyectar resultados sin tocar la BD.                                                                                                         |

---

## 6. Preguntas frecuentes

**¿Por qué no veo a un empleado que sé que existe?**
Probablemente está marcado como `DESVINCULADO`. Activá el toggle "Mostrar desvinculados" en la página
correspondiente.

**¿Por qué un jefe de sector ve gente de otra área?**
Si está marcado como **referente** en un área distinta, el sistema le da permisos adicionales. Revisá
en `/gestion-departamentos` la lista de referentes de cada área/sector.

**¿Se puede cambiar la fecha de inicio fiscal?**
No por configuración. Está hardcodeada como `01/09 → 31/08` en `Plantilla.model.js`. Cualquier cambio
requiere modificar código.

**¿Qué pasa si cargo dos veces el mismo período en un objetivo ISO?**
El array `seguimientoMensual` no tiene índice único en `(mes, year)`, por lo que pueden quedar dos
registros. Hay que validarlo a mano por ahora.

**¿Puedo eliminar un rol custom?**
Sí, pero **sólo si no es un rol base** (`isSystem=true`). Los 6 roles del sistema no se pueden borrar.
Si borrás uno custom y había usuarios usándolo, esos usuarios pierden sus permisos del rol pero
mantienen los granulares (`permisos[]` en su documento). Ver TODO en `roles.routes.js` línea 78.

**¿La sesión se cierra cuando minimizo el navegador?**
No, sólo se cierra por **inactividad real** (sin clicks/teclas) por 10 minutos.

**¿Puedo ver lo que hizo otro usuario?**
Si sos superadmin, sí: usá el **modo enmascarado** desde `/sistemas`. Tené presente que las acciones
quedan atribuidas al usuario enmascarado en la BD - no hay un log específico de impersonation.

**¿Qué pasa con mis datos si me desvinculan?**
Tu usuario se desactiva y tu empleado pasa a `DESVINCULADO`. Tus evaluaciones, bonos y datos
históricos se conservan intactos para auditoría.

---

## 7. Soporte

Para reportar bugs o solicitar ayuda: **sistemas@diagnos.com.ar**.

Dentro de la app, en `/sistemas` o desde el ícono de comentario en el navbar, podés dejar un **App
Feedback** que llega al equipo técnico.

---

*Plataforma de Desempeño — Diagnos S.A. — Documentación funcional v5.0.0 (mayo de 2026).*
