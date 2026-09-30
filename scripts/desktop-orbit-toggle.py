from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

css_old = '''        body.has-mobile-bar #mobile-canvas-mode-toggle {
            display: flex;
        }'''
css_new = '''        body.has-mobile-bar #mobile-canvas-mode-toggle {
            display: flex;
        }
        @media (min-width: 900px) {
            #mobile-canvas-mode-toggle {
                display: flex;
                bottom: auto;
                top: calc(max(12px, env(safe-area-inset-top)) + 8.15rem);
                right: max(14px, env(safe-area-inset-right));
                width: 2.75rem;
                height: 2.75rem;
                z-index: 1001;
            }
        }'''
if css_old in t:
    t = t.replace(css_old, css_new, 1)
    print('css desktop toggle')
elif 'min-width: 900px' in t and '#mobile-canvas-mode-toggle' in t:
    print('css already')
else:
    raise SystemExit('css marker missing')

def_old = "    if (!app.mobileCanvasMode) app.mobileCanvasMode = 'view';"
def_new = "    if (!app.mobileCanvasMode) app.mobileCanvasMode = app.isMobile ? 'view' : 'edit';"
if def_old in t:
    t = t.replace(def_old, def_new, 1)
    print('default desktop edit')
else:
    print('default skip')

ptr_old = '''                this.mouseState.isModifying = (e.button === 0);
                this.mouseState.isPanning = (e.button === 1) || (this.isOrbitControlsMode() && e.button === 2 && e.shiftKey);
                this.mouseState.orbitCandidate = this.isOrbitControlsMode() && !this.mouseState.isPanning && (
                    e.button === 2 || 
                    (e.button === 0 && !startInfo.startsOnVoxel && !startsOnEditableGrid)
                );'''
ptr_new = '''                const viewMode = this.mobileCanvasMode === 'view';
                this.mouseState.isModifying = (e.button === 0) && !viewMode;
                this.mouseState.isPanning = (e.button === 1) || (this.isOrbitControlsMode() && e.button === 2 && e.shiftKey);
                this.mouseState.orbitCandidate = this.isOrbitControlsMode() && !this.mouseState.isPanning && (
                    e.button === 2 || viewMode ||
                    (e.button === 0 && !startInfo.startsOnVoxel && !startsOnEditableGrid)
                );'''
if ptr_old in t:
    t = t.replace(ptr_old, ptr_new, 1)
    print('pointer view mode')
elif 'const viewMode = this.mobileCanvasMode === \'view\'' in t:
    print('pointer already')
else:
    raise SystemExit('pointer marker missing')

p.write_text(t, encoding='utf-8')
print('desktop orbit toggle ok')
