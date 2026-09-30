from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

mark = '''        .floating-color-picker {
            position: fixed;
            width: 1px;
            height: 1px;
            opacity: 0;
            pointer-events: none;
            border: 0;
            padding: 0;
            margin: 0;
        }'''
add = mark + '''
        body.has-mobile-bar #mobile-canvas-color-picker-wrap {
            display: none !important;
        }
        body.has-mobile-bar #mobile-color-picker {
            position: static !important;
            width: 3.5rem !important;
            height: 3.5rem !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            border-radius: 9999px;
            border: 2px solid rgba(255,255,255,0.55);
            background: transparent;
            padding: 0;
            flex: 0 0 auto;
        }
        body.has-mobile-bar #mobile-mode-toggle {
            position: fixed;
            right: calc(env(safe-area-inset-right) + 0.75rem);
            bottom: calc(var(--safe-bottom) + 8.9rem);
            z-index: 58;
            width: 3.5rem;
            height: 3.5rem;
            margin: 0;
            background: rgba(17, 24, 39, 0.92);
            border: 2px solid rgba(255, 255, 255, 0.55);
        }'''
if 'body.has-mobile-bar #mobile-color-picker' in t:
    print('already')
elif mark in t:
    t = t.replace(mark, add, 1)
    print('css inserted')
else:
    raise SystemExit('floating-color-picker missing')

p.write_text(t, encoding='utf-8')
print('ok')
