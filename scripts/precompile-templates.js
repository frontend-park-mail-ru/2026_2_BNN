const Handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

const templatesDir = path.join(__dirname, "../public/templates");
const partialsDir = path.join(templatesDir, "partials");
const outputFile = path.join(__dirname, "../public/js/templates.compiled.js");

/**
 * Компилирует все `.hbs`-файлы из каталога в JS-выражения Handlebars.
 *
 * @param {string} dir Путь к директории с шаблонами.
 * @param {string} namespace Пространство, куда складываются функции шаблонов.
 * @returns {string[]} Список JS-строк присваивания скомпилированных шаблонов.
 */
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

/**
 * Скомпилированные шаблоны страниц (Handlebars.templates).
 * @type {string[]}
 */
const templates = compileDir(templatesDir, "Handlebars.templates");
/**
 * Скомпилированные partial-шаблоны (Handlebars.partials).
 * @type {string[]}
 */
const partials = compileDir(partialsDir, "Handlebars.partials");

/**
 * Итоговый JavaScript-код с регистрацией templates/partials.
 * @type {string}
 */
const output = `(function () {
  Handlebars.templates = Handlebars.templates || {};
  Handlebars.partials = Handlebars.partials || {};
  ${templates.join("\n  ")}
  ${partials.join("\n  ")}
})();\n`;

/**
 * Пишет итоговый bundle шаблонов в `public/js/templates.compiled.js`.
 */
fs.writeFileSync(outputFile, output, "utf-8");
console.log(`Скомпилировано шаблонов: ${templates.length}, партиалов: ${partials.length}`);
