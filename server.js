const express = require("express");
const path = require("path")

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"))
});

app.get("/login.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "js", "pages", "login.html"));
});
  
app.get("/register.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "js", "pages", "register.html"));
});

app.get("/notes", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "js", "pages", "main.html"));
})

app.get("/{*any}",(req, res) => {
    res.sendFile(path.join(__dirname, "index.html"))
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});