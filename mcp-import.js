/* Load MCP share (?from=mcp&s=TOKEN) into VoxelApp. Remap Z-up → editor Y-up. */
(function () {
  const params = new URLSearchParams(location.search);
  const token = (params.get('s') || params.get('share') || '').trim();
  const from = (params.get('from') || '').trim();
  if (!token || (from && from !== 'mcp')) return;

  function remap(project) {
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
      metadata: { ...(src.metadata || {}), source: 'mcp', up: 'y' }
    };
  }

  async function load() {
    const url = 'https://api.voxelshaper.com/mcp/share/' + encodeURIComponent(token);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('MCP share ' + res.status);
    const payload = await res.json();
    const project = remap(payload.project_json || payload.projectData || payload);
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
