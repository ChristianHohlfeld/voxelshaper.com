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

    if (!app.cam) return;
    // Normalised px delta (lines/pages converted, one event capped at one notch) x app.WHEEL_ZOOM_SPEED,
    // so notched wheels and trackpads feel alike. Touch pinch uses its own ORBIT_ZOOM_SPEED.
    const px = typeof app.normalizeWheelDelta === 'function'
      ? app.normalizeWheelDelta(e)
      : Math.max(-100, Math.min(100, e.deltaY * (e.deltaMode === 1 ? 33.3 : (e.deltaMode === 2 ? 800 : 1))));
    let logStep = px * (app.WHEEL_ZOOM_SPEED || 0.0018);
    if (app.controls && app.controls.invertZoom) logStep *= -1;
    if (typeof app.zoomOrbitByLog === 'function') {
      app.zoomOrbitByLog(logStep);
    } else if (typeof app.dollyOrbitCameraBy === 'function') {
      const target = typeof app.ensureOrbitTarget === 'function' ? app.ensureOrbitTarget() : app.orbitTarget;
      if (!target) return;
      const distance = Math.max(1, app.cam.position.distanceTo(target));
      app.dollyOrbitCameraBy(distance * Math.exp(Math.max(-0.7, Math.min(0.7, logStep))) - distance);
    }
  }

  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
})();
