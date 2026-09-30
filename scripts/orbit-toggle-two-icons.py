from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

old_html = '''        <button type="button" id="mobile-canvas-mode-toggle" aria-label="Viewport or draw" aria-pressed="false" title="Move viewport">
            <svg class="orbit-iso-cube" viewBox="0 0 32 32" aria-hidden="true">
                <polygon points="16,3 29,10.5 16,18 3,10.5" fill="#8be9ff"/>
                <polygon points="3,10.5 16,18 16,29 3,21.5" fill="#3b82f6"/>
                <polygon points="16,18 29,10.5 29,21.5 16,29" fill="#1d4ed8"/>
            </svg>
        </button>'''
new_html = '''        <button type="button" id="mobile-canvas-mode-toggle" aria-label="Viewport or draw" aria-pressed="false" title="Move viewport">
            <i class="fas fa-arrows-alt orbit-arrows"></i>
            <svg class="orbit-iso-cube" viewBox="0 0 32 32" aria-hidden="true">
                <polygon points="16,3 29,10.5 16,18 3,10.5" fill="#8be9ff"/>
                <polygon points="3,10.5 16,18 16,29 3,21.5" fill="#3b82f6"/>
                <polygon points="16,18 29,10.5 29,21.5 16,29" fill="#1d4ed8"/>
            </svg>
        </button>'''
if old_html in t:
    t = t.replace(old_html, new_html, 1)
    print('html both icons')
elif 'orbit-arrows' in t:
    print('html already')
else:
    raise SystemExit('toggle html missing')

old_js = "      const icon = btn.querySelector('.orbit-iso-cube');\n      if (icon) icon.style.opacity = edit ? '1' : '0.92';"
new_js = '''      const cube = btn.querySelector('.orbit-iso-cube');
      const arrows = btn.querySelector('.orbit-arrows');
      if (cube) cube.style.display = edit ? 'block' : 'none';
      if (arrows) arrows.style.display = edit ? 'none' : 'inline-block';'''
if old_js in t:
    t = t.replace(old_js, new_js, 1)
    print('js toggle icons')
elif 'orbit-arrows' in t and "edit ? 'block'" in t:
    print('js already')
else:
    print('js skip')

if '#mobile-canvas-mode-toggle .orbit-arrows' not in t:
    mark = '''        #mobile-canvas-mode-toggle .orbit-iso-cube {
            width: 1.35rem;
            height: 1.35rem;
            pointer-events: none;
            display: block;
        }'''
    add = mark + '''
        #mobile-canvas-mode-toggle .orbit-arrows {
            font-size: 1.05rem;
            pointer-events: none;
            display: inline-block;
        }
        #mobile-canvas-mode-toggle .orbit-iso-cube { display: none; }'''
    if mark in t:
        t = t.replace(mark, add, 1)
        print('css')

p.write_text(t, encoding='utf-8')
print('ok')
