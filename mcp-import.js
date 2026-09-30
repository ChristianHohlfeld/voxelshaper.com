/* Load MCP share (?from=mcp&s=TOKEN) or catalog model (?from=mcp&modelId=ID) into VoxelApp. Remap Z-up → editor Y-up. */
(function () {
  const params = new URLSearchParams(location.search);
  const token = (params.get('s') || params.get('share') || '').trim();
  const modelId = (params.get('modelId') || params.get('m') || '').trim();
  const from = (params.get('from') || '').trim();
  if ((!token && !modelId) || (from && from !== 'mcp' && from !== 'hub')) return;

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

  function projectFrom(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (Array.isArray(payload.voxels)) return payload;
    return payload.project_json || payload.projectData || payload.project || null;
  }

  async function fetchProject() {
    const urls = [];
    if (token) urls.push('https://api.voxelshaper.com/mcp/share/' + encodeURIComponent(token));
    if (modelId) urls.push('https://api.voxelshaper.com/api/models/' + encodeURIComponent(modelId));
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          lastErr = new Error(url + ' ' + res.status);
          continue;
        }
        const payload = await res.json();
        const project = projectFrom(payload);
        if (project && Array.isArray(project.voxels) && project.voxels.length) return project;
        lastErr = new Error(url + ' empty project');
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('MCP import source missing');
  }

  async function load() {
    const project = remap(await fetchProject());
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
