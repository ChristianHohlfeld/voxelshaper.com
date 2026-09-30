/* MCP editor handoff.
 * Share JSON (/mcp/share/:id) is Z-up — remap to editor Y-up.
 * Catalog models (?modelId=) are loaded by VoxelApp.loadProjectFromModelId — do not double-fetch.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const token = (params.get('s') || params.get('share') || '').trim();
  if (!token) return;

  function remapZupToYup(project) {
    const src = project && typeof project === 'object' ? project : {};
    const raw = Array.isArray(src.voxels) ? src.voxels : [];
    const voxels = raw.map((v) => ({
      x: Number(v.x) | 0,
      y: Number(v.z) | 0,
      z: Number(v.y) | 0,
      color: v.color || v.hex || '#888888'
    }));
    return {
      ...src,
      currentDrawingAxis: 'y',
      voxels,
      metadata: { ...(src.metadata || {}), source: 'mcp', up: 'y', mappedFrom: 'z-up' }
    };
  }

  function alreadyEditorYup(project) {
    const meta = project && project.metadata && typeof project.metadata === 'object' ? project.metadata : {};
    return meta.up === 'y' || meta.mappedFrom === 'z-up';
  }

  function projectFrom(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (Array.isArray(payload.voxels)) return payload;
    return payload.project_json || payload.projectData || payload.project || null;
  }

  async function load() {
    const res = await fetch('https://api.voxelshaper.com/mcp/share/' + encodeURIComponent(token), { cache: 'no-store' });
    if (!res.ok) throw new Error('share ' + res.status);
    const payload = await res.json();
    let project = projectFrom(payload);
    if (!project || !Array.isArray(project.voxels) || !project.voxels.length) throw new Error('empty share');
    if (!alreadyEditorYup(project)) project = remapZupToYup(project);
    const start = Date.now();
    const tick = () => {
      const app = window.VoxelApp;
      if (app && typeof app.applyHubImportProject === 'function') {
        app.applyHubImportProject(project);
        return;
      }
      if (Date.now() - start < 20000) setTimeout(tick, 200);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => load().catch(console.warn));
  } else {
    load().catch(console.warn);
  }
})();
