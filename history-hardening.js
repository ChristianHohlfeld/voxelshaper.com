(function () {
  'use strict';

  function clonePlain(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function cloneVoxel(v) {
    if (!v) return null;
    return { color: String(v.color || '#ffffff'), glass: !!v.glass };
  }

  function cloneChanges(changes) {
    const out = new Map();
    if (!changes) return out;
    const entries = changes instanceof Map ? changes.entries() : Object.entries(changes);
    for (const [key, change] of entries) {
      out.set(String(key), {
        before: cloneVoxel(change?.before),
        after: cloneVoxel(change?.after)
      });
    }
    return out;
  }

  function normalizeAction(action) {
    if (!action || typeof action !== 'object') return null;
    if (action.type === 'MODIFY') {
      const changes = cloneChanges(action.changes);
      if (!changes.size) return null;
      return { type: 'MODIFY', changes };
    }
    if (action.type === 'SELECT') {
      return {
        type: 'SELECT',
        before: new Set(action.before || []),
        after: new Set(action.after || [])
      };
    }
    if (action.type === 'MORPH') {
      return {
        type: 'MORPH',
        before: clonePlain(action.before),
        after: clonePlain(action.after),
        meta: clonePlain(action.meta || null)
      };
    }
    return clonePlain(action);
  }

  function install() {
    const app = window.VoxelApp;
    if (!app?.voxels || app.__deterministicHistoryInstalled) return !!app?.__deterministicHistoryInstalled;
    app.__deterministicHistoryInstalled = true;

    function stopTemporarySimulation() {
      try { window.VoxelBox3D?.stop?.(); } catch (_) {}
    }

    function removeVoxel(key) {
      const existing = app.voxels.get(key);
      if (!existing) return;
      if (typeof app.removeInstancedVoxel === 'function') app.removeInstancedVoxel(key);
      app.voxels.delete(key);
    }

    function writeVoxel(key, value) {
      const [x,y,z] = app.parseKey(key);
      if (y < 0 || !value) return;
      const next = cloneVoxel(value);
      const existing = app.voxels.get(key);
      if (existing) {
        existing.color = next.color;
        existing.glass = next.glass;
        if (typeof app.updateInstancedVoxelColor === 'function') {
          app.updateInstancedVoxelColor(key, next.color, next.glass);
        }
      } else {
        app.voxels.set(key, { color: next.color, glass: next.glass });
        if (typeof app.addInstancedVoxel === 'function') {
          app.addInstancedVoxel(key, x, y, z, next.color, next.glass);
        }
      }
    }

    function applyModify(action, side) {
      for (const [key, change] of action.changes) {
        const value = change?.[side] || null;
        if (value === null) removeVoxel(key);
        else writeVoxel(key, value);
      }
      app.solidInstancedMesh && (app.solidInstancedMesh.instanceMatrix.needsUpdate = true);
      app.glassInstancedMesh && (app.glassInstancedMesh.instanceMatrix.needsUpdate = true);
    }

    function applyAction(action, direction) {
      if (!action) return;
      const side = direction === 'undo' ? 'before' : 'after';
      switch (action.type) {
        case 'MODIFY':
          applyModify(action, side);
          break;
        case 'SELECT':
          app.selectedFaces = new Set(action[side] || []);
          app.syncSelectionNormalIndexFromSelection?.();
          app.updateSelectionVisuals?.();
          break;
        case 'MORPH':
          if (action[side]) app.loadFromData(action[side], { preserveHistory: true });
          if (action.meta) window.__lastHubMeta = clonePlain(action.meta);
          break;
        default:
          console.warn('[VoxelShaper][History] unsupported action', action.type);
      }
    }

    function afterHistory(direction) {
      app.autosaveScene?.();
      app.onModelChanged?.(direction);
      if (app.isRoundedPreviewEnabled) {
        try { app.rebuildRoundedPreview?.(); } catch (_) {}
      }
      app.updateSelectionVisuals?.();
    }

    app.addHistoryStep = function deterministicAddHistoryStep(action) {
      const normalized = normalizeAction(action);
      if (!normalized) return false;
      if (!Array.isArray(this.history)) this.history = [];
      if (!Number.isInteger(this.historyPointer)) this.historyPointer = this.history.length - 1;

      // Once the user edits after Undo, the abandoned future can never be replayed again.
      if (this.historyPointer < this.history.length - 1) {
        this.history.splice(this.historyPointer + 1);
      }
      this.history.push(normalized);
      const max = Math.max(1, Number(this.MAX_HISTORY_SIZE) || 100);
      if (this.history.length > max) this.history.splice(0, this.history.length - max);
      this.historyPointer = this.history.length - 1;
      this.autosaveScene?.();
      return true;
    };

    app.undo = function deterministicUndo() {
      stopTemporarySimulation();
      if (!Array.isArray(this.history) || this.historyPointer < 0 || this.historyPointer >= this.history.length) return false;
      const action = this.history[this.historyPointer];
      applyAction(action, 'undo');
      this.historyPointer -= 1;
      afterHistory('undo');
      return true;
    };

    app.redo = function deterministicRedo() {
      stopTemporarySimulation();
      if (!Array.isArray(this.history) || this.historyPointer >= this.history.length - 1) return false;
      const nextPointer = this.historyPointer + 1;
      const action = this.history[nextPointer];
      applyAction(action, 'redo');
      this.historyPointer = nextPointer;
      afterHistory('redo');
      return true;
    };

    app.historyContractVersion = 2;
    window.VoxelHistory = {
      installed: true,
      version: 2,
      normalizeAction,
      get state() {
        return {
          pointer: app.historyPointer,
          length: app.history?.length || 0,
          canUndo: app.historyPointer >= 0,
          canRedo: app.historyPointer < (app.history?.length || 0) - 1
        };
      }
    };
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 80);
  install();
})();
