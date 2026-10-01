/* MCP editor handoff.
 * Share JSON (/mcp/share/:id) is Z-up — remap voxels + physics to editor Y-up.
 * Catalog models (?modelId=) are loaded by VoxelApp.loadProjectFromModelId — do not double-fetch.
 * ?physicsTest=pendulum loads the deterministic local Box3D test model.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const token = (params.get('s') || params.get('share') || '').trim();
  const physicsTest = (params.get('physicsTest') || '').trim().toLowerCase();
  if (!token && !physicsTest) return;

  const mapVecZupToYup = (v) => Array.isArray(v) && v.length >= 3
    ? [Number(v[0]) || 0, Number(v[2]) || 0, Number(v[1]) || 0]
    : v;

  function remapPhysicsZupToYup(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.joints)) return raw;
    return {
      ...raw,
      joints: raw.joints.map((joint) => ({
        ...joint,
        baseSeed: joint.baseSeed == null ? null : mapVecZupToYup(joint.baseSeed),
        movingSeed: mapVecZupToYup(joint.movingSeed),
        anchor: mapVecZupToYup(joint.anchor),
        axis: mapVecZupToYup(joint.axis)
      }))
    };
  }

  function remapZupToYup(project) {
    const src = project && typeof project === 'object' ? project : {};
    const raw = Array.isArray(src.voxels) ? src.voxels : [];
    const voxels = raw.map((v) => ({
      ...v,
      x: Number(v.x) | 0,
      y: Number(v.z) | 0,
      z: Number(v.y) | 0,
      color: v.color || v.hex || '#888888'
    }));
    const sourcePhysics = src.physicsV1 || src.metadata?.physicsV1 || null;
    const physicsV1 = remapPhysicsZupToYup(sourcePhysics);
    return {
      ...src,
      currentDrawingAxis: 'y',
      voxels,
      ...(physicsV1 ? { physicsV1 } : {}),
      metadata: {
        ...(src.metadata || {}),
        ...(physicsV1 ? { physicsV1 } : {}),
        source: 'mcp',
        up: 'y',
        mappedFrom: 'z-up'
      }
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

  function applyProject(project, isTest) {
    const start = Date.now();
    const tick = () => {
      const app = window.VoxelApp;
      if (app && typeof app.applyHubImportProject === 'function') {
        app.applyHubImportProject(project);
        if (isTest) {
          const enablePhysics = () => {
            const p = window.VoxelPhysics;
            if (!p) {
              if (Date.now() - start < 20000) setTimeout(enablePhysics, 100);
              return;
            }
            p.enable();
            const first = p.state?.joints?.[0];
            if (first) p.state.active = first.id;
          };
          setTimeout(enablePhysics, 80);
        }
        return;
      }
      if (Date.now() - start < 20000) setTimeout(tick, 200);
    };
    tick();
  }

  async function load() {
    if (physicsTest) {
      if (physicsTest !== 'pendulum') throw new Error('unknown physicsTest');
      const res = await fetch('/examples/physics-pendulum.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('physics test model ' + res.status);
      const project = await res.json();
      applyProject(project, true);
      return;
    }

    const res = await fetch('https://api.voxelshaper.com/mcp/share/' + encodeURIComponent(token), { cache: 'no-store' });
    if (!res.ok) throw new Error('share ' + res.status);
    const payload = await res.json();
    let project = projectFrom(payload);
    if (!project || !Array.isArray(project.voxels) || !project.voxels.length) throw new Error('empty share');
    if (!alreadyEditorYup(project)) project = remapZupToYup(project);
    applyProject(project, false);
  }

  const run = () => load().catch((err) => console.error('[VoxelShaper][MCP import]', err));
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
