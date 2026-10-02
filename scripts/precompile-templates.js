const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const templatesDir = path.join(__dirname, "../public/templates");
const partialsDir = path.join(templatesDir, "partials");
const outputFile = path.join(__dirname, "../public/js/templates.compiled.js");
const cli = path.join(__dirname, "../node_modules/handlebars/bin/handlebars");

function hbsFiles(dir) {
    return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith(".hbs"))
        .map((file) => path.join(dir, file));
}

function compile(files, extraArgs) {
    const tempFile = path.join(os.tmpdir(), `bnn-templates-${process.pid}.js`);
    execFileSync(
        process.execPath,
        [cli, ...files, "-e", "hbs", "-f", tempFile, ...extraArgs],
        { stdio: "inherit" }
    );
    const source = fs.readFileSync(tempFile, "utf-8");
    fs.unlinkSync(tempFile);
    return source;
}

const pages = compile(hbsFiles(templatesDir), []);
const partials = compile(hbsFiles(partialsDir), ["-p"]);

fs.writeFileSync(outputFile, `${pages}\n${partials}\n`, "utf-8");