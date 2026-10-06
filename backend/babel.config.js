export default {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    // Para los tests: jest transforma los .ts con babel, que borra los tipos
    // igual que hace Node al ejecutar. No compila ni valida — eso lo hace
    // `npm run tipos`.
    "@babel/preset-typescript",
  ],
};
