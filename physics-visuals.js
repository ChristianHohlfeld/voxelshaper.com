(function () {
  'use strict';

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    if (!app?.scene || !physics?.simpleMode) return false;
    if (window.VoxelPhysicsVisuals?.installed) return true;

    // Simple mode intentionally has no joint/axis/motor gizmos.
    // The moving Box3D voxels themselves are the only physics visualization.
    const old = app.scene.getObjectByName?.('VoxelPhysicsVisuals');
    if (old) old.parent?.remove(old);

    window.VoxelPhysicsVisuals = {
      installed: true,
      simpleMode: true,
      redraw() {},
      destroy() {}
    };
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 80);
  install();
})();
