from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

old_tap = '''            handleTapInteraction: function (event) {
                const clientX = event?.clientX ?? this.mouseState.lastX ?? this.mouseState.downX;'''
new_tap = '''            handleTapInteraction: function (event) {
                if (this.mobileCanvasMode === 'view') return;
                const clientX = event?.clientX ?? this.mouseState.lastX ?? this.mouseState.downX;'''
if old_tap in t:
    t = t.replace(old_tap, new_tap, 1)
    print('guard handleTapInteraction')
elif "if (this.mobileCanvasMode === 'view') return;" in t:
    print('tap guard already')
else:
    raise SystemExit('handleTapInteraction missing')

old_up = '''                    } else if (this.isOrbitControlsMode() && beforeCount === 1 && !this.mouseState.isDragging && !this.mouseState.holdActionApplied && (this.isMobile || e.button === 0)) {
                        this.mouseState.isModifying = true;
                        this.handleTapInteraction(e);'''
new_up = '''                    } else if (this.mobileCanvasMode !== 'view' && this.isOrbitControlsMode() && beforeCount === 1 && !this.mouseState.isDragging && !this.mouseState.holdActionApplied && (this.isMobile || e.button === 0)) {
                        this.mouseState.isModifying = true;
                        this.handleTapInteraction(e);'''
if old_up in t:
    t = t.replace(old_up, new_up, 1)
    print('guard mobile tap-up')
else:
    print('mobile tap-up skip')

old_desk = '''                } else if (!this.mouseState.isDragging && this.mouseState.isModifying && !this.mouseState.holdActionApplied && e.button === 0) { // Desktop tap
                    this.handleTapInteraction(e);'''
new_desk = '''                } else if (this.mobileCanvasMode !== 'view' && !this.mouseState.isDragging && this.mouseState.isModifying && !this.mouseState.holdActionApplied && e.button === 0) { // Desktop tap
                    this.handleTapInteraction(e);'''
if old_desk in t:
    t = t.replace(old_desk, new_desk, 1)
    print('guard desktop tap-up')
else:
    print('desktop tap-up skip')

p.write_text(t, encoding='utf-8')
print('view-mode taps blocked')
