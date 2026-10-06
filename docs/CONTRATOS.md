# Contratos del sistema

> Generado desde `backend/src/contratos/catalogo.js`.
> No editar a mano: se regenera con `npm run contratos -- --md`.

Cada contrato es una promesa que el sistema hace y no puede romper. Ninguno
es una buena intención: todos nacen de algo que pasó en el AF2025, dicen
dónde se hacen cumplir, y se verifican contra la base real.

```
npm run contratos                  # el año fiscal en curso
npm run contratos -- --year 2026
npm run contratos -- --detalle     # todas las violaciones, no una muestra
npm run contratos -- --listar      # el catálogo, sin tocar la base
```

El comando sale con código 1 si hay alguna violación crítica, así que sirve
como control antes de abrir un ciclo o antes de desplegar.

## Las tres capas

Un contrato puede sostenerse de tres formas, y la diferencia importa:

| Capa | Qué significa |
|---|---|
| **Impuesto** | El backend lo rechaza: 400/403/409 y no escribe. Es la única capa que garantiza algo. |
| **Avisado** | Se detecta y se muestra, pero se puede guardar igual. Para lo que a veces es legítimo. |
| **Revisado** | Solo se verifica después. Son los que todavía no se pueden imponer sin romper datos que ya existen. |

Un contrato en **Revisado** no es un olvido: es una deuda declarada, y
aparece como tal en el reporte.

---

## Configuración de objetivos

### OBJ-01 — No se escribe sobre un año fiscal cerrado

Una vez que empezó el ciclo siguiente, nadie puede crear, editar ni versionar objetivos del anterior, salvo RRHH y dirección.

**Por qué existe.** Clonar objetivos del AF2026 sobre el AF2025 corrompió las notas ya comunicadas de 27 personas del Área Técnica. El sistema no tenía ninguna noción de 'año cerrado'.

**Cómo se sostiene.** bloqueoPorAnioCerrado() en crear, actualizar y versionar objetivos → 403

**Impuesto** — el backend lo rechaza · severidad critico

---

### OBJ-02 — Un objetivo no se duplica dentro del mismo alcance

No pueden existir dos objetivos con el mismo nombre, tipo, año y alcance.

**Por qué existe.** Las clonaciones dejaron el mismo objetivo dos veces sobre la misma gente: el original con sus resultados y un clon vacío que arrastraba el promedio. Sumas de peso en 190%, 250%.

**Cómo se sostiene.** buscarDuplicada() en la creación → 409. También atrapa el doble clic.

**Impuesto** — el backend lo rechaza · severidad alto

---

### OBJ-03 — La configuración de un objetivo produce la nota que se quiso pedir

No se guarda un objetivo cuya configuración haga que el motor devuelva un número que no corresponde al desempeño: un 0 inalcanzable o un 100 regalado.

**Por qué existe.** Había objetivos con umbral de 9 períodos sobre un calendario trimestral de 4 —imposible, 0 garantizado todo el año— y metas porcentuales sin valor esperado, que comparan contra 0 y dan 100% con cualquier carga.

**Cómo se sostiene.** validarCoherenciaObjetivo() en alta, edición y versionado → 400. Rige desde el AF2026.

**Impuesto** — el backend lo rechaza · severidad critico

---

### OBJ-04 — Los pesos de una persona suman 100

La suma de los pesos de los objetivos de alguien es 100%.

**Por qué existe.** Con los pesos en 190% o 265% el reparto deja de significar lo que dice, y las dos formas de normalizar que convivían daban notas distintas —hasta 23 puntos— para la misma persona.

**Cómo se sostiene.** Todavía NO se bloquea: hay gente con los pesos mal cargados hoy y cortarles el guardado los dejaría sin poder editar nada. Se detecta y se muestra.

**Revisado** — solo se detecta al verificar · severidad alto

---

## Resultados cargados

### EVA-01 — Un resultado vive en un período que existe

Todo resultado cargado corresponde a un período del calendario de su objetivo.

**Por qué existe.** Cambiar un objetivo de mensual a trimestral dejó 5 resultados colgados de períodos inexistentes en 20 personas, sin un solo aviso: no se borran, dejan de verse y el objetivo computa como vacío.

**Cómo se sostiene.** Cambiar la frecuencia con datos cargados exige confirmar el impacto → 409. Los que ya quedaron colgados se listan acá.

**Impuesto** — el backend lo rechaza · severidad alto

---

### EVA-02 — Un resultado apunta a una meta que existe

Todo resultado cargado referencia una meta presente en su objetivo.

**Por qué existe.** Renombrar una meta sin conservar su identificador dejaba 710 resultados apuntando a metas inexistentes. El motor los busca por id, no los encuentra, y la meta computa como si nunca se hubiera cargado.

**Cómo se sostiene.** El formulario manda el _id de las metas que ya existen (conservarIdsDeMetas). Los huérfanos viejos se listan acá.

**Impuesto** — el backend lo rechaza · severidad alto

---

### EVA-03 — No se evalúa a alguien antes de que entrara

No hay resultados cargados en períodos anteriores a la fecha de ingreso de la persona.

**Por qué existe.** Había 52 evaluaciones en períodos previos al ingreso. A una persona le restaban 21 puntos por desempeño de meses en los que no trabajaba acá.

**Cómo se sostiene.** updateHito() devuelve 409 salvo que se confirme explícitamente.

**Impuesto** — el backend lo rechaza · severidad alto

---

## La nota

### NOTA-01 — Una nota está dentro de la escala

Ninguna nota guardada supera 100 ni es negativa.

**Por qué existe.** Había dos feedbacks CERRADOS con 112 y 116,8. El número lo calculaba el navegador y se guardaba sin que nadie lo mirara.

**Cómo se sostiene.** motivosFueraDeRango() valida el rango al guardar un feedback → 400.

**Impuesto** — el backend lo rechaza · severidad critico

---

### NOTA-02 — La nota que ve la persona es la que paga el bono

El número del feedback, el de Mi Desempeño, el de la Sala de Evaluación, el del bono y el de los reportes son el mismo.

**Por qué existe.** Había cinco formas distintas de responder 'cuál es la nota'. Once personas veían un número en su pantalla y habrían cobrado otro; en dos casos la diferencia pasaba los 20 puntos.

**Cómo se sostiene.** notaDelFeedback() y resolverNotaOficial() son el único lugar donde se decide, y lo llaman todas las salidas.

**Impuesto** — el backend lo rechaza · severidad critico

---

### NOTA-03 — El cierre anual tiene nota, y es la del cierre

Nadie cobra un bono sobre la nota de un trimestre: la nota del año sale del feedback FINAL.

**Por qué existe.** Seis personas sin FINAL cerrado tenían el bono saliendo de Q2 o Q3. A una le daba 41,7 cuando su cálculo anual era 74,5.

**Cómo se sostiene.** resolverNotaOficial() marca esos casos como 'sin cierre anual' y NO deja confirmarlos. El número no se cambia solo: la decisión es de RRHH.

**Avisado** — se muestra, se puede guardar igual · severidad alto

---

## Trazabilidad

### TRZ-01 — Todo cambio deja el documento previo

Cada escritura sobre objetivos, pesos, evaluaciones y feedbacks queda registrada con el estado anterior completo.

**Por qué existe.** Reconstruir qué había pasado con los objetivos del Área Técnica llevó horas de scripts, y 162 de los 274 cierres del AF2025 siguen sin poder reconstruirse porque son anteriores al registro.

**Cómo se sostiene.** auditarEscrituras() montado antes de todos los routers en server.js.

**Impuesto** — el backend lo rechaza · severidad alto

---

### TRZ-02 — Hay un backup reciente y verificado

Existe un backup de menos de 48 horas que se puede abrir y leer.

**Por qué existe.** El backup fallaba callado desde 3 frentes: el cron solo dispara si el proceso está vivo a las 03:00 y no recupera lo perdido, el zip se escribía en su destino final mientras se armaba, y nadie verificaba el resultado. Entre el 25 y el 28/09/2026 la máquina estuvo apagada a esa hora: 4 días sin copia, sin error y sin nada que lo dijera.

**Cómo se sostiene.** verificarBackup() abre el zip y comprueba las colecciones; backupSiHaceFalta() corre al arrancar si el último válido tiene más de 24 h.

**Impuesto** — el backend lo rechaza · severidad critico

---

## Acceso

### ACC-01 — Cada jefe ve solo a su gente

Un referente accede al desempeño de las personas de sus áreas y sectores, y de nadie más.

**Por qué existe.** dashBySector no verificaba nada: cualquier jefe accedía al dashboard de cualquiera de los 17 sectores —con las notas de toda esa gente— cambiando el id en la URL. Al cerrarlo se taparon 162 combinaciones jefe×sector que estaban abiertas, sin que ninguno de los 11 jefes perdiera el acceso a su propia gente. Además 2 rutas no pedían ninguna capacidad: alcanzaba con agregarle el año a la URL.

**Cómo se sostiene.** Verificación de alcance en dashByArea, dashBySector y dashByEmpleado; filtroAlcanceEmpleados() en los listados.

**Impuesto** — el backend lo rechaza · severidad critico

Verificado por: `backend/tests/dashboard.autorizacion.test.js (17 tests)`

---

### ACC-02 — El sueldo no sale de la API salvo para quien corresponde

Solo dirección, RRHH y la cuenta técnica reciben información salarial.

**Por qué existe.** El sueldo viajaba dentro del payload del dashboard y de los listados de nómina, que ven los 11 jefes de área y sector. No hacía falta ningún permiso especial: estaba en la respuesta.

**Cómo se sostiene.** redactSueldoEmpleado() y redactSueldoDashboard() antes de responder.

**Impuesto** — el backend lo rechaza · severidad critico

Verificado por: `backend/src/utils/salaryVisibility.js`

---

## Agregar un contrato

Se agrega a `backend/src/contratos/catalogo.js` con cinco campos —`titulo`,
`promesa`, `porque`, `seImpone` y `verificar`— y se regenera este documento.

Si no se puede verificar contra datos, como los de acceso, `verificar`
devuelve `[]` y se completa `verificadoPor` con el test que lo cubre.

El campo que no hay que saltear es **`porque`**. Un contrato sin el caso real
que lo motivó se discute en la primera reunión en que moleste, y se termina
sacando.
