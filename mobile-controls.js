// mobile-controls.js
export function initMobileControls(VS_APP) {
    // Mobile specific global state for interactions
    let activePointers = new Map();
    let gestureState = { type: 'none', startDist: 0, startMid: { x: 0, y: 0 }, lastMid: { x: 0, y: 0 }, lastDist: 0, startTime: 0, initialPointerCount: 0 };
    let tapCandidate = null; // Unused in current logic, but kept for context if needed
    let doubleTapDragActive = false; // Flag for double tap to enable drawing/editing

    // Touch-specific thresholds (copied from original as they were global)
    const PINCH_REL_TH = 0.08;
    const MOVE_PX = 15;
    const ROTATE_SPEED_TOUCH_MOBILE = 0.008;
    const PAN_SPEED_TOUCH_MOBILE = 0.15;
    const PINCH_ZOOM_MULT_MOBILE = 80;
    const DOUBLE_TAP_TIME_THRESHOLD = 300; // ms
    const DOUBLE_TAP_DIST_THRESHOLD = 20; // pixels

    // Interaction state variables
    let pointerIsDown = false;
    let lastActionVoxelCoords = null;
    let initialClickPos = null;
    let initialTargetVoxelCoords = null;
    let voxelsAtDragStart = null;
    let currentStrokeVoxels = new Map();
    let currentStrokeVoxelKeys = new Set();
    let isDragging = false;
    let dragAxisLock = null;
    let dragFixedLayerCoord = null;

    const {
        cvs, cam, showToast, currentColor, previewVoxelMesh, previewVoxelMaterial,
        updatePreviewVoxel, calculateRayTargetVoxelCoords, performVoxelModification,
        getVoxelsOnLine, addCommand, parseKey,
        GRID, Modes, tutorial,
        undo, redo, saveJSON, resetCameraPosition, cycleMode,
        loginLogout
    } = VS_APP;

    // --- Event Listeners for Mobile Controls ---
    const mobileMenuToggle = document.getElementById('menuToggle');
    const controlsPanel = document.getElementById('controls'); // The desktop controls div used as mobile overlay
    const mobileUndoBtn = document.getElementById('mobile-undo');
    const mobileRedoBtn = document.getElementById('mobile-redo');
    const mobileSaveBtn = document.getElementById('mobile-save');
    const mobileCameraBtn = document.getElementById('mobile-camera');
    const mobileModeToggle = document.getElementById('mobile-mode-toggle');
    const mobileColorPickerBtn = document.getElementById('mobile-color-picker-btn');
    const mobileColorInputHidden = document.getElementById('mobile-color-input-hidden');
    const mobileLoginLogout = document.getElementById('mobile-login-logout');

    // --- Helper for updating UI elements from VS_APP state ---
    function updateMobileControlsUI() {
        const mobileModeIcon = document.getElementById('mobile-mode-icon');
        if (mobileModeIcon) {
            mobileModeIcon.className = Modes[Object.keys(Modes).find(key => Modes[key] === VS_APP.currentMode)];
        }
        mobileColorInputHidden.value = VS_APP.currentColor;
    }

    // --- Core Touch/Pointer Logic (Mobile Specific) ---
    function handleGesture() {
        const pointers = [...activePointers.values()];
        if (pointers.length === 0) return;

        if (pointers.length === 1) {
            const p = pointers[0];
            const rotateSpeed = ROTATE_SPEED_TOUCH_MOBILE;
            
            let deltaX = (p.x - gestureState.lastMid.x) * rotateSpeed;
            let deltaY = (p.y - gestureState.lastMid.y) * rotateSpeed;

            if (VS_APP.invertLookX) deltaX *= -1;
            if (VS_APP.invertLookY) deltaY *= -1;

            VS_APP.euler.y += deltaX;
            VS_APP.euler.x -= deltaY;
            
            VS_APP.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, VS_APP.euler.x));
            cam.quaternion.setFromEuler(VS_APP.euler);
            gestureState.lastMid = { x: p.x, y: p.y };

            if (tutorial.active && tutorial.stepIndex === tutorial.getStepIndex('freelook') && (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001)) {
                tutorial.cameraMoved = true;
                tutorial.checkCondition();
            }
            return;
        }

        if (pointers.length >= 2) {
            const [p0, p1] = pointers;
            const midX = (p0.x + p1.x) * 0.5;
            const midY = (p0.y + p1.y) * 0.5;
            const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);

            if (gestureState.type === 'none') {
                const dMid = Math.hypot(midX - gestureState.startMid.x, midY - gestureState.startMid.y);
                const relDelta = Math.abs(dist / gestureState.startDist - 1);

                if (relDelta > PINCH_REL_TH) {
                    gestureState.type = 'pinch';
                } else if (dMid > MOVE_PX) {
                    gestureState.type = 'pan';
                }
                return;
            } else if (gestureState.type === 'pinch') {
                const zoomDelta = (dist / gestureState.lastDist - 1) * PINCH_ZOOM_MULT_MOBILE * VS_APP.moveSpeed;
                cam.position.addScaledVector(cam.getWorldDirection(new THREE.Vector3()), zoomDelta);
                gestureState.lastDist = dist;
            } else if (gestureState.type === 'pan') {
                let dx = (midX - gestureState.lastMid.x) * PAN_SPEED_TOUCH_MOBILE;
                let dy = (midY - gestureState.lastMid.y) * PAN_SPEED_TOUCH_MOBILE;
                
                if (VS_APP.reverseStrafeX) dx *= -1;
                if (VS_APP.reverseStrafeY) dy *= -1;

                const right = new THREE.Vector3().crossVectors(cam.getWorldDirection(new THREE.Vector3()), cam.up).normalize();
                cam.position.addScaledVector(right, dx);
                cam.position.addScaledVector(new THREE.Vector3(0, 1, 0), dy);
                
                gestureState.lastMid = { x: midX, y: midY };
            }
        }
    }

    function releasePointer(id, eventType) {
        activePointers.delete(id);
        if (activePointers.size < 2) {
            gestureState.type = 'none';
            if (activePointers.size === 1) { const last = [...activePointers.values()][0]; gestureState.lastMid = { x: last.x, y: last.y }; }
        }
        if (activePointers.size === 0) {
            doubleTapDragActive = false; lastActionVoxelCoords = null;
            dragAxisLock = null; initialDragVoxelCoords = null;
            VS_APP.previewLineInstancedMesh.count = 0; VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true; VS_APP.previewLineVoxels = [];
        }
    }

    function onTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();

        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });
        
        if (activePointers.size === 1) {
            const currentTime = performance.now();
            const dist = Math.hypot(e.clientX - (gestureState.lastTapCoords ? gestureState.lastTapCoords.x : 0), e.clientY - (gestureState.lastTapCoords ? gestureState.lastTapCoords.y : 0));

            if (currentTime - (gestureState.lastTapTime || 0) < DOUBLE_TAP_TIME_THRESHOLD && dist < DOUBLE_TAP_DIST_THRESHOLD) { 
                doubleTapDragActive = true;
                pointerIsDown = true;
                
                voxelsAtDragStart = new Map(VS_APP.voxels);
                currentStrokeVoxels.clear();
                currentStrokeVoxelKeys.clear();
                dragAxisLock = null;
                isDragging = false;
                initialDragVoxelCoords = null;
                initialClickPos = { x: e.clientX, y: e.clientY };

                let rawInitialRayTarget = calculateRayTargetVoxelCoords(e.clientX, e.clientY);

                if (rawInitialRayTarget && Number.isFinite(rawInitialRayTarget.x) && Number.isFinite(rawInitialRayTarget.y) && Number.isFinite(rawInitialRayTarget.z)) {
                    initialTargetVoxelCoords = {
                        x: rawInitialRayTarget.x, y: rawInitialRayTarget.y, z: rawInitialRayTarget.z,
                        faceNormal: rawInitialRayTarget.faceNormal, hitExistingVoxel: rawInitialRayTarget.hitExistingVoxel
                    };
                    
                    if (VS_APP.currentMode === Modes.ADD) {
                        dragFixedLayerCoord = Number(initialTargetVoxelCoords[VS_APP.currentDrawingAxis]); 
                        if (!Number.isFinite(dragFixedLayerCoord)) { 
                            dragFixedLayerCoord = Number(VS_APP.activeDrawingLevel[VS_APP.currentDrawingAxis]);
                        }
                    } else { dragFixedLayerCoord = null; }

                    if (dragFixedLayerCoord !== null && Number.isFinite(dragFixedLayerCoord)) {
                        initialTargetVoxelCoords[VS_APP.currentDrawingAxis] = dragFixedLayerCoord;
                    }
                    
                    initialTargetVoxelCoords.x = Math.max(0, Math.min(GRID - 1, initialTargetVoxelCoords.x));
                    initialTargetVoxelCoords.y = Math.max(0, Math.min(GRID - 1, initialTargetVoxelCoords.y));
                    initialTargetVoxelCoords.z = Math.max(0, Math.min(GRID - 1, initialTargetVoxelCoords.z));

                    let shouldPerformModification = true;
                    if (VS_APP.currentMode === Modes.DRAW && !initialTargetVoxelCoords.hitExistingVoxel) { shouldPerformModification = false; }

                    if (shouldPerformModification) {
                        lastActionVoxelCoords = { ...initialTargetVoxelCoords };
                        const gKey = VS_APP.key(initialTargetVoxelCoords.x, initialTargetVoxelCoords.y, initialTargetVoxelCoords.z);
                        const initialColor = voxelsAtDragStart.has(gKey) ? voxelsAtDragStart.get(gKey).color : null;
                        performVoxelModification(initialTargetVoxelCoords.x, initialTargetVoxelCoords.y, initialTargetVoxelCoords.z, VS_APP.currentMode, VS_APP.currentColor);
                        const finalColor = VS_APP.voxels.has(gKey) ? VS_APP.voxels.get(gKey).color : null;
                        currentStrokeVoxels.set(gKey, { originalColor: initialColor, finalColor: finalColor });
                        currentStrokeVoxelKeys.add(gKey);
                        updatePreviewVoxel(initialTargetVoxelCoords.x, initialTargetVoxelCoords.y, initialTargetVoxelCoords.z, true);
                    } else {
                        updatePreviewVoxel(0,0,0,false);
                    }
                } else { updatePreviewVoxel(0,0,0,false); }
                gestureState.lastTapTime = 0; gestureState.lastTapCoords = { x: 0, y: 0 };
            } else {
                doubleTapDragActive = false;
                pointerIsDown = false;
                gestureState.lastTapTime = currentTime;
                gestureState.lastTapCoords = { x: e.clientX, y: e.clientY };
                gestureState.type = 'none'; gestureState.startMid = gestureState.lastMid = { x: e.clientX, y: e.clientY };
                gestureState.startDist = gestureState.lastDist = 0;
                gestureState.initialPointerCount = 1;
                updatePreviewVoxel(0,0,0,false);
                VS_APP.previewLineInstancedMesh.count = 0; VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true; VS_APP.previewLineVoxels = [];
            }
        } else if (activePointers.size >= 2) {
            doubleTapDragActive = false;
            pointerIsDown = false;
            initialTargetVoxelCoords = null;
            currentStrokeVoxels.clear(); currentStrokeVoxelKeys.clear();
            VS_APP.previewLineInstancedMesh.count = 0; VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true; VS_APP.previewLineVoxels = [];
            updatePreviewVoxel(0, 0, 0, false);
            isDragging = false; dragFixedLayerCoord = null;
            
            const pointersArr = [...activePointers.values()];
            const [p0, p1] = pointersArr;
            const midX = (p0.x + p1.x) * 0.5; const midY = (p0.y + p1.y) * 0.5; const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            gestureState.type = 'none'; gestureState.startMid = gestureState.lastMid = { x: midX, y: midY };
            gestureState.startDist = gestureState.lastDist = dist;
            gestureState.initialPointerCount = activePointers.size;
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        e.stopPropagation();

        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });
        
        if (doubleTapDragActive) {
            let currentRayHit = calculateRayTargetVoxelCoords(e.clientX, e.clientY);
            let currentTargetVoxelCoords = null;

            if (currentRayHit) {
                currentTargetVoxelCoords = { x: currentRayHit.x, y: currentRayHit.y, z: currentRayHit.z };
                if (dragFixedLayerCoord !== null && Number.isFinite(dragFixedLayerCoord)) {
                    currentTargetVoxelCoords[VS_APP.currentDrawingAxis] = dragFixedLayerCoord;
                }
                currentTargetVoxelCoords.x = Math.max(0, Math.min(GRID - 1, currentTargetVoxelCoords.x));
                currentTargetVoxelCoords.y = Math.max(0, Math.min(GRID - 1, currentTargetVoxelCoords.y));
                currentTargetVoxelCoords.z = Math.max(0, Math.min(GRID - 1, currentTargetVoxelCoords.z));
            } else {
                currentTargetVoxelCoords = null;
            }

            const currentMovedDist = initialClickPos ? Math.hypot(e.clientX - initialClickPos.x, e.clientY - initialClickPos.y) : 0;
            const shouldStartDrag = currentMovedDist > MOVE_PX;

            if (!isDragging && shouldStartDrag) { isDragging = true; }

            if (isDragging) {
                if (currentTargetVoxelCoords) {
                    const startPointForLine = { ...lastActionVoxelCoords };
                    const endPointForLine = { ...currentTargetVoxelCoords };

                    let pathVoxels;
                    if (dragFixedLayerCoord !== null && Number.isFinite(dragFixedLayerCoord)) {
                        pathVoxels = getVoxelsOnLine(startPointForLine, endPointForLine, VS_APP.currentDrawingAxis, dragFixedLayerCoord);
                    } else { pathVoxels = getVoxelsOnLine(startPointForLine, endPointForLine); }

                    if (VS_APP.currentMode === Modes.DELETE || VS_APP.currentMode === Modes.DRAW) {
                        pathVoxels = pathVoxels.filter(voxel => voxelsAtDragStart.has(VS_APP.key(voxel.x, voxel.y, voxel.z)));
                    }
                    
                    for (const voxel of pathVoxels) {
                        const gKey = VS_APP.key(voxel.x, voxel.y, voxel.z);
                        const hasVoxelBeforeModification = VS_APP.voxels.has(gKey);
                        const originalColor = hasVoxelBeforeModification ? VS_APP.voxels.get(gKey).color : null;
                        
                        performVoxelModification(voxel.x, voxel.y, voxel.z, VS_APP.currentMode, VS_APP.currentColor);
                        
                        const hasVoxelAfterModification = VS_APP.voxels.has(gKey);
                        const finalColor = hasVoxelAfterModification ? VS_APP.voxels.get(gKey).color : null;

                        if (!currentStrokeVoxels.has(gKey)) {
                            if (originalColor !== finalColor || (originalColor === null && finalColor !== null)) {
                                currentStrokeVoxels.set(gKey, { originalColor: originalColor, finalColor: finalColor });
                            }
                        } else { currentStrokeVoxels.get(gKey).finalColor = finalColor; }
                        currentStrokeVoxelKeys.add(gKey);
                    }
                    if (pathVoxels.length > 0) {
                        lastActionVoxelCoords = { x: pathVoxels[pathVoxels.length - 1].x, y: pathVoxels[pathVoxels.length - 1].y, z: pathVoxels[pathVoxels.length - 1].z };
                    } else { lastActionVoxelCoords = { ...endPointForLine }; }
                    const potentialPreview = VS_APP.currentMode === Modes.ADD ? !VS_APP.voxels.has(VS_APP.key(currentTargetVoxelCoords.x, currentTargetVoxelCoords.y, currentTargetVoxelCoords.z)) : VS_APP.voxels.has(VS_APP.key(currentTargetVoxelCoords.x, currentTargetVoxelCoords.y, currentTargetVoxelCoords.z));
                    updatePreviewVoxel(currentTargetVoxelCoords.x, currentTargetVoxelCoords.y, currentTargetVoxelCoords.z, potentialPreview);
                    VS_APP.previewLineInstancedMesh.count = 0;
                } else {
                    updatePreviewVoxel(0,0,0,false);
                    VS_APP.previewLineInstancedMesh.count = 0; VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true; VS_APP.previewLineVoxels = [];
                }
            } else {
                if (currentTargetVoxelCoords) {
                    let showPreview = false;
                    const gKeyAtPreview = VS_APP.key(currentTargetVoxelCoords.x, currentTargetVoxelCoords.y, currentTargetVoxelCoords.z);
                    const hasVoxelAtPreview = VS_APP.voxels.has(gKeyAtPreview);

                    if (VS_APP.currentMode === Modes.ADD) {
                        if (!hasVoxelAtPreview) { showPreview = true; }
                    } else if (VS_APP.currentMode === Modes.DELETE || VS_APP.currentMode === Modes.DRAW) {
                        if (hasVoxelAtPreview) { showPreview = true; }
                    }
                    updatePreviewVoxel(currentTargetVoxelCoords.x, currentTargetVoxelCoords.y, currentTargetVoxelCoords.z, showPreview);
                } else { updatePreviewVoxel(0,0,0,false); }
                VS_APP.previewLineInstancedMesh.count = 0; VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true; VS_APP.previewLineVoxels = [];
            }
            return;
        } else {
            if (activePointers.size === 1) {
                handleGesture();
                updatePreviewVoxel(0, 0, 0, false);
                VS_APP.previewLineInstancedMesh.count = 0; VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true; VS_APP.previewLineVoxels = [];
                return;
            } else if (activePointers.size >= 2) {
                handleGesture();
                updatePreviewVoxel(0, 0, 0, false);
                VS_APP.previewLineInstancedMesh.count = 0; VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true; VS_APP.previewLineVoxels = [];
                return;
            }
        }
    }

    function onTouchEnd(e) {
        e.preventDefault();
        e.stopPropagation();

        if (pointerIsDown && isDragging && currentStrokeVoxels.size > 0) {
            const oldState = [];
            const newState = [];
            for (const [gKey, change] of currentStrokeVoxels.entries()) {
                const p = parseKey(gKey);
                oldState.push({ x: p[0], y: p[1], z: p[2], color: change.originalColor });
                newState.push({ x: p[0], y: p[1], z: p[2], color: change.finalColor });
            }
            if (oldState.length > 0) { addCommand('batch', oldState, newState); }
        }

        pointerIsDown = false;
        isDragging = false;
        doubleTapDragActive = false;
        lastActionVoxelCoords = null;
        initialClickPos = null;
        initialTargetVoxelCoords = null;
        voxelsAtDragStart = null;
        currentStrokeVoxels.clear();
        currentStrokeVoxelKeys.clear();
        updatePreviewVoxel(0, 0, 0, false);
        VS_APP.previewLineInstancedMesh.count = 0; VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true; VS_APP.previewLineVoxels = [];
        dragAxisLock = null;
        dragFixedLayerCoord = null;
        
        releasePointer(e.pointerId, e);
    }

    function onTouchCancel(e) {
        onTouchEnd(e); // Treat touch cancel as touch end
    }

    // --- Attach all event listeners ---
    cvs.addEventListener('pointerdown', onTouchStart); // Use pointerdown for touch to distinguish from mouse
    cvs.addEventListener('pointermove', onTouchMove);
    cvs.addEventListener('pointerup', onTouchEnd);
    cvs.addEventListener('pointerleave', onTouchCancel); // Handle pointerleave/cancel for touch

    // Mobile controls logic
    mobileMenuToggle.addEventListener('click', () => {
        controlsPanel.classList.toggle('hidden');
        controlsPanel.classList.toggle('flex');
    });
    // Close desktop controls when clicking outside in mobile view
    controlsPanel.addEventListener('click', (event) => {
        if (event.target === controlsPanel || event.target.textContent === '✕') {
            controlsPanel.classList.add('hidden');
            controlsPanel.classList.remove('flex');
        }
    });

    // Mobile control buttons
    mobileUndoBtn.addEventListener('click', undo);
    mobileRedoBtn.addEventListener('click', redo);
    mobileSaveBtn.addEventListener('click', saveJSON);
    mobileCameraBtn.addEventListener('click', resetCameraPosition);
    mobileModeToggle.addEventListener('click', cycleMode);
    mobileColorPickerBtn.addEventListener('click', () => mobileColorInputHidden.click());
    mobileColorInputHidden.addEventListener('input', (e) => {
        VS_APP.currentColor = e.target.value;
        document.getElementById('color-picker-input-hidden').value = VS_APP.currentColor; // Update desktop picker
        document.getElementById('color-picker-swatch').style.backgroundColor = VS_APP.currentColor; // Update desktop swatch
        localStorage.setItem('voxelEditorColor', VS_APP.currentColor);
        if (previewVoxelMesh.visible) {
            previewVoxelMaterial.color.set(VS_APP.currentColor);
        }
        if (tutorial.active && tutorial.stepIndex === tutorial.getStepIndex('changeColor')) {
             tutorial.checkCondition(mobileColorPickerBtn);
        }
    });
    mobileLoginLogout.addEventListener('click', loginLogout);

    // Initial UI update for mobile
    updateMobileControlsUI();
}
