// src/lib/appInfo.js
// Información de la app. Bumpear APP_VERSION manualmente cuando saques release.
//
// __APP_BUILD_DATE__ lo inyecta Vite leyendo la fecha del último commit
// (ver vite.config.js). Se actualiza solo en cada build.

/* global __APP_BUILD_DATE__ */

export const APP_NAME = "Plataforma de Desempeño";
export const APP_VERSION = "5.2";
export const BUILD_DATE = __APP_BUILD_DATE__;
export const APP_OWNER = "Diagnos S.A.";

// Contacto de soporte
export const SUPPORT_EMAIL = "sistemas@diagnos.com.ar";

// Vite reemplaza import.meta.env.MODE en build-time: "development" / "production"
export const APP_ENV = import.meta.env.MODE;
