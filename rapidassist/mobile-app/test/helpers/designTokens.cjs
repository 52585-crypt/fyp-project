// Real design tokens for node tests (pure data, no React Native imports).
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../../src/design/tokens.ts");
const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const module_ = { exports: {} };
new Function("module", "exports", "require", outputText)(module_, module_.exports, require);
module.exports = module_.exports;
