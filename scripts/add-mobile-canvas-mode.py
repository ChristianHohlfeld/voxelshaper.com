from pathlib import Path

p = Path('index.html')
t = p.read_text(encoding='utf-8')
if 'id="mobile-canvas-mode-toggle"' in t:
    print('already present')
    raise SystemExit(0)

css = """
        #mobile-canvas-mode-toggle {
            display: none;
            position: fixed;
            right: calc(env(safe-area-inset-right) + 0.75rem);
            bottom: calc(var(--safe-bottom) + 8.9rem);
            width: 3.5rem;
            height: 3.5rem;
            border-radius: 9999px;
            border: 2px solid rgba(255, 255, 255, 0.55);
            background: rgba(17, 24, 39, 0.92);
            color: #e5e7eb;
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
            z-index: 58;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        }
        body.has-mobile-bar #mobile-canvas-mode-toggle {
            display: flex;
        }
        #mobile-canvas-mode-toggle.is-edit {
            border-color: rgba(56, 189, 248, 0.9);
            background: rgba(8, 47, 73, 0.95);
            color: #7dd3fc;
        }
        #mobile-canvas-mode-toggle i {
            font-size: 1.05rem;
            pointer-events: none;
        }
"""

marker = '#mobile-canvas-color-picker-wrap {'
if marker not in t:
    raise SystemExit('css anchor missing')
t = t.replace(marker, css + '\n        ' + marker, 1)

html_anchor = '<span id="mobile-canvas-color-picker-badge" aria-hidden="true"><i class="fas fa-brush"></i></span>\n        </div>\n'
btn = html_anchor + '''
        <button type="button" id="mobile-canvas-mode-toggle" aria-label="Viewport or draw" aria-pressed="false" title="Move viewport">
            <i class="fas fa-arrows-alt"></i>
        </button>
'''
if html_anchor not in t:
    raise SystemExit('html anchor missing')
t = t.replace(html_anchor, btn, 1)

old = """                        if (this.activePointers.size === 1) {
                            const startInfo = this.getPointerSceneStartInfo(e.clientX, e.clientY);
                            this.touchState.startedOnVoxel = startInfo.startsOnVoxel;
                            if (startInfo.startsOnVoxel || (this.currentMode === 'FREE' && startInfo.startsOnBuildTarget)) {
                                this.prepareMobileModifyGesture(e.clientX, e.clientY);
                            } else {
                                this.touchState.isInteracting = false;
                                this.touchState.isLookAround = false;
                                this.mouseState.orbitCandidate = true;
                            }
                        }"""
new = """                        if (this.activePointers.size === 1) {
                            const startInfo = this.getPointerSceneStartInfo(e.clientX, e.clientY);
                            this.touchState.startedOnVoxel = startInfo.startsOnVoxel;
                            const canvasMode = this.mobileCanvasMode || 'view';
                            const wantEdit = canvasMode === 'edit' || (canvasMode !== 'view' && (startInfo.startsOnVoxel || (this.currentMode === 'FREE' && startInfo.startsOnBuildTarget)));
                            if (wantEdit) {
                                this.prepareMobileModifyGesture(e.clientX, e.clientY);
                            } else {
                                this.touchState.isInteracting = false;
                                this.touchState.isLookAround = false;
                                this.mouseState.orbitCandidate = true;
                            }
                        }"""
if old not in t:
    raise SystemExit('pointer branch missing')
t = t.replace(old, new, 1)

script = """<script>
(function () {
  function bindMobileCanvasMode() {
    const app = window.VoxelApp;
    const btn = document.getElementById('mobile-canvas-mode-toggle');
    if (!app || !btn || btn.dataset.bound === '1') return !!(btn && btn.dataset.bound === '1');
    btn.dataset.bound = '1';
    if (!app.mobileCanvasMode) app.mobileCanvasMode = 'view';
    const sync = function () {
      const edit = app.mobileCanvasMode === 'edit';
      btn.classList.toggle('is-edit', edit);
      btn.setAttribute('aria-pressed', edit ? 'true' : 'false');
      btn.title = edit ? 'Draw / erase / paint' : 'Move viewport';
      btn.setAttribute('aria-label', btn.title);
      const icon = btn.querySelector('i');
      if (icon) icon.className = edit ? 'fas fa-pencil-alt' : 'fas fa-arrows-alt';
    };
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      app.mobileCanvasMode = app.mobileCanvasMode === 'edit' ? 'view' : 'edit';
      sync();
      if (typeof app.showToast === 'function') {
        app.showToast(
          app.mobileCanvasMode === 'edit' ? 'Draw' : 'View',
          app.mobileCanvasMode === 'edit' ? 'Tap to place, erase or paint' : 'Drag to look around',
          'info',
          900
        );
      }
    });
    sync();
    return true;
  }
  const timer = setInterval(function () {
    if (bindMobileCanvasMode()) clearInterval(timer);
  }, 200);
  setTimeout(function () { clearInterval(timer); }, 20000);
})();
</script>
"""
if '</body>' not in t:
    raise SystemExit('body end missing')
t = t.replace('</body>', script + '</body>', 1)
p.write_text(t, encoding='utf-8')
print('mobile canvas mode added')
