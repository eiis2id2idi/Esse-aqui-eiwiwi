const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

// upload de vídeo
app.post("/upload", upload.single("video"), (req, res) => {
    const input = req.file.path;

    if (!fs.existsSync("output")) {
        fs.mkdirSync("output");
    }

    // versão simples (SEM FFmpeg por enquanto)
    const output = "output/video.mp4";

    fs.copyFileSync(input, output);

    res.json({
        ok: true,
        video: "/video"
    });
});

// serve vídeo
app.get("/video", (req, res) => {
    res.sendFile(__dirname + "/output/video.mp4");
});

app.listen(3000, () => {
    console.log("Rodando na porta 3000");
});
app.get("/", (req, res) => {
    res.send(`
        <h1>🎬 Auto Video AI</h1>
        <p>Servidor funcionando ✔</p>
        <p>Use /upload para enviar vídeos</p>
    `);
});
