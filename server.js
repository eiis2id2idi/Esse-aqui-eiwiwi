const express = require("express");
const multer  = require("multer");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");
const { exec } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

if (!fs.existsSync("output")) fs.mkdirSync("output");

// ── HELPER ───────────────────────────────────────────────────────────────────
function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message);
      else resolve(stdout);
    });
  });
}

// ── UPLOAD + EDITAR ───────────────────────────────────────────────────────────
// Parâmetros (todos opcionais via query string):
//   ?trim_start=5&trim_end=30   → corta de 5s até 30s
//   ?speed=2                    → acelera 2x (0.5 = metade da velocidade)
//   ?mute=true                  → remove áudio
//   ?resolution=1280x720        → redimensiona
//   ?grayscale=true             → preto e branco
//   ?rotate=90                  → rotaciona (90, 180, 270)
//   ?fps=30                     → muda FPS
//
// Exemplo:
//   POST /upload?speed=2&mute=true&resolution=1280x720

app.post("/upload", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Nenhum vídeo enviado" });

  const input  = req.file.path;
  const output = `output/${Date.now()}.mp4`;
  const q      = req.query;

  // Montar filtros de vídeo
  const vFilters = [];
  const aFilters = [];

  // Escala / resolução
  if (q.resolution) {
    const [w, h] = q.resolution.split("x");
    vFilters.push(`scale=${w}:${h}`);
  }

  // Preto e branco
  if (q.grayscale === "true") vFilters.push("hue=s=0");

  // Rotação
  if (q.rotate) {
    const turns = { "90": "transpose=1", "180": "transpose=1,transpose=1", "270": "transpose=2" };
    if (turns[q.rotate]) vFilters.push(turns[q.rotate]);
  }

  // Velocidade (afeta vídeo e áudio)
  const speed = parseFloat(q.speed) || 1;
  if (speed !== 1) {
    vFilters.push(`setpts=${(1/speed).toFixed(4)}*PTS`);
    // FFmpeg suporta atempo só entre 0.5 e 2.0 — encadeia se necessário
    let remaining = speed;
    while (remaining > 2.0) { aFilters.push("atempo=2.0"); remaining /= 2.0; }
    while (remaining < 0.5) { aFilters.push("atempo=0.5"); remaining /= 0.5; }
    aFilters.push(`atempo=${remaining.toFixed(4)}`);
  }

  // FPS
  if (q.fps) vFilters.push(`fps=${q.fps}`);

  // Montar comando FFmpeg
  let cmd = `ffmpeg -y`;

  // Trim (antes dos filtros para eficiência)
  if (q.trim_start) cmd += ` -ss ${q.trim_start}`;
  cmd += ` -i "${input}"`;
  if (q.trim_end)   cmd += ` -to ${q.trim_end}`;

  // Aplicar filtros
  if (vFilters.length > 0) cmd += ` -vf "${vFilters.join(",")}"`;
  if (q.mute === "true") {
    cmd += ` -an`;
  } else if (aFilters.length > 0) {
    cmd += ` -af "${aFilters.join(",")}"`;
  }

  cmd += ` -c:v libx264 -preset fast -crf 23 "${output}"`;

  try {
    await run(cmd);

    // Limpar upload temporário
    fs.unlinkSync(input);

    const filename = path.basename(output);
    res.json({
      ok: true,
      video: `/video/${filename}`,
      aplicado: {
        trim:       q.trim_start || q.trim_end ? `${q.trim_start||0}s → ${q.trim_end||'fim'}` : null,
        velocidade: speed !== 1 ? `${speed}x` : null,
        resolucao:  q.resolution || null,
        mudo:       q.mute === "true",
        pb:         q.grayscale === "true",
        rotacao:    q.rotate ? `${q.rotate}°` : null,
        fps:        q.fps || null,
      }
    });
  } catch (err) {
    fs.unlinkSync(input);
    res.status(500).json({ ok: false, error: err });
  }
});

// ── SERVIR VÍDEO ─────────────────────────────────────────────────────────────
app.get("/video/:file", (req, res) => {
  const file = path.join(__dirname, "output", req.params.file);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Vídeo não encontrado" });
  res.sendFile(file);
});

// ── LISTAR VÍDEOS ─────────────────────────────────────────────────────────────
app.get("/videos", (req, res) => {
  const files = fs.readdirSync("output").filter(f => f.endsWith(".mp4"));
  res.json({ videos: files.map(f => `/video/${f}`) });
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(3000, () => console.log("🎬 Servidor rodando na porta 3000"));
