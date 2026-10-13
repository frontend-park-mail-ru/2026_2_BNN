import fs from "fs";
import path from "path";
import Handlebars from "handlebars";

const templatesDir = path.join(__dirname, "../templates");
const partialsDir = path.join(templatesDir, "partials");
const outputFile = path.join(__dirname, "../public/templates.compiled.js");

/**
 * Компилирует все `.hbs`-файлы из каталога в JS-выражения Handlebars.
 *
 * @param dir Путь к директории с шаблонами.
 * @param namespace Пространство, куда складываются функции шаблонов.
 * @returns Список JS-строк присваивания скомпилированных шаблонов.
 */
function compileDir(dir: string, namespace: string): string[] {
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
