# Documentación: Analytics API (Integración Externa)

Esta API está diseñada para proveer datos a herramientas de inteligencia de negocios (como Power BI, Tableau, Excel) o a scripts externos. No utiliza el sistema de autenticación por JWT de la aplicación principal, sino que utiliza una **clave estática (Token)** definida en las variables de entorno (`ANALYTICS_SECRET`).

## 1. Autenticación

Todas las peticiones a la ruta `/api/analytics` requieren autenticación.

**Token actual (desarrollo local):** `diagnos_analytics_2025_powerbi`

Existen dos formas de enviar el token en tu petición:

### Opción A: Mediante Headers HTTP (Recomendado)
Debes incluir el header `X-Analytics-Token` con el valor del secreto.
```http
GET /api/analytics/empleados HTTP/1.1
Host: localhost:5007
X-Analytics-Token: diagnos_analytics_2025_powerbi
```

### Opción B: Mediante Query Parameter (Ideal para Excel / PowerBI Web)
Puedes enviar el token directamente en la URL agregando `?token=TU_CLAVE`.
```
http://evaluacion.diagnoslab.com.ar/api/analytics/empleados?token=diagnos_analytics_2025_powerbi
```

---

## 2. Endpoints Disponibles

Asumiendo que tu servidor local corre en el puerto `5007`, la URL base es `http://evaluacion.diagnoslab.com.ar/api/analytics`.

### 1. **Comprobar Conexión (Health Check)**
- **Ruta:** `GET /`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Devuelve un "status: ok" y la lista de endpoints disponibles si la clave es correcta.

### 2. **Nómina de Empleados Completa**
- **Ruta:** `GET /empleados`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/empleados?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Devuelve la lista completa de empleados activos e inactivos enriquecida con datos legajo.
- **Nuevos Campos Agregados:** `apodo`, `celular`, `domicilio`, `antiguedadReconocidaAnios`.

### 3. **Resultados de Evaluaciones**
- **Ruta:** `GET /evaluaciones`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/evaluaciones?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Extrae el estado, las notas y el progreso de las evaluaciones de desempeño para todos los empleados, útil para cruzar con el periodo (ej. Q1-2025).

### 4. **Feedbacks / Comentarios Cruzados Completo**
- **Ruta:** `GET /feedback`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/feedback?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Lista los feedbacks dados por los líderes a los empleados, abarcando fechas clave y acuse de recibo.
- **Nuevos Campos Agregados:** `comentario_lider`, `comentario_empleado`, `comentario_rrhh`, `empleadoAck` (Acuse del empleado), `fecha_ack_empleado`, `motivoDesacuerdo`, `fecha_enviado_empleado`.

### 5. **Bonos Financieros y Puntajes**
- **Ruta:** `GET /bonos`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/bonos?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Extrae los reportes de puntajes consolidados anuales (ej. nota final del año y porcentaje de bono asignado) para cruzar con el departamento financiero.

### 6. **Catálogo de Plantillas de Objetivos y Versionado**
- **Ruta:** `GET /plantillas`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/plantillas?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Devuelve las plantillas (objetivos y competencias agrupadas) para analizar las metas exigidas a cada sector o área.
- **Nuevos Campos Agregados:** `version`, `parentPlantillaId`, `estadoAprobacion`, `motivoVersion`, `comentarioVersion`, para modelar la traza histórica ante reversiones.

### 7. **Gestión de Calidad ISO 9001** *(Nuevo)*
- **Ruta:** `GET /iso`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/iso?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Extrae el compendio completo de Procesos y Objetivos Mapeados en la Certificación de Calidad.
- **Campos Principales:** Códigos de Procesos, Nombres, Relación Jerárquica e Identificación Plena e Información de Contacto del "Representante de Calidad".

### 8. **Catálogo de Áreas** *(Nuevo)*
- **Ruta:** `GET /areas`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/areas?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Extrae el registro de direcciones / áreas primarias de la empresa y sus respectivos "Referentes" o líderes en línea.

### 9. **Catálogo de Sectores (Dependencias)** *(Nuevo)*
- **Ruta:** `GET /sectores`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/sectores?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Devuelve la lista de Subsectores que cuelgan jerárquicamente de un Área Padre, incluyendo su política de herencia de líderes o referentes propios.

### 10. **Catálogo de Usuarios** *(Nuevo)*
- **Ruta:** `GET /usuarios`
- **Url Completa:** `http://evaluacion.diagnoslab.com.ar/api/analytics/usuarios?token=diagnos_analytics_2025_powerbi`
- **Descripción:** Sirve para cruzar el estado del login online (ej. Activo/Inactivo) o roles de sistema (Visor/Jefe) contra la nómina de capital humano de cada empleado.

---

## 3. ¿Cómo conectarlo a Power BI?

1. Abrí Power BI Desktop.
2. Ve a **Obtener Datos** > **Web**.
3. Selecciona la opción **Avanzado**.
4. En **Partes de la URL**, escribí la ruta del endpoint que querés consumir (ej. `http://evaluacion.diagnoslab.com.ar/api/analytics/empleados`).
5. En la sección **Parámetros de encabezado de solicitud HTTP**, agregá:
   - **Nombre de parámetro:** `X-Analytics-Token`
   - **Valor:** `diagnos_analytics_2025_powerbi`
6. Presioná **Aceptar**. Power BI se conectará y te mostrará el JSON listo para transformarlo en tabla y empezar a graficar.

*(Nota: si la opción Avanzada de los headers te parece engorrosa, en el paso 4 podés pegar directamente la URL con el `?token=...` al final usando la opción Básica).*
