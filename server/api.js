import express from 'express';
import multer from 'multer';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROJECTS_DIR = join(ROOT, 'projects');

const app = express();
app.use(express.json({ limit: '10mb' }));

// --- List all projects ---
app.get('/api/projects', (req, res) => {
  try {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const configPath = join(PROJECTS_DIR, d.name, 'config.json');
        if (!existsSync(configPath)) return null;
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        return { id: d.name, ...config };
      })
      .filter(Boolean);
    res.json(dirs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get shots for a project ---
app.get('/api/project/:id/shots', (req, res) => {
  try {
    const shotsPath = join(PROJECTS_DIR, req.params.id, 'shots.json');
    const data = JSON.parse(readFileSync(shotsPath, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Project not found' });
  }
});

// --- Get list of existing frames for a project ---
app.get('/api/project/:id/frames', (req, res) => {
  try {
    const framesDir = join(PROJECTS_DIR, req.params.id, 'frames');
    if (!existsSync(framesDir)) return res.json([]);
    const files = readdirSync(framesDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Save prompt update ---
app.post('/api/project/:id/save-prompt', (req, res) => {
  try {
    const { shotId, field, value } = req.body;
    const shotsPath = join(PROJECTS_DIR, req.params.id, 'shots.json');
    const data = JSON.parse(readFileSync(shotsPath, 'utf-8'));

    const shot = data.shots.find(s => s.id === shotId);
    if (!shot) return res.status(404).json({ error: `Shot ${shotId} not found` });

    shot[field] = value;
    writeFileSync(shotsPath, JSON.stringify(data, null, 2), 'utf-8');

    res.json({ ok: true, shotId, field });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Save full project shots ---
app.post('/api/project/:id/save-project-full', (req, res) => {
  try {
    const { shots } = req.body;
    const shotsPath = join(PROJECTS_DIR, req.params.id, 'shots.json');
    const data = JSON.parse(readFileSync(shotsPath, 'utf-8'));

    data.shots = shots;
    writeFileSync(shotsPath, JSON.stringify(data, null, 2), 'utf-8');

    res.json({ ok: true, message: 'shots.json updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Save frame image ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const framesDir = join(PROJECTS_DIR, req.params.id, 'frames');
      mkdirSync(framesDir, { recursive: true });
      cb(null, framesDir);
    },
    filename: (req, file, cb) => {
      const { shotId, type } = req.body;
      const ext = file.originalname.split('.').pop() || 'jpg';
      cb(null, `shot_${String(shotId).padStart(2, '0')}_${type}.${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

app.post('/api/project/:id/save-frame', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filename = req.file.filename;
    res.json({ ok: true, filename, path: `./projects/${req.params.id}/frames/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n  🎬 Pino Director API running at http://localhost:${PORT}\n`);
});
