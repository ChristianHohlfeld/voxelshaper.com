/* Orbit wheel = fly camera closer/farther. Never browser/page zoom. */
(function () {
  function onWheel(e) {
    const app = window.VoxelApp;
    if (!app || typeof app.isOrbitControlsMode !== 'function' || !app.isOrbitControlsMode()) return;
    if (e.altKey) return;

    const canvas = app.cvs;
    const host = app.containerDiv || canvas;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const overCanvas = !!(canvas && (e.target === canvas || path.includes(canvas) || (host && (host === e.target || path.includes(host) || host.contains(e.target)))));

    if (!overCanvas && !e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    e.stopPropagation();

    if (typeof app.dollyOrbitCameraBy !== 'function' || !app.cam) return;
    const target = typeof app.ensureOrbitTarget === 'function' ? app.ensureOrbitTarget() : app.orbitTarget;
    if (!target) return;

    const distance = Math.max(1, app.cam.position.distanceTo(target));
    let distanceDelta = e.deltaY * Math.max(0.15, distance * 0.0028);
    if (app.controls && app.controls.invertZoom) distanceDelta *= -1;
    app.dollyOrbitCameraBy(distanceDelta);
  }

  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
})();
