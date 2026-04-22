import Chart from 'chart.js/auto';
import { State } from './state.js';
import { Storage } from './storage.js';

// Elements
const el = {
  projectName: document.getElementById('project-name'),
  timeline: document.getElementById('timeline'),
  shotLabel: document.getElementById('shot-label'),
  actTitle: document.getElementById('act-title'),
  shotTime: document.getElementById('shot-time'),
  lyricText: document.getElementById('lyric-text'),
  promptEn: document.getElementById('prompt-en'),
  promptCn: document.getElementById('prompt-cn'),
  promptMotion: document.getElementById('prompt-motion'),
  uploadGrid: document.getElementById('upload-grid'),
  progressText: document.getElementById('progress-text'),
  fileInput: document.getElementById('file-input'),
  btnExport: document.getElementById('btn-export'),
  syncStatus: document.getElementById('sync-status'),
};

let intensityChart = null;
let currentUploadType = null;
let currentProjectId = 'the-hollow';
let existingFrames = [];   // list of filenames on disk

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  currentProjectId = urlParams.get('project') || 'the-hollow';

  try {
    // 1. Load project data from filesystem via API
    const data = await Storage.loadShots(currentProjectId);
    const config = { name: data.projectName, frameLabels: ['Start Frame', 'Transition', 'End Frame'] };

    try {
      const cfgRes = await fetch(`./projects/${currentProjectId}/config.json`);
      if (cfgRes.ok) Object.assign(config, await cfgRes.json());
    } catch (_) { /* use defaults */ }

    State.init(config, data.shots);
    el.projectName.innerText = config.name;

    // 2. Load existing frame filenames
    existingFrames = await Storage.loadFrameList(currentProjectId);

    // 3. Setup UI
    renderTimeline();
    setupUploadGrid(config);
    initChart(data.shots);
    setupEvents(currentProjectId);

    // 4. Select first shot
    State.setActiveShot(data.shots[0].id);
    updateProgress();
    el.syncStatus.innerText = 'Connected';

  } catch (err) {
    console.error('Failed to initialize app:', err);
    el.syncStatus.innerText = 'Error: API offline?';
  }
}

// --- Helpers ---

function hasFrame(shotId, type) {
  const prefix = `shot_${String(shotId).padStart(2, '0')}_${type}`;
  return existingFrames.some(f => f.startsWith(prefix));
}

function frameCountForShot(shotId) {
  let count = 0;
  ['s', 'm', 'e'].forEach(t => { if (hasFrame(shotId, t)) count++; });
  return count;
}

// --- Timeline ---

function renderTimeline() {
  el.timeline.innerHTML = '';
  State.shots.forEach(shot => {
    const card = document.createElement('div');
    card.id = `shot-${shot.id}`;
    card.className = 'shot-card';
    card.onclick = () => State.setActiveShot(shot.id);

    const filled = frameCountForShot(shot.id);
    const statusClass = filled === 3 ? 'color: var(--success)' : filled > 0 ? 'color: var(--accent-primary)' : 'color: var(--text-muted)';

    card.innerHTML = `
      <div class="meta">
        <span style="${statusClass}">${filled}/3 Frames</span>
        <span>#${shot.id.toString().padStart(2, '0')}</span>
      </div>
      <div class="lyric">${shot.lyric}</div>
    `;

    // Act color
    const actColors = { 'act-I': '#64748b', 'act-II': '#a21caf', 'act-III': '#f97316', 'act-IV': '#fef08a' };
    card.style.borderLeftColor = actColors[shot.actClass] || '#64748b';

    el.timeline.appendChild(card);
  });
}

// --- Upload Grid ---

function setupUploadGrid(config) {
  el.uploadGrid.innerHTML = '';
  const labels = config.frameLabels || ['Start Frame', 'Transition', 'End Frame'];
  const icons = ['🖼️', '🎬', '🏁'];
  const types = ['s', 'm', 'e'];

  labels.forEach((label, index) => {
    const type = types[index];
    const box = document.createElement('div');
    box.className = 'upload-box';
    box.innerHTML = `
      <img id="img-${type}" class="hidden">
      <div id="label-${type}" class="flex flex-col items-center">
        <span style="font-size: 24px; margin-bottom: 8px;">${icons[index]}</span>
        <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">${label}</span>
      </div>
      <div class="overlay">
        <span style="font-size: 10px; font-weight: 800; color: #fff; text-transform: uppercase; background: var(--accent-secondary); padding: 4px 12px; border-radius: 4px;">Update</span>
      </div>
    `;
    box.onclick = () => { currentUploadType = type; el.fileInput.click(); };
    el.uploadGrid.appendChild(box);
  });
}

// --- Events ---

function setupEvents(projectId) {

  // Shot selection
  State.subscribe('shotChange', (id) => {
    const shot = State.shots.find(s => s.id === id);
    if (!shot) return;

    document.querySelectorAll('.shot-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`shot-${id}`)?.classList.add('active');

    el.shotLabel.innerText = `Shot #${id.toString().padStart(2, '0')}`;
    el.actTitle.innerText = shot.act;
    el.shotTime.innerText = `${shot.start} - Audio Segment`;
    el.lyricText.innerText = shot.lyric;

    el.promptEn.innerText = shot.pEn;
    el.promptCn.innerText = shot.pCn;
    el.promptMotion.innerText = shot.motion;

    // Update image previews
    ['s', 'm', 'e'].forEach(type => {
      const img = document.getElementById(`img-${type}`);
      const label = document.getElementById(`label-${type}`);
      if (hasFrame(id, type)) {
        img.src = Storage.framePath(projectId, id, type, existingFrames) + `?t=${Date.now()}`;
        img.classList.remove('hidden');
        label.classList.add('hidden');
      } else {
        img.classList.add('hidden');
        label.classList.remove('hidden');
      }
    });

    updateChartHighlight(id);
  });

  // Prompt inline editing – save on blur
  const promptFields = [
    { el: el.promptEn, field: 'pEn' },
    { el: el.promptCn, field: 'pCn' },
    { el: el.promptMotion, field: 'motion' },
  ];

  promptFields.forEach(({ el: fieldEl, field }) => {
    fieldEl.onblur = async () => {
      const shot = State.shots.find(s => s.id === State.activeShotId);
      if (!shot || shot[field] === fieldEl.innerText) return;   // no change

      try {
        el.syncStatus.innerText = 'Saving...';
        await Storage.savePrompt(projectId, State.activeShotId, field, fieldEl.innerText);
        shot[field] = fieldEl.innerText;   // update local state
        el.syncStatus.innerText = 'Saved to shots.json';
        setTimeout(() => el.syncStatus.innerText = 'Connected', 2000);
      } catch (err) {
        el.syncStatus.innerText = 'Save failed';
      }
    };
  });

  // Image upload – save real file via API
  el.fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUploadType) return;

    el.syncStatus.innerText = 'Uploading...';
    try {
      const result = await Storage.saveFrame(projectId, State.activeShotId, currentUploadType, file);

      // Add to our known frames list
      if (!existingFrames.includes(result.filename)) {
        existingFrames.push(result.filename);
      }

      // Refresh current shot view
      State.setActiveShot(State.activeShotId);
      renderTimeline();
      updateProgress();
      el.syncStatus.innerText = `Saved ${result.filename}`;
      setTimeout(() => el.syncStatus.innerText = 'Connected', 2000);
    } catch (err) {
      el.syncStatus.innerText = 'Upload failed';
    }

    el.fileInput.value = '';   // reset so same file can be re-selected
  };

  // Export as JSON download
  el.btnExport.onclick = async () => {
    const data = await Storage.loadShots(projectId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${projectId}_shots.json`;
    a.click();
  };

  // Copy buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.getAttribute('data-target');
      const text = document.getElementById(targetId).innerText;
      navigator.clipboard.writeText(text);
      const orig = btn.innerText;
      btn.innerText = 'COPIED';
      setTimeout(() => btn.innerText = orig, 1000);
    };
  });
}

// --- Progress ---

function updateProgress() {
  let total = 0;
  State.shots.forEach(s => { total += frameCountForShot(s.id); });
  el.progressText.innerText = `${total} / ${State.shots.length * 3} Frames`;
}

// --- Chart ---

function initChart(shots) {
  const canvas = document.getElementById('intensity-chart');
  if (!canvas) return;
  intensityChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: shots.map(s => s.id),
      datasets: [{
        data: shots.map(s => s.intensity),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { display: false, min: 0, max: 12 },
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false } }
      }
    }
  });
}

function updateChartHighlight(id) {
  if (!intensityChart) return;
  const idx = State.shots.findIndex(s => s.id === id);
  intensityChart.data.datasets[0].pointRadius = State.shots.map((_, i) => i === idx ? 6 : 0);
  intensityChart.data.datasets[0].pointBackgroundColor = State.shots.map((_, i) => i === idx ? '#fff' : '#3b82f6');
  intensityChart.update('none');
}

init();
