const Handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

const templatesDir = path.join(__dirname, "../public/templates");
const outputFile = path.join(__dirname, "../public/js/templates.compiled.js");

const files = fs
    .readdirSync(templatesDir)
    .filter((file) => file.endsWith(".hbs"));

const lines = files.map((file) => {
    const name = path.basename(file, ".hbs");
    const source = fs.readFileSync(path.join(templatesDir, file), "utf-8");
    const precompiled = Handlebars.precompile(source);

    return `Handlebars.templates["${name}"] = Handlebars.template(${precompiled});`;
});

const output = `(function () {
    Handlebars.templates = Handlebars.templates || {};
    ${lines.join("\n\n  ")}
  })();`;

fs.writeFileSync(outputFile, output, "utf-8");
console.log(`Скомпилирована шаблонов: ${files.length}`);