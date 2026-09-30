from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

# mode toggle is higher (8.9rem), color is lower (4.9rem) — swap on mobile only
old_mode = '''        #mobile-canvas-mode-toggle {
            display: none;
            position: fixed;
            right: calc(env(safe-area-inset-right) + 0.75rem);
            bottom: calc(var(--safe-bottom) + 8.9rem);'''
new_mode = '''        #mobile-canvas-mode-toggle {
            display: none;
            position: fixed;
            right: calc(env(safe-area-inset-right) + 0.75rem);
            bottom: calc(var(--safe-bottom) + 4.9rem);'''
if old_mode in t:
    t = t.replace(old_mode, new_mode, 1)
    print('mode lower')
elif 'bottom: calc(var(--safe-bottom) + 4.9rem);' in t[t.find('#mobile-canvas-mode-toggle'):t.find('#mobile-canvas-mode-toggle')+280]:
    print('mode already lower')
else:
    raise SystemExit('mode toggle css missing')

old_color = '''        #mobile-canvas-color-picker-wrap {
            --active-picker-color: #FFFFFF;
            position: fixed;
            right: calc(env(safe-area-inset-right) + 0.75rem);
            bottom: calc(var(--safe-bottom) + 4.9rem);'''
new_color = '''        #mobile-canvas-color-picker-wrap {
            --active-picker-color: #FFFFFF;
            position: fixed;
            right: calc(env(safe-area-inset-right) + 0.75rem);
            bottom: calc(var(--safe-bottom) + 8.9rem);'''
if old_color in t:
    t = t.replace(old_color, new_color, 1)
    print('color higher')
else:
    raise SystemExit('color wrap css missing')

p.write_text(t, encoding='utf-8')
print('swapped')
