const Handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

const templatesDir = path.join(__dirname, "../public/templates");
const partialsDir = path.join(templatesDir, "partials");
const outputFile = path.join(__dirname, "../public/js/templates.compiled.js");

function compileDir(dir, namespace) {
    return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith(".hbs"))
        .map((file) => {
            const name = path.basename(file, ".hbs");
            const source = fs.readFileSync(path.join(dir, file), "utf-8");
            const precompiled = Handlebars.precompile(source);

            return `${namespace}["${name}"] = Handlebars.template(${precompiled});`;
        });
}

const templates = compileDir(templatesDir, "Handlebars.templates");
const partials = compileDir(partialsDir, "Handlebars.partials");

const output = `(function () {
  Handlebars.templates = Handlebars.templates || {};
  Handlebars.partials = Handlebars.partials || {};
  ${templates.join("\n  ")}
  ${partials.join("\n  ")}
})();\n`;

fs.writeFileSync(outputFile, output, "utf-8");
console.log(`Скомпилировано шаблонов: ${templates.length}, партиалов: ${partials.length}`);
