function changeZoom(delta) { 
    let newSize = GRID_SIZE + delta; 
    if (newSize >= 4 && newSize <= 50) { 
        GRID_SIZE = newSize; 
        document.getElementById('zoomLabel').innerText = Math.round((GRID_SIZE / BASE_GRID_SIZE) * 100) + "%"; 
        resizeCanvas(); 
    } 
}

function forceRunTrigger(triggerName) {
    let config = globalTriggers[triggerName];
    if (!config || !config.target) {
        alert(`Silakan atur Screen target untuk trigger ${triggerName}() terlebih dahulu!`);
        return;
    }
    
    let targetKey = triggerName.replace('when', '');
    if(triggerName === 'whenJumat') targetKey = 'Dzuhur';
    if(triggerName === 'whenMagrib') targetKey = 'Maghrib'; 
    
    let tStr = window.currentPrayerTimes[targetKey] || window.currentPrayerTimes[targetKey.toLowerCase()];
    if(!tStr) { 
        const st = { 'Imsak': '04:15', 'Subuh': '04:25', 'Terbit': '05:40', 'Dzuhur': '11:50', 'Ashar': '15:00', 'Maghrib': '17:55', 'Isya': '19:05' };
        tStr = st[targetKey] || '00:00';
    }

    let mainIdx = screens.findIndex(s => s.type === 'main' && s.visibleLed);
    if(mainIdx === -1) mainIdx = 0; 
    if (isSimulating) stopSimulation();
    toggleSimulation(mainIdx, true); 
    startScreenSim(mainIdx);         

    let fakeNow = new Date();
    let parts = tStr.split(':');
    fakeNow.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
    // Simulasikan mundur 5 detik
    fakeNow.setSeconds(fakeNow.getSeconds() - 5);

    simulatedTimeMs = fakeNow.getTime();
    isClockSimulated = true;
    triggerCountdownTimer = 5000; 
    pendingTrigger = triggerName;
    playMode = 'countdown';          
    document.getElementById('simOverlay').style.display = 'block';
}

function renderTriggerBrowser() {
    const container = document.getElementById('triggerBrowserList');
    if (!container) return;
    container.innerHTML = '';
    
    const triggers = ['whenImsak', 'whenSubuh', 'whenTerbit', 'whenDzuhur', 'whenJumat', 'whenAshar', 'whenMagrib', 'whenIsya'];
    let optionsHtml = '<option value="">-- No Action --</option>';
    screens.forEach(s => { optionsHtml += `<option value="${s.id}">${s.id}</option>`; });

    triggers.forEach(t => {
        let div = document.createElement('div');
        div.style.background = '#1e1e1e';
        div.style.padding = '6px';
        div.style.borderRadius = '4px';
        div.style.border = '1px solid var(--border)';
        
        let header = document.createElement('div');
        header.style.display = 'flex'; header.style.justifyContent = 'space-between'; header.style.alignItems = 'center'; header.style.marginBottom = '4px';
        
        let label = document.createElement('div');
        label.innerText = `⚡ ${t}()`; label.style.fontSize = '11px'; label.style.color = '#3498db'; label.style.fontWeight = 'bold';
        
        let runBtn = document.createElement('button');
        runBtn.innerHTML = '▶️ Run'; runBtn.title = `Simulasikan 5 Detik Sebelum ${t}`;
        runBtn.style.cssText = 'background: #27ae60; color: #fff; border: none; border-radius: 3px; cursor: pointer; padding: 2px 6px; font-size: 9px; font-weight: bold; height: 20px; width: auto;';
        runBtn.onclick = () => forceRunTrigger(t);
        
        header.appendChild(label); header.appendChild(runBtn);
        let select = document.createElement('select'); select.innerHTML = optionsHtml; select.value = globalTriggers[t].target || '';
        select.onchange = (e) => { saveState(); globalTriggers[t].target = e.target.value; };
        div.appendChild(header); div.appendChild(select);
        
        container.appendChild(div);
    });
}

window.addEventListener('keydown', (e) => {
    if(isSimulating) return; const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    if (e.key === 'Delete' && !isInput) { if (selectedObjs.length > 0) deleteSelected(true); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !isInput) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y') && !isInput) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && !isInput) { e.preventDefault(); copyObjects(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V') && !isInput) { e.preventDefault(); pasteObjects(); }

    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && !isInput && selectedObjs.length > 0) {
        e.preventDefault(); saveState();
        selectedObjs.forEach(o => {
            if(e.key === 'ArrowUp') o.y -= 1;
            if(e.key === 'ArrowDown') o.y += 1;
            if(e.key === 'ArrowLeft') o.x -= 1;
            if(e.key === 'ArrowRight') o.x += 1;
        });
        syncGeometryUI();
    }
});

window.addEventListener('contextmenu', (e) => {
    if (e.target.id === 'editorCanvas' && !isSimulating) {
        e.preventDefault(); const canGroup = selectedObjs.length > 1 && selectedObjs.every(o => o.anim === 'none'); const canUngroup = selectedObjs.length === 1 && selectedObjs[0].type === 'group';
        const ctxMenu = document.getElementById('ctxMenu'); 
        ctxMenu.style.display = 'flex'; ctxMenu.style.left = e.clientX + 'px'; ctxMenu.style.top = e.clientY + 'px'; 
        document.getElementById('btnGroup').style.display = canGroup ? 'block' : 'none'; 
        document.getElementById('btnUngroup').style.display = canUngroup ? 'block' : 'none'; 
        document.getElementById('btnDelete').style.display = (selectedObjs.length > 0) ? 'block' : 'none';
    }
});
window.addEventListener('click', (e) => { if(!e.target.closest('#ctxMenu')) document.getElementById('ctxMenu').style.display = 'none'; });

canvas.ondblclick = (e) => {
    if(isSimulating) return;
    if(selectedObjs.length === 1 && selectedObjs[0].type === 'text') {
        let newText = prompt("Ubah teks:", selectedObjs[0].text);
        if(newText !== null) { saveState(); selectedObjs[0].text = newText.substring(0, 20); syncPropPanel(); renderTree(); }
    } else if(selectedObjs.length === 1 && selectedObjs[0].type === 'group') {
        let newName = prompt("Ubah nama Group:", selectedObjs[0].name.replace(/^Group_/, ''));
        if(newName !== null && newName.trim() !== '') {
            saveState();
            let finalName = "Group_" + newName.trim().substring(0, 10);
            if(isNameUnique(finalName)) selectedObjs[0].name = finalName;
            else selectedObjs[0].name = getUniqueName(finalName);
            syncPropPanel(); renderTree();
        }
    }
};

function handleDraw(mx, my) {
    if (!selectedObj || !selectedObj.visibleCanvas || (selectedObj.type !== 'drawing' && selectedObj.type !== 'image')) return;
    let gridX = Math.floor(mx/GRID_SIZE); let gridY = Math.floor(my/GRID_SIZE); let relX = gridX - selectedObj.x; let relY = gridY - selectedObj.y;
    if (relX >= 0 && relX < selectedObj.w && relY >= 0 && relY < selectedObj.h) {
        const color = document.getElementById('propColor') ? document.getElementById('propColor').value : "#ffffff";
        if (mode === 'pen') { selectedObj.customPixels = selectedObj.customPixels.filter(p => p.x !== relX || p.y !== relY); selectedObj.customPixels.push({x: relX, y: relY, c: color}); } else if (mode === 'eraser') { selectedObj.customPixels = selectedObj.customPixels.filter(p => p.x !== relX || p.y !== relY); } selectedObj.updateContent();
    }
}

function handleImageUpload(event) {
    const file = event.target.files[0]; if (!file || !selectedObj || selectedObj.type !== 'image') return; saveState(); const reader = new FileReader();
    reader.onload = function(e) { const img = new Image(); img.onload = function() {
            offCanvas.width = selectedObj.w; offCanvas.height = selectedObj.h; offCtx.clearRect(0, 0, selectedObj.w, selectedObj.h); offCtx.drawImage(img, 0, 0, selectedObj.w, selectedObj.h);
            const data = offCtx.getImageData(0, 0, selectedObj.w, selectedObj.h).data; selectedObj.customPixels = []; 
            for(let y=0; y<selectedObj.h; y++){ for(let x=0; x<selectedObj.w; x++){ let idx = (y * selectedObj.w + x) * 4; let alpha = data[idx+3];
                    if(alpha > 5) { let aRatio = alpha / 255; let r = Math.round(data[idx] * aRatio); let g = Math.round(data[idx+1] * aRatio); let b = Math.round(data[idx+2] * aRatio); let hexColor = "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase(); selectedObj.customPixels.push({ x: x, y: y, c: hexColor }); }
                } } selectedObj.updateContent();
        }; img.src = e.target.result;
    }; reader.readAsDataURL(file); event.target.value = '';
}

function resizeCanvas() { canvas.width = PROJECT_W * GRID_SIZE; canvas.height = PROJECT_H * GRID_SIZE; }
function setMode(m) { mode = m; document.querySelectorAll('.top-bar button:not(.zoom-btn):not(.btn-green-icon):not([title="Undo (Ctrl+Z)"]):not([title="Redo (Ctrl+Y)"]):not([title="Open / Paste JSON"]):not([title="Save / Generate JSON"])').forEach(b => { if(b.id==='selectBtn'||b.id==='penBtn'||b.id==='eraserBtn') b.classList.remove('active'); }); if(document.getElementById(m+'Btn')) document.getElementById(m+'Btn').classList.add('active'); canvas.style.cursor = m === 'select' ? 'default' : 'crosshair'; }
function setAlign(type, val) { if(selectedObj && !['drawing','image','sholat','group', 'line'].includes(selectedObj.type)) { if(type === 'h') selectedObj.alignH = val; else selectedObj.alignV = val; syncGeometryUI(); } }

function changeObjType() { if (!selectedObj) return; selectedObj.type = document.getElementById('propType').value; setupFormatDropdown(); updateFromProp(true); }

function setupFormatDropdown() {
    if (!selectedObj) return;
    const bF = document.getElementById('boxFormat'), bT = document.getElementById('boxText'), bFont = document.getElementById('boxFont'), bAlign = document.getElementById('boxAlign'), bImg = document.getElementById('boxImage');
    const bSholat = document.getElementById('boxSholat'), bAnim = document.getElementById('boxAnim'), bColors = document.getElementById('boxColors'), bCoords = document.getElementById('boxObjCoords'), bLine = document.getElementById('boxLine');
    const bTextExtra = document.getElementById('boxTextExtra');
    const bIqomah = document.getElementById('boxIqomah');

    bF.classList.add('hidden'); bT.classList.add('hidden'); bFont.classList.add('hidden'); bAlign.classList.add('hidden'); bImg.classList.add('hidden'); bSholat.classList.add('hidden');
    bLine.classList.add('hidden'); bColors.classList.remove('hidden'); bCoords.classList.remove('hidden'); if(bTextExtra) bTextExtra.classList.add('hidden');
    if(bIqomah) bIqomah.classList.add('hidden');

    if (selectedObj.type === 'line') { bAnim.classList.add('hidden'); selectedObj.anim = 'none'; selectedObj.anim2 = 'none'; } else { bAnim.classList.remove('hidden'); }
    
    const iqNotice = document.getElementById('iqomahAnimNotice');
    if (iqNotice) { 
        iqNotice.style.display = selectedObj.type === 'iqomah' ? 'block' : 'none'; 
        iqNotice.innerText = "⚠️ Animasi 1 dijalankan saat Sisa Waktu menyentuh batas Trigger & berjalan terus sampai waktu habis, lalu disusul Animasi 2.";
    }

    if (selectedObj.type === 'group') { bColors.classList.add('hidden'); bCoords.classList.add('hidden'); } else if (selectedObj.type === 'line') { bLine.classList.remove('hidden'); } else if (selectedObj.type === 'image') { bImg.classList.remove('hidden'); } else if (selectedObj.type === 'sholat') { bSholat.classList.remove('hidden'); bFont.classList.remove('hidden'); document.getElementById('propSholatType').value = selectedObj.sholatType; } else if (selectedObj.type === 'iqomah') { 
        bF.classList.remove('hidden'); bFont.classList.remove('hidden'); bAlign.classList.remove('hidden'); 
        if(bIqomah) bIqomah.classList.remove('hidden');
        let sF = document.getElementById('propFormat'); sF.innerHTML = ""; FORMATS[selectedObj.type].forEach(f => { let o = document.createElement('option'); o.value = f; o.innerText = f; sF.appendChild(o); }); 
        if (!selectedObj.format || !FORMATS[selectedObj.type].includes(selectedObj.format)) { selectedObj.format = sF.options[0].value; } sF.value = selectedObj.format;
        document.getElementById('propIqomahTime').value = selectedObj.iqomahTime;
        document.getElementById('propIqomahUnit').value = selectedObj.iqomahUnit || 'menit';
        document.getElementById('propIqomahOffset').value = selectedObj.iqomahOffset || 0;
        document.getElementById('propIqomahAnimTriggerSec').value = selectedObj.iqomahAnimTriggerSec;
        document.getElementById('propIqomahTriggerUnit').value = selectedObj.iqomahTriggerUnit || 'detik';
    } else if (selectedObj.type === 'text') { 
        bT.classList.remove('hidden'); bFont.classList.remove('hidden'); bAlign.classList.remove('hidden'); if(bTextExtra) bTextExtra.classList.remove('hidden');
    } else if (selectedObj.type !== 'drawing') { 
        bF.classList.remove('hidden'); bFont.classList.remove('hidden'); bAlign.classList.remove('hidden');
        let sF = document.getElementById('propFormat'); sF.innerHTML = ""; FORMATS[selectedObj.type].forEach(f => { let o = document.createElement('option'); o.value = f; o.innerText = f; sF.appendChild(o); }); 
        if (!selectedObj.format || !FORMATS[selectedObj.type].includes(selectedObj.format)) { selectedObj.format = sF.options[0].value; } sF.value = selectedObj.format;
    }
}

function syncGeometryUI() { if (!selectedObj) return; document.getElementById('propX').value = selectedObj.x; document.getElementById('propY').value = selectedObj.y; document.getElementById('propW').value = selectedObj.w; document.getElementById('propH').value = selectedObj.h; let align = selectedObj.calcAlign(); document.getElementById('propObjX').value = selectedObj.x + align.aX; document.getElementById('propObjY').value = selectedObj.y + align.aY; }

function updateScreenPropUI() { let mode = document.getElementById('propScreenDurMode').value; if (mode === 'fixed') { document.getElementById('boxDurFixed').classList.remove('hidden'); document.getElementById('boxDurAnim').classList.add('hidden'); } else { document.getElementById('boxDurFixed').classList.add('hidden'); document.getElementById('boxDurAnim').classList.remove('hidden'); } }

function updateNextTargets(context) {
    let actionVal = context === 'objDone' ? document.getElementById('propOnDoneActionObj').value : context === 'objShow' ? document.getElementById('propOnShowActionObj').value : document.getElementById('propNextActionScr').value;
    let targetSel = context === 'objDone' ? document.getElementById('propOnDoneTargetObj') : context === 'objShow' ? document.getElementById('propOnShowTargetObj') : document.getElementById('propNextTargetScr');

    if (!actionVal) { targetSel.classList.add('hidden'); targetSel.innerHTML = ''; return; }
    targetSel.classList.remove('hidden'); targetSel.innerHTML = '<option value="">-- Pilih Target --</option>';

    if (actionVal.includes('screen')) { screens.filter(s => s.visibleLed).forEach(s => { let opt = document.createElement('option'); opt.value = s.id; opt.innerText = s.id; targetSel.appendChild(opt); });
    } else if (actionVal.includes('group')) { let groups = screens[activeScreenIdx].objects.filter(o => o.type === 'group' && o.visibleLed); groups.forEach(g => { let opt = document.createElement('option'); opt.value = g.name; opt.innerText = g.name; targetSel.appendChild(opt); });
    } else if (actionVal.includes('object')) { let allObjs = []; screens.forEach(s => { function getValidObjNames(list) { let arr = []; list.forEach(o => { if (o.type !== 'group' && o.visibleLed) arr.push(o.name); if (o.type === 'group' && o.children) arr = arr.concat(getValidObjNames(o.children)); }); return arr; } allObjs = allObjs.concat(getValidObjNames(s.objects)); }); allObjs.forEach(n => { let opt = document.createElement('option'); opt.value = n; opt.innerText = n; targetSel.appendChild(opt); }); }
    if (targetSel.options.length > 1 && !targetSel.value) { targetSel.value = targetSel.options[1].value; }
}

function updateScreenProp() {
    let scr = screens[activeScreenIdx]; let nameInput = document.getElementById('propScreenName'); let nameVal = nameInput.value.trim().substring(0, 20) || `Screen_${activeScreenIdx+1}`; 
    let isUnique = !screens.some((s, idx) => idx !== activeScreenIdx && s.id === nameVal);
    if (!isUnique) { alert("Nama Screen harus unik! Nama tersebut sudah digunakan."); nameInput.value = scr.id; return; }
    scr.id = nameVal; nameInput.value = scr.id;
    scr.visibleCanvas = document.getElementById('propScrVisibleCanvas').checked; scr.visibleLed = document.getElementById('propScrVisibleLed').checked;
    scr.durationMode = document.getElementById('propScreenDurMode').value; scr.durationFixed = document.getElementById('propScreenDurFixed').value; scr.durationAnimObj = document.getElementById('propScreenDurAnim').value;
    scr.nextAction = document.getElementById('propNextActionScr').value; scr.nextTarget = document.getElementById('propNextTargetScr').value; renderTree(); renderTriggerBrowser();
}

function syncPropPanel() {
    const panelScreen = document.getElementById('screenPropContent'); const panelObject = document.getElementById('propContent'); const panelMsg = document.getElementById('noSelectionMsg');
    panelScreen.classList.add('hidden'); panelObject.classList.add('hidden'); panelMsg.style.display = 'none';

    if (selectedObjs.length > 1) { panelMsg.style.display = 'block'; } else if (selectedObjs.length === 1) {
        selectedObj = selectedObjs[0]; panelObject.classList.remove('hidden');
        document.getElementById('propName').value = selectedObj.name; document.getElementById('propVisibleCanvas').checked = selectedObj.visibleCanvas; document.getElementById('propVisibleLed').checked = selectedObj.visibleLed; 
        syncGeometryUI(); document.getElementById('propType').value = selectedObj.type; document.getElementById('propFont').value = selectedObj.font; document.getElementById('propText').value = selectedObj.text; 

        if (selectedObj.type === 'text') { document.getElementById('propEditable').checked = selectedObj.editable || false; document.getElementById('propTitle').value = selectedObj.title || selectedObj.name; if (selectedObj.editable) { document.getElementById('boxTitle').classList.remove('hidden'); } else { document.getElementById('boxTitle').classList.add('hidden'); } }
        
        document.getElementById('propColor').value = selectedObj.color; document.getElementById('propColorNone').checked = selectedObj.colorNone; document.getElementById('propFColor').value = selectedObj.fColor; document.getElementById('propFColorNone').checked = selectedObj.fColorNone; document.getElementById('propBgColor').value = selectedObj.bgColor; document.getElementById('propBgColorNone').checked = selectedObj.bgColorNone;
        document.getElementById('propRadius').value = selectedObj.radius; document.getElementById('radiusVal').innerText = selectedObj.radius;
        
        if (selectedObj.type === 'line') {
            document.getElementById('propLineDir').value = selectedObj.lineDir; document.getElementById('propLineThick').value = selectedObj.lineThick; document.getElementById('propLineLength').value = selectedObj.lineLength; document.getElementById('propLineColor').value = selectedObj.lineColor;
            ['propColor', 'propColorNone', 'propFColor', 'propFColorNone', 'propBgColor', 'propBgColorNone'].forEach(id => { document.getElementById(id).disabled = true; document.getElementById(id).parentElement.style.opacity = '0.4'; });
        } else { ['propColor', 'propColorNone', 'propFColor', 'propFColorNone', 'propBgColor', 'propBgColorNone'].forEach(id => { document.getElementById(id).disabled = false; document.getElementById(id).parentElement.style.opacity = '1'; }); }

        document.getElementById('propAnim').value = selectedObj.anim; document.getElementById('propSpeed').value = selectedObj.speed; document.getElementById('speedVal').innerText = selectedObj.speed.toFixed(1) + 'x'; document.getElementById('propAnimDelay').value = selectedObj.animDelay || 0;
        document.getElementById('propAnim2').value = selectedObj.anim2; document.getElementById('propSpeed2').value = selectedObj.speed2; document.getElementById('speedVal2').innerText = selectedObj.speed2.toFixed(1) + 'x'; document.getElementById('propAnimDelay2').value = selectedObj.animDelay2 || 0;
        
        document.getElementById('propOnShowActionObj').value = selectedObj.onShowAction || ""; updateNextTargets('objShow'); if (selectedObj.onShowAction) document.getElementById('propOnShowTargetObj').value = selectedObj.onShowTarget || "";
        document.getElementById('propOnDoneActionObj').value = selectedObj.onDoneAction || ""; updateNextTargets('objDone'); if (selectedObj.onDoneAction) document.getElementById('propOnDoneTargetObj').value = selectedObj.onDoneTarget || "";
        setupFormatDropdown(); if(!['text', 'drawing', 'image', 'sholat', 'iqomah', 'group', 'line'].includes(selectedObj.type)) document.getElementById('propFormat').value = selectedObj.format; 
    } else {
        selectedObj = null; panelScreen.classList.remove('hidden'); let scr = screens[activeScreenIdx];
        let propScrName = document.getElementById('propScreenName'); propScrName.value = scr.id;
        if(scr.type === 'generic') { propScrName.readOnly = false; propScrName.style.cursor = "text"; } else { propScrName.readOnly = true; propScrName.style.cursor = "not-allowed"; }

        document.getElementById('propScrVisibleCanvas').checked = scr.visibleCanvas !== false; document.getElementById('propScrVisibleLed').checked = scr.visibleLed !== false;
        document.getElementById('propScreenDurMode').value = scr.durationMode || 'fixed'; document.getElementById('propScreenDurFixed').value = scr.durationFixed || '00:00:10';
        
        document.getElementById('splashScreenTag').style.display = scr.type === 'splash' ? 'block' : 'none'; document.getElementById('mainScreenTag').style.display = scr.type === 'main' ? 'block' : 'none'; 

        let animSelect = document.getElementById('propScreenDurAnim'); animSelect.innerHTML = '<option value="">-- Pilih Objek --</option>'; let allObjNames = [];
        function getValidObjNames(list) { let arr = []; list.forEach(o => { if (o.type !== 'group') arr.push(o.name); if (o.type === 'group' && o.children) arr = arr.concat(getValidObjNames(o.children)); }); return arr; }
        allObjNames = getValidObjNames(scr.objects); allObjNames.forEach(n => { let opt = document.createElement('option'); opt.value = n; opt.innerText = n; if(scr.durationAnimObj === n) opt.selected = true; animSelect.appendChild(opt); }); updateScreenPropUI();
        
        document.getElementById('propNextActionScr').value = scr.nextAction || ""; updateNextTargets('scr'); if (scr.nextAction) document.getElementById('propNextTargetScr').value = scr.nextTarget || "";
    }
}

function updateName() {
    if(!selectedObj) return; 
    let newName = document.getElementById('propName').value.trim(); 
    newName = newName.substring(0, 10);
    if(newName === selectedObj.name || newName === "") return;
    if(isNameUnique(newName)) { selectedObj.name = newName; } else { selectedObj.name = getUniqueName(newName); } 
    document.getElementById('propName').value = selectedObj.name; renderTree();
}

function updateFromProp(autoSize = false) {
    if (selectedObj) {
        if(selectedObj.type !== 'group') selectedObj.type = document.getElementById('propType').value; 
        selectedObj.visibleCanvas = document.getElementById('propVisibleCanvas').checked; selectedObj.visibleLed = document.getElementById('propVisibleLed').checked; 
        selectedObj.font = document.getElementById('propFont').value; lastUsedFont = selectedObj.font; 
        let rawText = document.getElementById('propText').value; selectedObj.text = rawText.substring(0, 20); if (rawText.length > 20) document.getElementById('propText').value = selectedObj.text;
        
        if (selectedObj.type === 'text') {
            selectedObj.editable = document.getElementById('propEditable').checked; let rawTitle = document.getElementById('propTitle').value; selectedObj.title = rawTitle.substring(0, 20);
            if (selectedObj.editable) { document.getElementById('boxTitle').classList.remove('hidden'); } else { document.getElementById('boxTitle').classList.add('hidden'); }
        }

        selectedObj.color = document.getElementById('propColor').value; selectedObj.colorNone = document.getElementById('propColorNone').checked; selectedObj.fColor = document.getElementById('propFColor').value; selectedObj.fColorNone = document.getElementById('propFColorNone').checked; selectedObj.bgColor = document.getElementById('propBgColor').value; selectedObj.bgColorNone = document.getElementById('propBgColorNone').checked;
        
        if (selectedObj.type === 'line') {
            selectedObj.lineDir = document.getElementById('propLineDir').value; selectedObj.lineThick = parseInt(document.getElementById('propLineThick').value) || 1; selectedObj.lineLength = parseInt(document.getElementById('propLineLength').value) || 10; selectedObj.lineColor = document.getElementById('propLineColor').value;
            if (selectedObj.lineDir === 'h') { selectedObj.w = Math.min(PROJECT_W, selectedObj.lineLength); selectedObj.h = Math.min(PROJECT_H, selectedObj.lineThick); } else { selectedObj.w = Math.min(PROJECT_W, selectedObj.lineThick); selectedObj.h = Math.min(PROJECT_H, selectedObj.lineLength); }
        }

        selectedObj.radius = parseInt(document.getElementById('propRadius').value); document.getElementById('radiusVal').innerText = selectedObj.radius;
        
        selectedObj.anim = document.getElementById('propAnim').value; selectedObj.speed = parseFloat(document.getElementById('propSpeed').value); selectedObj.animDelay = parseFloat(document.getElementById('propAnimDelay').value) || 0;
        selectedObj.anim2 = document.getElementById('propAnim2').value; selectedObj.speed2 = parseFloat(document.getElementById('propSpeed2').value); selectedObj.animDelay2 = parseFloat(document.getElementById('propAnimDelay2').value) || 0;

        selectedObj.onShowAction = document.getElementById('propOnShowActionObj').value; selectedObj.onShowTarget = document.getElementById('propOnShowTargetObj').value;
        selectedObj.onDoneAction = document.getElementById('propOnDoneActionObj').value; selectedObj.onDoneTarget = document.getElementById('propOnDoneTargetObj').value;
        
        if (selectedObj.type === 'sholat') selectedObj.sholatType = document.getElementById('propSholatType').value; 
        else if (selectedObj.type === 'iqomah') { 
            selectedObj.format = document.getElementById('propFormat').value;
            selectedObj.iqomahTime = parseFloat(document.getElementById('propIqomahTime').value) || 5; 
            selectedObj.iqomahUnit = document.getElementById('propIqomahUnit').value;
            selectedObj.iqomahOffset = parseFloat(document.getElementById('propIqomahOffset').value) || 0;
            selectedObj.iqomahAnimTriggerSec = parseFloat(document.getElementById('propIqomahAnimTriggerSec').value) || 3;
            selectedObj.iqomahTriggerUnit = document.getElementById('propIqomahTriggerUnit').value;
        } 
        else if (!['text', 'drawing', 'image', 'group', 'line'].includes(selectedObj.type)) selectedObj.format = document.getElementById('propFormat').value;
        
        document.getElementById('speedVal').innerText = selectedObj.speed.toFixed(1) + 'x'; document.getElementById('speedVal2').innerText = selectedObj.speed2.toFixed(1) + 'x'; selectedObj.updateContent(); 
        
        if (autoSize && !['drawing', 'image', 'group', 'line'].includes(selectedObj.type)) { selectedObj.w = Math.min(PROJECT_W, Math.max(2, selectedObj.textWidth)); selectedObj.h = Math.min(PROJECT_H, Math.max(2, selectedObj.textHeight)); }
        syncGeometryUI(); renderTree();
    }
}

canvas.onmousedown = (e) => {
    if(isSimulating) return; if (e.button === 2) return; const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top;
    if (mode === 'select') {
        const hs = 10; const hc = hs/2;
        if (selectedObjs.length === 1) {
            let s = selectedObjs[0]; if(!s.visibleCanvas) return;
            const renderX = s.x * GRID_SIZE, renderY = s.y * GRID_SIZE, w = s.w * GRID_SIZE, h = s.h * GRID_SIZE; let checkResize = '';
            if (mx > renderX+w/2-hc && mx < renderX+w/2+hc && my > renderY-hc && my < renderY+hc) checkResize = 'n'; else if (mx > renderX+w/2-hc && mx < renderX+w/2+hc && my > renderY+h-hc && my < renderY+h+hc) checkResize = 's'; else if (mx > renderX-hc && mx < renderX+hc && my > renderY+h/2-hc && my < renderY+h/2+hc) checkResize = 'w'; else if (mx > renderX+w-hc && mx < renderX+w+hc && my > renderY+h/2-hc && my < renderY+h/2+hc) checkResize = 'e';
            if (checkResize !== '') { isResizing = true; resizeDir = checkResize; saveState(); if (s.type === 'drawing' || s.type === 'image') { s._preResizePixels = JSON.parse(JSON.stringify(s.customPixels)); s._preResizeW = s.w; s._preResizeH = s.h; } return; }
        }
        let hitFound = false;
        for (let i = objects.length - 1; i >= 0; i--) {
            let o = objects[i]; if(!o.visibleCanvas) continue; const renderX = o.x * GRID_SIZE, renderY = o.y * GRID_SIZE, w = o.w * GRID_SIZE, h = o.h * GRID_SIZE;
            if (mx > renderX && mx < renderX+w && my > renderY && my < renderY+h) { 
                hitFound = true; if (e.shiftKey) { if (selectedObjs.includes(o)) selectedObjs = selectedObjs.filter(x => x !== o); else selectedObjs.push(o); } else { if (!selectedObjs.includes(o)) selectedObjs = [o]; isDragging = true; dragOffsets = selectedObjs.map(s => ({ obj: s, dx: Math.floor(mx/GRID_SIZE) - s.x, dy: Math.floor(my/GRID_SIZE) - s.y })); saveState(); }
                syncPropPanel(); renderTree(); return; 
            }
        }
        if (!hitFound) { selectedObjs = []; syncPropPanel(); renderTree(); }
    } else if (mode === 'pen' || mode === 'eraser') {
        saveState(); let hitDrawing = null; const gridMouseX = Math.floor(mx/GRID_SIZE); const gridMouseY = Math.floor(my/GRID_SIZE);
        if (selectedObj && selectedObj.visibleCanvas && (selectedObj.type === 'drawing' || selectedObj.type === 'image')) { if (gridMouseX >= selectedObj.x && gridMouseX < selectedObj.x+selectedObj.w && gridMouseY >= selectedObj.y && gridMouseY < selectedObj.y+selectedObj.h) { hitDrawing = selectedObj; } }
        if (!hitDrawing) { for (let i = objects.length - 1; i >= 0; i--) { let o = objects[i]; if(!o.visibleCanvas) continue; if (o.type === 'drawing' || o.type === 'image') { if (gridMouseX >= o.x && gridMouseX < o.x+o.w && gridMouseY >= o.y && gridMouseY < o.y+o.h) { hitDrawing = o; break; } } } }
        if (hitDrawing) { selectedObjs = [hitDrawing]; syncPropPanel(); } else if (mode === 'pen') { let o = new PixelObject(getUniqueName("Draw"), 'drawing', gridMouseX, gridMouseY); objects.push(o); selectedObjs = [o]; syncPropPanel(); }
        isDrawing = true; handleDraw(mx, my); renderTree();
    }
};

canvas.onmousemove = (e) => {
    if(isSimulating) return; const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top;
    if (mode === 'select' && !isDragging && !isResizing) {
        let currCursor = 'default'; const hs = 10; const hc = hs/2;
        if (selectedObjs.length === 1 && selectedObjs[0].visibleCanvas) {
            let s = selectedObjs[0]; const renderX = s.x * GRID_SIZE, renderY = s.y * GRID_SIZE, w = s.w * GRID_SIZE, h = s.h * GRID_SIZE;
            if (mx > renderX+w/2-hc && mx < renderX+w/2+hc && my > renderY-hc && my < renderY+hc) currCursor = 'n-resize'; else if (mx > renderX+w/2-hc && mx < renderX+w/2+hc && my > renderY+h-hc && my < renderY+h+hc) currCursor = 's-resize'; else if (mx > renderX-hc && mx < renderX+hc && my > renderY+h/2-hc && my < renderY+h/2+hc) currCursor = 'w-resize'; else if (mx > renderX+w-hc && mx < renderX+w+hc && my > renderY+h/2-hc && my < renderY+h/2+hc) currCursor = 'e-resize'; else if (mx > renderX && mx < renderX+w && my > renderY && my < renderY+h) currCursor = 'move';
        } else if(selectedObjs.length > 1) { let isHovering = selectedObjs.some(s => s.visibleCanvas && mx > s.x*GRID_SIZE && mx < (s.x+s.w)*GRID_SIZE && my > s.y*GRID_SIZE && my < (s.y+s.h)*GRID_SIZE); if(isHovering) currCursor = 'move'; } canvas.style.cursor = currCursor;
    }
    let hovering = null; for(let o of objects) { if(!o.visibleCanvas) continue; const renderX = o.x * GRID_SIZE, renderY = o.y * GRID_SIZE; if(mx > renderX && mx < renderX+(o.w*GRID_SIZE) && my > renderY && my < renderY+(o.h*GRID_SIZE)) { hovering = o; break; } }
    if(hovering && !isDragging && !isResizing) { tooltip.style.display = 'block'; tooltip.style.left = e.clientX + 'px'; tooltip.style.top = (e.clientY + 20) + 'px'; tooltip.innerHTML = `<span style="color:#fff">Name:</span> ${hovering.name}<br><span style="color:#fff">Type:</span> ${hovering.type.toUpperCase()}`; } else { tooltip.style.display = 'none'; }
    
    if (isDragging && dragOffsets.length > 0) { 
        dragOffsets.forEach(item => { item.obj.x = Math.floor(mx/GRID_SIZE) - item.dx; item.obj.y = Math.floor(my/GRID_SIZE) - item.dy; }); syncGeometryUI();
    } else if (isResizing && selectedObjs.length === 1) {
        let s = selectedObjs[0]; let gridX = Math.round(mx / GRID_SIZE); let gridY = Math.round(my / GRID_SIZE);
        if (resizeDir === 'e') { s.w = Math.min(PROJECT_W, Math.max(1, gridX - s.x)); } else if (resizeDir === 's') { s.h = Math.min(PROJECT_H, Math.max(1, gridY - s.y)); } 
        else if (resizeDir === 'w') { let oldX = s.x; let newW = s.w + (oldX - gridX); if (newW >= 1 && newW <= PROJECT_W) { s.x = gridX; s.w = newW; } } 
        else if (resizeDir === 'n') { let oldY = s.y; let newH = s.h + (oldY - gridY); if (newH >= 1 && newH <= PROJECT_H) { s.y = gridY; s.h = newH; } }
        
        if (s.type === 'line') {
            if (s.lineDir === 'h') { s.lineLength = s.w; s.lineThick = s.h; } else { s.lineThick = s.w; s.lineLength = s.h; }
            if(document.getElementById('propLineThick') && selectedObj === s) { document.getElementById('propLineLength').value = s.lineLength; document.getElementById('propLineThick').value = s.lineThick; }
        }
        
        if ((s.type === 'drawing' || s.type === 'image') && s._preResizePixels) {
            let scaleX = s.w / s._preResizeW; let scaleY = s.h / s._preResizeH; let oldMap = {}; for(let p of s._preResizePixels) { oldMap[p.x + ',' + p.y] = p.c; } let scaledPixels = [];
            for(let ny = 0; ny < s.h; ny++) { for(let nx = 0; nx < s.w; nx++) { let ox = Math.floor(nx / scaleX); let oy = Math.floor(ny / scaleY); let color = oldMap[ox + ',' + oy]; if (color) scaledPixels.push({x: nx, y: ny, c: color}); } }
            s.customPixels = scaledPixels; s.updateContent();
        } 
        syncGeometryUI();
    } else if (isDrawing) { handleDraw(mx, my); }
};

window.onmouseup = () => { isDrawing = isDragging = isResizing = false; dragOffsets = []; if (selectedObjs.length === 1) { delete selectedObjs[0]._preResizePixels; delete selectedObjs[0]._preResizeW; delete selectedObjs[0]._preResizeH; } };
canvas.onmouseleave = () => { tooltip.style.display = 'none'; isDrawing = isDragging = isResizing = false; dragOffsets = []; };

function renderTree() {
    const container = document.getElementById('treeBrowser'); container.innerHTML = '';
    screens.forEach((scr, sIdx) => {
        let sDiv = document.createElement('div'); 
        let sClass = scr.type === 'splash' ? ' screen-splash' : scr.type === 'main' ? ' screen-main' : '';
        let ledIconScr = !scr.visibleLed ? '<span style="color:#e74c3c; margin-right:4px;" title="Hidden on LED JSON">💡🚫</span>' : '';
        let opacityStyle = !scr.visibleCanvas ? 'opacity: 0.4; text-decoration: line-through;' : '';
        sDiv.className = 'tree-item screen-item' + sClass + (sIdx === activeScreenIdx ? ' active-screen' : '');
        let scrIcon = scr.type === 'splash' ? '🚀' : scr.type === 'main' ? '🏠' : '📺';
                       
        sDiv.innerHTML = `<span style="${opacityStyle}">${ledIconScr}${scrIcon} ${scr.id}</span>
                          <span style="font-size:12px; cursor:pointer; opacity:0.7; transition:0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" onclick="previewScreen(${sIdx}, event)" title="Preview Screen Ini">▶️</span>`;
        sDiv.onclick = () => { if(!isSimulating) switchScreen(sIdx); }; container.appendChild(sDiv);

        if (sIdx === activeScreenIdx) {
            const buildNodes = (list, parentIsGroup = false) => {
                list.forEach(o => {
                    let oDiv = document.createElement('div'); oDiv.className = 'tree-item obj-item ' + (selectedObjs.includes(o) ? ' selected ' : '') + (!o.visibleCanvas ? ' hidden-obj ' : '') + (parentIsGroup ? ' child-item' : '');
                    let icon = o.type === 'group' ? '📁' : o.type === 'sholat' ? '🕌' : o.type === 'iqomah' ? '⏱️' : o.type === 'image' ? '🖼️' : o.type === 'line' ? '➖' : o.type === 'drawing' ? '🎨' : '📄';
                    let ledIcon = !o.visibleLed ? '<span style="color:#e74c3c; margin-right:4px;" title="Hidden on LED JSON">💡🚫</span>' : '';
                    oDiv.innerHTML = `<span>${ledIcon}<span class="tree-icon">${icon}</span> ${o.name}</span><span style="font-size:10px; cursor:pointer;" onclick="event.stopPropagation(); toggleVisibility('${o.name}')">${o.visibleCanvas ? '👁️' : '🕶️'}</span>`;
                    oDiv.onclick = (e) => { if(isSimulating) return; e.stopPropagation(); if (e.shiftKey) { if(selectedObjs.includes(o)) selectedObjs = selectedObjs.filter(x=>x!==o); else selectedObjs.push(o); } else { selectedObjs = [o]; } setMode('select'); syncPropPanel(); renderTree(); }; container.appendChild(oDiv);
                    if (o.type === 'group' && o.children) { buildNodes(o.children, true); }
                });
            }; buildNodes(scr.objects);
        }
    });
}

function toggleVisibility(objName) {
    if(isSimulating) return;
    function findAndToggle(list) { for(let o of list) { if(o.name === objName) { o.visibleCanvas = !o.visibleCanvas; return true; } if(o.type === 'group' && o.children) { if(findAndToggle(o.children)) return true; } } return false; } 
    findAndToggle(objects); syncPropPanel(); renderTree();
}

function updateSidebarButtons() { }

function groupObjects() {
    document.getElementById('ctxMenu').style.display = 'none'; if (selectedObjs.length < 2) return; saveState();
    let minX = Math.min(...selectedObjs.map(o => o.x)); let minY = Math.min(...selectedObjs.map(o => o.y));
    let maxW = Math.max(...selectedObjs.map(o => o.x + o.w)) - minX; let maxH = Math.max(...selectedObjs.map(o => o.y + o.h)) - minY;
    let group = new PixelObject(getUniqueName("Group"), "group", minX, minY); group.w = Math.min(PROJECT_W, maxW); group.h = Math.min(PROJECT_H, maxH);
    group.children = selectedObjs.map(o => { o.x -= minX; o.y -= minY; return o; });
    objects = objects.filter(o => !selectedObjs.includes(o)); screens[activeScreenIdx].objects = objects; objects.push(group); selectedObjs = [group]; syncPropPanel(); renderTree();
}

function ungroupObjects() {
    document.getElementById('ctxMenu').style.display = 'none'; if (selectedObjs.length !== 1 || selectedObjs[0].type !== 'group') return; saveState();
    let group = selectedObjs[0]; group.children.forEach(c => { c.x += group.x; c.y += group.y; objects.push(c); });
    objects = objects.filter(o => o !== group); screens[activeScreenIdx].objects = objects; selectedObjs = [...group.children]; syncPropPanel(); renderTree();
}