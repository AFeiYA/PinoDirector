const API_BASE = '/api';

export const Storage = {

  // --- Shots / Prompts ---

  async loadShots(projectId) {
    const res = await fetch(`${API_BASE}/project/${projectId}/shots`);
    if (!res.ok) throw new Error('Failed to load shots');
    return res.json();
  },

  async savePrompt(projectId, shotId, field, value) {
    const res = await fetch(`${API_BASE}/project/${projectId}/save-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shotId, field, value })
    });
    if (!res.ok) throw new Error('Failed to save prompt');
    return res.json();
  },

  // --- Frames (Images) ---

  async loadFrameList(projectId) {
    const res = await fetch(`${API_BASE}/project/${projectId}/frames`);
    if (!res.ok) return [];
    return res.json();
  },

  async saveFrame(projectId, shotId, type, file) {
    const formData = new FormData();
    formData.append('shotId', String(shotId));
    formData.append('type', type);
    formData.append('image', file);

    const res = await fetch(`${API_BASE}/project/${projectId}/save-frame`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to save frame');
    return res.json();
  },

  // --- Projects ---

  async loadProjects() {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error('Failed to load projects');
    return res.json();
  },

  // --- Helpers ---

  framePath(projectId, shotId, type, existingFrames) {
    const prefix = `shot_${String(shotId).padStart(2, '0')}_${type}`;
    const match = existingFrames.find(f => f.startsWith(prefix));
    if (match) return `./projects/${projectId}/frames/${match}`;
    return `./projects/${projectId}/frames/${prefix}.jpg`;
  }
};
