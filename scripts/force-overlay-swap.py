from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

old_color = '''        #mobile-canvas-color-picker-wrap {
            --active-picker-color: #FFFFFF;
            position: fixed;
            right: calc(env(safe-area-inset-right) + 0.75rem);
            bottom: calc(var(--safe-bottom) + 8.9rem);
            width: 3.5rem;
            height: 3.5rem;'''
new_color = '''        #mobile-canvas-color-picker-wrap {
            --active-picker-color: #FFFFFF;
            display: none;
            position: fixed;
            right: calc(env(safe-area-inset-right) + 0.75rem);
            bottom: calc(var(--safe-bottom) + 10.2rem) !important;
            width: 3.5rem;
            height: 3.5rem;'''
if old_color in t:
    t = t.replace(old_color, new_color, 1)
    print('color overlay up')
elif 'bottom: calc(var(--safe-bottom) + 10.2rem) !important;' in t:
    print('color already forced')
else:
    raise SystemExit('color wrap missing')

old_mode = '''            bottom: calc(var(--safe-bottom) + 4.9rem);
            width: 3.5rem;
            height: 3.5rem;
            border-radius: 9999px;
            border: 2px solid rgba(255, 255, 255, 0.55);'''
new_mode = '''            bottom: calc(var(--safe-bottom) + 4.9rem) !important;
            width: 3.5rem;
            height: 3.5rem;
            border-radius: 9999px;
            border: 2px solid rgba(255, 255, 255, 0.55);'''
if old_mode in t:
    t = t.replace(old_mode, new_mode, 1)
    print('mode overlay down')
else:
    print('mode bottom skip')

mark = '        body.has-mobile-bar #mobile-canvas-mode-toggle {\n            display: flex;\n        }'
add = '''        body.has-mobile-bar #mobile-canvas-mode-toggle {
            display: flex;
        }
        body.has-mobile-bar #mobile-canvas-color-picker-wrap {
            display: block;
        }'''
if 'body.has-mobile-bar #mobile-canvas-color-picker-wrap' not in t and mark in t:
    t = t.replace(mark, add, 1)
    print('color visible on mobile bar')
else:
    print('color visibility skip')

p.write_text(t, encoding='utf-8')
print('forced overlay swap')
