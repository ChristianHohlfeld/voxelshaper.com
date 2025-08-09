// desktop-controls.js
export function initDesktopControls(VS_APP) {
    // Desktop specific global state for interactions
    let isPointerLocked = false;
    let firstMoveAfterLock = true;
    let mouseMovementX = 0;
    let mouseMovementY = 0;
    let keyboard = {}; // For desktop keyboard input tracking

    // Mouse and interaction state
    let pointerIsDown = false;
    let rightMouseButtonDown = false;
    let lastActionVoxelCoords = null;
    let initialClickPos = null;
    let initialTargetVoxelCoords = null;
    let voxelsAtDragStart = null;
    let currentStrokeVoxels = new Map();
    let currentStrokeVoxelKeys = new Set();
    let isDragging = false;
    let dragAxisLock = null;
    let dragFixedLayerCoord = null;

    // Expose these to VS_APP so animate() in index.html can use them
    VS_APP.isPointerLocked = isPointerLocked;
    VS_APP.firstMoveAfterLock = firstMoveAfterLock;
    VS_APP.mouseMovementX = mouseMovementX;
    VS_APP.mouseMovementY = mouseMovementY;
    VS_APP.keyboard = keyboard; // Desktop only keyboard tracking

    const {
        cvs, cam, showToast, currentColor, previewVoxelMesh, previewVoxelMaterial,
        updatePreviewVoxel, calculateRayTargetVoxelCoords, performVoxelModification,
        getVoxelsOnLine, addCommand, parseKey,
        GRID, Modes, tutorial,
        undo, redo, saveJSON, resetCameraPosition, cycleMode,
        setActivePreset, savePresetColor, updateMobileCameraControlButtons,
        loadImageTemplate, handleImageFileSelect, removeImageTemplate, loginLogout,
        openUploadModal, uploadProjectToHub, closeAllModals,
        signInWithGoogle, signInWithGithub, signInEmailPassword, signUpEmailPassword,
        exportSTL, projectTitle, projectDescription, projectCategory, projectTags, projectVisibility,
        predefinedCategories, currentUserId, auth, db, currentUser
    } = VS_APP;

    // --- Event Listeners for Desktop Controls ---
    const gridSizeSlider = document.getElementById('grid-size-slider');
    const gridSizeDisplay = document.getElementById('grid-size-display');
    const colorPickerSwatch = document.getElementById('color-picker-swatch');
    const colorPickerInputHidden = document.getElementById('color-picker-input-hidden');
    const modeToggle = document.getElementById('modeToggle');
    const currentModeSpan = document.getElementById('current-mode');
    const clearBtn = document.getElementById('clearBtn');
    const fillLevelBtn = document.getElementById('fillLevelBtn');
    const saveBtn = document.getElementById('saveBtn');
    const loadBtn = document.getElementById('loadBtn');
    const exportBtn = document.getElementById('exportBtn');
    const fileInput = document.getElementById('fileInput');
    const flySpeedSlider = document.getElementById('fly-speed-slider');
    const flySpeedDisplay = document.getElementById('fly-speed-display');
    const rotSpeedSlider = document.getElementById('rot-speed-slider');
    const rotSpeedDisplay = document.getElementById('rot-speed-display');
    const clearConfirmationModal = document.getElementById('clearConfirmationModal');
    const saveAndClearBtn = document.getElementById('saveAndClearBtn');
    const clearWithoutSaveBtn = document.getElementById('clearWithoutSaveBtn');
    const cancelClearBtn = document.getElementById('cancelClearBtn');
    const resetCameraBtn = document.getElementById('resetCameraBtn');
    const loadImageTemplateBtn = document.getElementById('loadImageTemplateBtn');
    const removeImageTemplateBtn = document.getElementById('removeImageTemplateBtn');
    const imageFileInput = document.getElementById('imageFileInput');
    const loginLogoutBtn = document.getElementById('loginLogoutBtn');
    const uploadToHubBtn = document.getElementById('uploadToHubBtn');
    const goToHubBtn = document.getElementById('goToHubBtn');
    const uploadProjectModal = document.getElementById('uploadProjectModal');
    const uploadConfirmBtn = document.getElementById('uploadConfirmBtn');
    const uploadCancelBtn = document.getElementById('uploadCancelBtn');
    const authModal = document.getElementById('authModal');
    const authModalCloseBtn = document.getElementById('authModalCloseBtn');
    const signInGoogleBtn = document.getElementById('signInGoogleBtn');
    const signInGithubBtn = document.getElementById('signInGithubBtn');
    const showEmailLoginFormBtn = document.getElementById('showEmailLoginFormBtn');
    const emailAuthForm = document.getElementById('emailAuthForm');
    const emailSignInBtn = document.getElementById('emailSignInBtn');
    const emailSignUpBtn = document.getElementById('emailSignUpBtn');
    const exportOptionsModal = document.getElementById('exportOptionsModal');
    const confirmExportBtn = document.getElementById('confirmExportBtn');
    const cancelExportOptionsBtn = document.getElementById('cancelExportOptionsBtn');
    const exportFormatRadios = document.querySelectorAll('input[name="exportFormat"]');

    const invertLookXBtn = document.getElementById('invert-look-x');
    const invertLookYBtn = document.getElementById('invert-look-y');
    const reverseStrafeXBtn = document.getElementById('reverse-strafe-x');
    const reverseStrafeYBtn = document.getElementById('reverse-strafe-y');
    const scaleUnitOptions = document.getElementById('scaleUnitOptions');
    const exportAxisOptions = document.getElementById('exportAxisOptions');


    // --- Helper for updating UI elements from VS_APP state ---
    function updateDesktopControlsUI() {
        gridSizeSlider.value = VS_APP.GRID;
        gridSizeDisplay.textContent = `${VS_APP.GRID}×${VS_APP.GRID}×${VS_APP.GRID}`;
        colorPickerInputHidden.value = VS_APP.currentColor;
        colorPickerSwatch.style.backgroundColor = VS_APP.currentColor;
        currentModeSpan.textContent = `Modus: ${VS_APP.currentMode}`;
        flySpeedSlider.value = VS_APP.moveSpeed;
        flySpeedDisplay.textContent = VS_APP.moveSpeed.toFixed(2);
        rotSpeedSlider.value = VS_APP.rotSpeed;
        rotSpeedDisplay.textContent = VS_APP.rotSpeed.toFixed(4);
        updateMobileCameraControlButtons(); // This function is now shared in VS_APP

        VS_APP.presetBoxes = [document.getElementById('color-preset-1'), document.getElementById('color-preset-2'), document.getElementById('color-preset-3')];
        VS_APP.presetBoxes.forEach((box, index) => {
            box.value = VS_APP.presetColors[index];
            box.addEventListener('click', () => setActivePreset(index));
            box.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const chosenColor = prompt('Neue Farbe für Preset (Hex oder Name):', box.value);
                if (chosenColor) {
                    try {
                        const tempColor = new THREE.Color(chosenColor);
                        savePresetColor(index, '#' + tempColor.getHexString());
                        box.value = '#' + tempColor.getHexString();
                        if (VS_APP.activePresetIndex === index) {
                            VS_APP.currentColor = '#' + tempColor.getHexString();
                            colorPickerInputHidden.value = VS_APP.currentColor;
                            colorPickerSwatch.style.backgroundColor = VS_APP.currentColor;
                            if (previewVoxelMesh.visible) {
                                previewVoxelMaterial.color.set(VS_APP.currentColor);
                            }
                        }
                    } catch (err) {
                        showToast('Fehler', 'Ungültiges Farbformat. Verwenden Sie Hex (#RRGGBB) oder einen CSS-Farbnamen.', 'error', 5000);
                    }
                }
            });
        });
        VS_APP.setActivePreset(VS_APP.activePresetIndex);
        if (VS_APP.templateImageMesh) {
            removeImageTemplateBtn.classList.remove('hidden');
        } else {
            removeImageTemplateBtn.classList.add('hidden');
        }
    }

    // --- Core Mouse/Pointer Logic (Desktop Specific) ---
    function onMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.button === 2) { // Right click for camera lock
            try {
                cvs.requestPointerLock();
            } catch (error) {
                showToast('Fehler', 'Zeigerfixierung fehlgeschlagen.', 'error', 3000);
            }
            rightMouseButtonDown = true;
            return;
        }
        
        cvs.focus();

        if (isPointerLocked) {
            return;
        }

        if (e.button === 0 && e.altKey) { // Alt + Left click for color pick
            const hitResult = calculateRayTargetVoxelCoords(e.clientX, e.clientY);
            if (hitResult && hitResult.hitExistingVoxel) {
                const gKey = VS_APP.key(hitResult.x, hitResult.y, hitResult.z);
                if (VS_APP.voxels.has(gKey)) {
                    const pickedColor = VS_APP.voxels.get(gKey).color;
                    VS_APP.currentColor = pickedColor;
                    colorPickerInputHidden.value = pickedColor;
                    colorPickerSwatch.style.backgroundColor = pickedColor;
                    localStorage.setItem('voxelEditorColor', pickedColor);
                    VS_APP.presetBoxes.forEach(box => box.classList.remove('active', 'border-primary', 'shadow-lg', 'shadow-primary/50')); VS_APP.activePresetIndex = -1;
                    showToast('Farbe aufgenommen', `Farbe: ${pickedColor}`, 'info', 2000);

                    if (tutorial.active && tutorial.stepIndex === tutorial.getStepIndex('pickColor')) {
                        tutorial.checkCondition(cvs);
                    }
                }
            }
            return;
        }

        // Left Click for voxel modification
        pointerIsDown = true;
        voxelsAtDragStart = new Map(VS_APP.voxels);
        currentStrokeVoxels.clear();
        currentStrokeVoxelKeys.clear();
        dragAxisLock = null;
        isDragging = false;
        initialDragVoxelCoords = null;
        initialClickPos = { x: e.clientX, y: e.clientY };

        let rawInitialRayTarget = calculateRayTargetVoxelCoords(e.clientX, e.clientY);

        if (!rawInitialRayTarget || !Number.isFinite(rawInitialRayTarget.x) || !Number.isFinite(rawInitialRayTarget.y) || !Number.isFinite(rawInitialRayTarget.z)) {
            initialTargetVoxelCoords = null;
            dragFixedLayerCoord = null;
            updatePreviewVoxel(0,0,0,false);
            pointerIsDown = false; // Important: reset if no valid target
            return;
        } else {
            initialTargetVoxelCoords = {
                x: rawInitialRayTarget.x,
                y: rawInitialRayTarget.y,
                z: rawInitialRayTarget.z,
                faceNormal: rawInitialRayTarget.faceNormal,
                hitExistingVoxel: rawInitialRayTarget.hitExistingVoxel
            };

            if (VS_APP.currentMode === Modes.ADD) {
                dragFixedLayerCoord = Number(initialTargetVoxelCoords[VS_APP.currentDrawingAxis]);
                if (!Number.isFinite(dragFixedLayerCoord)) {
                    dragFixedLayerCoord = Number(VS_APP.activeDrawingLevel[VS_APP.currentDrawingAxis]);
                }
            } else { // DELETE or DRAW mode: no layer lock
                dragFixedLayerCoord = null;
            }

            if (dragFixedLayerCoord !== null && Number.isFinite(dragFixedLayerCoord)) {
                initialTargetVoxelCoords[VS_APP.currentDrawingAxis] = dragFixedLayerCoord;
            }

            initialTargetVoxelCoords.x = Math.max(0, Math.min(GRID - 1, initialTargetVoxelCoords.x));
            initialTargetVoxelCoords.y = Math.max(0, Math.min(GRID - 1, initialTargetVoxelCoords.y));
            initialTargetVoxelCoords.z = Math.max(0, Math.min(GRID - 1, initialTargetVoxelCoords.z));
        }

        let shouldPerformModification = true;
        if (VS_APP.currentMode === Modes.DRAW && !initialTargetVoxelCoords.hitExistingVoxel) {
            shouldPerformModification = false;
        }

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
    }

    function onMouseMove(e) {
        e.preventDefault();
        e.stopPropagation();

        if (isPointerLocked) {
            VS_APP.mouseMovementX += e.movementX;
            VS_APP.mouseMovementY += e.movementY;
            return;
        }

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

        if (pointerIsDown) {
            const currentMovedDist = initialClickPos ? Math.hypot(e.clientX - initialClickPos.x, e.clientY - initialClickPos.y) : 0;
            const shouldStartDrag = currentMovedDist > VS_APP.VOXEL_DRAG_THRESHOLD; // Use defined threshold

            if (!isDragging && shouldStartDrag) {
                isDragging = true;
            }

            if (isDragging) {
                if (currentTargetVoxelCoords) {
                    const startPointForLine = { ...lastActionVoxelCoords };
                    const endPointForLine = { ...currentTargetVoxelCoords };

                    let pathVoxels;
                    if (dragFixedLayerCoord !== null && Number.isFinite(dragFixedLayerCoord)) {
                        pathVoxels = getVoxelsOnLine(startPointForLine, endPointForLine, VS_APP.currentDrawingAxis, dragFixedLayerCoord);
                    } else {
                        pathVoxels = getVoxelsOnLine(startPointForLine, endPointForLine);
                    }

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
                        } else {
                            currentStrokeVoxels.get(gKey).finalColor = finalColor;
                        }
                        currentStrokeVoxelKeys.add(gKey);
                    }
                    if (pathVoxels.length > 0) {
                        lastActionVoxelCoords = { x: pathVoxels[pathVoxels.length - 1].x, y: pathVoxels[pathVoxels.length - 1].y, z: pathVoxels[pathVoxels.length - 1].z };
                    } else {
                        lastActionVoxelCoords = { ...endPointForLine };
                    }
                    const potentialPreview = VS_APP.currentMode === Modes.ADD ? !VS_APP.voxels.has(VS_APP.key(currentTargetVoxelCoords.x, currentTargetVoxelCoords.y, currentTargetVoxelCoords.z)) : VS_APP.voxels.has(VS_APP.key(currentTargetVoxelCoords.x, currentTargetVoxelCoords.y, currentTargetVoxelCoords.z));
                    updatePreviewVoxel(currentTargetVoxelCoords.x, currentTargetVoxelCoords.y, currentTargetVoxelCoords.z, potentialPreview);
                    VS_APP.previewLineInstancedMesh.count = 0;
                } else {
                    updatePreviewVoxel(0,0,0,false);
                    VS_APP.previewLineInstancedMesh.count = 0;
                    VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true;
                    VS_APP.previewLineVoxels = [];
                }
            } else { // Not dragging, just showing preview
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
                } else {
                    updatePreviewVoxel(0,0,0,false);
                }
                VS_APP.previewLineInstancedMesh.count = 0;
                VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true;
                VS_APP.previewLineVoxels = [];
            }
        }
    }

    function onMouseUp(e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.button === 2) { // Right click release
            rightMouseButtonDown = false;
            document.exitPointerLock();
            return;
        }
        
        if (pointerIsDown && isDragging && currentStrokeVoxels.size > 0) {
            const oldState = [];
            const newState = [];
            for (const [gKey, change] of currentStrokeVoxels.entries()) {
                const p = parseKey(gKey);
                oldState.push({ x: p[0], y: p[1], z: p[2], color: change.originalColor });
                newState.push({ x: p[0], y: p[1], z: p[2], color: change.finalColor });
            }
            if (oldState.length > 0) {
                addCommand('batch', oldState, newState);
            }
        }

        pointerIsDown = false;
        isDragging = false;
        lastActionVoxelCoords = null;
        initialClickPos = null;
        initialTargetVoxelCoords = null;
        voxelsAtDragStart = null;
        currentStrokeVoxels.clear();
        currentStrokeVoxelKeys.clear();
        updatePreviewVoxel(0, 0, 0, false);
        VS_APP.previewLineInstancedMesh.count = 0;
        VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true;
        VS_APP.previewLineVoxels = [];
        dragAxisLock = null;
        dragFixedLayerCoord = null;
    }

    function onMouseLeave(e) {
        if (pointerIsDown && isDragging && currentStrokeVoxels.size > 0) {
            const oldState = [];
            const newState = [];
            for (const [gKey, change] of currentStrokeVoxels.entries()) {
                const p = parseKey(gKey);
                oldState.push({ x: p[0], y: p[1], z: p[2], color: change.originalColor });
                newState.push({ x: p[0], y: p[1], z: p[2], color: change.finalColor });
            }
            if (oldState.length > 0) {
                addCommand('batch', oldState, newState);
            }
        }
        updatePreviewVoxel(0, 0, 0, false);
        VS_APP.previewLineInstancedMesh.count = 0;
        VS_APP.previewLineInstancedMesh.instanceMatrix.needsUpdate = true;
        VS_APP.previewLineVoxels = [];
        pointerIsDown = false;
        isDragging = false;
        lastActionVoxelCoords = null;
        initialClickPos = null;
        initialTargetVoxelCoords = null;
        voxelsAtDragStart = null;
        currentStrokeVoxels.clear();
        currentStrokeVoxelKeys.clear();
        dragAxisLock = null;
        dragFixedLayerCoord = null;
    }

    function onPointerLockChange() {
        if (document.pointerLockElement === cvs) { 
            isPointerLocked = true;
            VS_APP.isPointerLocked = true; // Update global state
            firstMoveAfterLock = true;
            VS_APP.firstMoveAfterLock = true; // Update global state
            VS_APP.mouseMovementX = VS_APP.mouseMovementY = 0;
            updatePreviewVoxel(0,0,0,false);
            VS_APP.euler.setFromQuaternion(cam.quaternion, 'YXZ'); 
        } else { 
            isPointerLocked = false;
            VS_APP.isPointerLocked = false; // Update global state
        }
    }

    function onMouseWheel(e) {
        e.preventDefault();
        if (e.altKey) {
            cam.position.addScaledVector(cam.getWorldDirection(new THREE.Vector3()), e.deltaY * 0.005 * VS_APP.moveSpeed * 5);
        } else {
            VS_APP.moveSpeed = Math.max(0.01, Math.min(1.0, VS_APP.moveSpeed - Math.sign(e.deltaY) * 0.01));
            flySpeedSlider.value = VS_APP.moveSpeed;
            flySpeedDisplay.textContent = VS_APP.moveSpeed.toFixed(2);
            localStorage.setItem('voxelEditorFlySpeed', VS_APP.moveSpeed);
        }
    }

    function onKeyDown(e) {
        const activeModals = ['authModal', 'uploadProjectModal', 'clearConfirmationModal', 'exportOptionsModal'].some(id => document.getElementById(id).open);
        if (activeModals) { if (e.key === 'Escape') { closeAllModals(); e.preventDefault(); } return; }
        keyboard[e.key.toLowerCase()] = true;
        if (e.key === 'Shift') VS_APP.isShiftDragging = true;
        if (e.key === 'Control' || e.metaKey) VS_APP.isControlDragging = true;
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
        if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') e.preventDefault();
        if (e.key === 'Tab') { e.preventDefault(); cycleMode(); }
        if (e.key === ' ') { e.preventDefault(); cycleMode(); }

        switch (e.key) { case '1': setActivePreset(0); break; case '2': setActivePreset(1); break; case '3': setActivePreset(2); break; }

        if (tutorial.active && isPointerLocked) {
            if (e.key.toLowerCase() === 'w' && tutorial.stepIndex === tutorial.getStepIndex('moveForward')) tutorial.checkCondition(cvs);
            if (e.key.toLowerCase() === 's' && tutorial.stepIndex === tutorial.getStepIndex('moveBackward')) tutorial.checkCondition(cvs);
            if (e.key.toLowerCase() === 'a' && tutorial.stepIndex === tutorial.getStepIndex('moveLeft')) tutorial.checkCondition(cvs);
            if (e.key.toLowerCase() === 'd' && tutorial.stepIndex === tutorial.getStepIndex('moveRight')) tutorial.checkCondition(cvs);
            if (e.key.toLowerCase() === 'e' && tutorial.stepIndex === tutorial.getStepIndex('moveUp')) tutorial.checkCondition(cvs);
            if (e.key.toLowerCase() === 'q' && tutorial.stepIndex === tutorial.getStepIndex('moveDown')) tutorial.checkCondition(cvs);
        }
    }

    function onKeyUp(e) {
        keyboard[e.key.toLowerCase()] = false;
        if (e.key === 'Shift') VS_APP.isShiftDragging = false;
        if (e.key === 'Control' || e.metaKey) VS_APP.isControlDragging = false;
    }

    // --- Attach all event listeners ---
    cvs.addEventListener('contextmenu', (e) => e.preventDefault());
    cvs.addEventListener('mousedown', onMouseDown);
    cvs.addEventListener('mousemove', onMouseMove);
    cvs.addEventListener('mouseup', onMouseUp);
    cvs.addEventListener('mouseleave', onMouseLeave); // Changed from pointerleave to mouseleave for desktop

    document.addEventListener('pointerlockchange', onPointerLockChange);
    cvs.addEventListener('wheel', onMouseWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    gridSizeSlider.addEventListener('input', () => {
        const newGrid = parseInt(gridSizeSlider.value);
        if (newGrid !== VS_APP.GRID) {
            const oldState = [...VS_APP.voxels.entries()].map(([id, data]) => { const p = parseKey(id); return { x: p[0], y: p[1], z: p[2], color: data.color }; });
            const oldGridSize = VS_APP.GRID;
            VS_APP.GRID = newGrid;
            localStorage.setItem('voxelEditorGridSize', VS_APP.GRID);
            gridSizeDisplay.textContent = `${VS_APP.GRID}×${VS_APP.GRID}×${VS_APP.GRID}`;
            for (const chunk of VS_APP.chunks.values()) chunk.dispose();
            VS_APP.chunks.clear(); VS_APP.voxels.clear();
            VS_APP.applyVoxelState(oldState);
            addCommand('resizeGrid', oldState, [...VS_APP.voxels.entries()].map(([id, data]) => { const p = parseKey(id); return { x: p[0], y: p[1], z: p[2], color: data.color }; }), { oldGrid: oldGridSize, newGrid: newGrid });
            VS_APP.rebuildHelpers();
        }
    });

    colorPickerSwatch.addEventListener('click', () => colorPickerInputHidden.click());
    colorPickerInputHidden.addEventListener('input', (e) => {
        VS_APP.currentColor = e.target.value;
        colorPickerSwatch.style.backgroundColor = VS_APP.currentColor;
        localStorage.setItem('voxelEditorColor', VS_APP.currentColor);
        if (previewVoxelMesh.visible) {
            previewVoxelMaterial.color.set(VS_APP.currentColor);
        }
        if (tutorial.active && tutorial.stepIndex === tutorial.getStepIndex('changeColor')) {
             tutorial.checkCondition(colorPickerSwatch);
        }
    });

    modeToggle.addEventListener('click', cycleMode);

    clearBtn.addEventListener('click', () => clearConfirmationModal.showModal());
    saveAndClearBtn.addEventListener('click', () => { saveJSON(); VS_APP.clearAllInternal(); clearConfirmationModal.close(); });
    clearWithoutSaveBtn.addEventListener('click', () => { VS_APP.clearAllInternal(); clearConfirmationModal.close(); });
    cancelClearBtn.addEventListener('click', () => clearConfirmationModal.close());

    fillLevelBtn.addEventListener('click', VS_APP.fillActiveLevel);

    saveBtn.addEventListener('click', saveJSON);
    
    loadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', VS_APP.loadJSON);

    exportBtn.addEventListener('click', () => exportOptionsModal.showModal());
    cancelExportOptionsBtn.addEventListener('click', () => exportOptionsModal.close());
    confirmExportBtn.addEventListener('click', async () => {
        const format = document.querySelector('input[name="exportFormat"]:checked').value;
        const scaleUnit = document.querySelector('input[name="exportScaleUnit"]:checked').value;
        const upAxis = document.querySelector('input[name="exportUpAxis"]:checked').value;
        
        let success = false;
        if (format === 'stl') {
            success = await exportSTL(scaleUnit, upAxis);
        }
        if (success) { exportOptionsModal.close(); }
    });
    exportFormatRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'stl') {
                scaleUnitOptions.classList.remove('hidden');
                exportAxisOptions.classList.remove('hidden');
            } else {
                scaleUnitOptions.classList.add('hidden');
                exportAxisOptions.classList.add('hidden');
            }
        });
    });
    document.querySelector('input[name="exportFormat"]:checked').dispatchEvent(new Event('change'));

    flySpeedSlider.addEventListener('input', (e) => {
        VS_APP.moveSpeed = parseFloat(e.target.value);
        flySpeedDisplay.textContent = VS_APP.moveSpeed.toFixed(2);
        localStorage.setItem('voxelEditorFlySpeed', VS_APP.moveSpeed);
    });

    rotSpeedSlider.addEventListener('input', (e) => {
        VS_APP.rotSpeed = parseFloat(e.target.value);
        rotSpeedDisplay.textContent = VS_APP.rotSpeed.toFixed(4);
        localStorage.setItem('voxelEditorRotSpeed', VS_APP.rotSpeed);
    });

    invertLookXBtn.addEventListener('click', () => {
        VS_APP.invertLookX = !VS_APP.invertLookX; localStorage.setItem('voxelEditorInvertLookX', VS_APP.invertLookX); updateMobileCameraControlButtons();
        showToast('Blickachse X', VS_APP.invertLookX ? 'X-Achse invertiert' : 'X-Achse normal', 'info', 1000);
    });
    invertLookYBtn.addEventListener('click', () => {
        VS_APP.invertLookY = !VS_APP.invertLookY; localStorage.setItem('voxelEditorInvertLookY', VS_APP.invertLookY); updateMobileCameraControlButtons();
        showToast('Blickachse Y', VS_APP.invertLookY ? 'Y-Achse invertiert' : 'Y-Achse normal', 'info', 1000);
    });
    reverseStrafeXBtn.addEventListener('click', () => {
        VS_APP.reverseStrafeX = !VS_APP.reverseStrafeX; localStorage.setItem('voxelEditorReverseStrafeX', VS_APP.reverseStrafeX); updateMobileCameraControlButtons();
        showToast('Strafe X', VS_APP.reverseStrafeX ? 'X-Strafe invertiert' : 'X-Strafe normal', 'info', 1000);
    });
    reverseStrafeYBtn.addEventListener('click', () => {
        VS_APP.reverseStrafeY = !VS_APP.reverseStrafeY; localStorage.setItem('voxelEditorReverseStrafeY', VS_APP.reverseStrafeY); updateMobileCameraControlButtons();
        showToast('Strafe Y', VS_APP.reverseStrafeY ? 'Y-Strafe invertiert' : 'Y-Strafe normal', 'info', 1000);
    });

    resetCameraBtn.addEventListener('click', resetCameraPosition);
    
    loadImageTemplateBtn.addEventListener('click', loadImageTemplate);
    imageFileInput.addEventListener('change', handleImageFileSelect);
    removeImageTemplateBtn.addEventListener('click', removeImageTemplate);

    loginLogoutBtn.addEventListener('click', loginLogout);
    uploadToHubBtn.addEventListener('click', openUploadModal);
    uploadConfirmBtn.addEventListener('click', uploadProjectToHub);
    uploadCancelBtn.addEventListener('click', () => uploadProjectModal.close());
    goToHubBtn.addEventListener('click', () => window.open('[https://voxelshaper.com/hub](https://voxelshaper.com/hub)', '_blank'));

    authModalCloseBtn.addEventListener('click', closeAllModals); // Use common close modal function
    signInGoogleBtn.addEventListener('click', signInWithGoogle);
    signInGithubBtn.addEventListener('click', signInWithGithub);
    showEmailLoginFormBtn.addEventListener('click', () => document.getElementById('emailLoginForm').classList.toggle('hidden'));
    emailSignInBtn.addEventListener('click', (e) => { e.preventDefault(); signInEmailPassword(); });
    emailSignUpBtn.addEventListener('click', (e) => { e.preventDefault(); signUpEmailPassword(); });

    // Initial UI update
    updateDesktopControlsUI();
}
