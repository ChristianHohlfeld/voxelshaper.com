from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
if 'morph-forms-v2.js' not in t:
    t = t.replace('<script src="orbit-zoom.js"></script>', '<script src="orbit-zoom.js"></script>\n<script src="morph-forms-v2.js"></script>', 1)
    print('script tag')
else:
    print('script already')
p.write_text(t, encoding='utf-8')
