import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import screeps from "rollup-plugin-screeps";

let cfg;
const dest = process.env.DEST;

if (!dest) {
  console.log("No destination specified — building to dist/ only");
} else if ((cfg = require("./.screeps.json")[dest]) == null) {
  throw new Error(`No config for destination "${dest}"`);
}

export default {
  input: "src/main.ts",
  output: {
    file: "dist/main.js",
    format: "cjs",
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" }),
    ...(cfg ? [screeps({ config: cfg, dryRun: cfg == null })] : []),
  ],
};
