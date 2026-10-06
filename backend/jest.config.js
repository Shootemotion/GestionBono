export default {
  testEnvironment: "node",
  transform: {
    // `.ts` incluido: el motor está escrito en TypeScript y Node lo ejecuta
    // borrando los tipos. Babel hace lo mismo acá, con preset-typescript.
    // No valida tipos — eso es `npm run tipos`.
    "^.+\\.(js|ts)$": "babel-jest",
  },
  moduleNameMapper: {
    // El alias `@/` del frontend. Lo resuelve Vite en el navegador y jsconfig
    // en el editor, pero jest no sabe nada de ninguno de los dos, y hace
    // falta para testear archivos del front desde acá.
    "^@/(.*)$": "<rootDir>/../src/$1",
    // Imports relativos que traen la extensión: se les saca para que jest
    // resuelva el archivo real, sea .js o .ts.
    "^(\\.{1,2}/.*)\\.(?:js|ts)$": "$1",
  },
};
