const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;
const publicDir = path.join(__dirname, "public");

/**
 * Отдает статические файлы SPA.
 */
app.use(express.static(publicDir));

/**
 * SPA-fallback:
 * для всех не-API путей отдаем `index.html`, чтобы роутинг обрабатывался на фронте.
 */
app.get("/{*any}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

/**
 * Запускает локальный dev-сервер.
 */
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
