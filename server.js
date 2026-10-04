const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

app.get("/{*any}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
