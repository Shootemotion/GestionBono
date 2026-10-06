export default {
  testEnvironment: "node",
  transform: {
    "^.+\\.js$": "babel-jest", // usar babel para .js
  },
  moduleNameMapper: {
    // El alias `@/` del frontend (lo resuelve Vite en el navegador y jsconfig
    // en el editor, pero jest no sabe nada de ninguno de los dos).
    //
    // Hace falta para testear archivos del front desde acá: `evaluarCumple.js`
    // vive en src/lib y calcula el valor que se guarda en cada hito, así que
    // merece tests aunque el corredor esté en backend/.
    "^@/(.*)$": "<rootDir>/../src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1", // corrige imports relativos con extensión
  },
};
