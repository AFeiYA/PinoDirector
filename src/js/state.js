export const State = {
  activeProject: null,
  activeShotId: null,
  shots: [],
  cloudData: {},
  listeners: {},

  init(project, shots) {
    this.activeProject = project;
    this.shots = shots;
    this.activeShotId = shots[0]?.id || null;
    this.emit('init');
  },

  subscribe(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  },

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  },

  setActiveShot(id) {
    this.activeShotId = id;
    this.emit('shotChange', id);
  },

  updateShotData(shotId, type, data) {
    if (!this.cloudData[`shot_${shotId}`]) {
      this.cloudData[`shot_${shotId}`] = {};
    }
    this.cloudData[`shot_${shotId}`][type] = data;
    this.emit('dataUpdate', { shotId, type, data });
  },

  setCloudData(data) {
    this.cloudData = data;
    this.emit('cloudDataLoaded', data);
  }
};
