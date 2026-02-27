window.currentPrayerTimes = { Imsak: '04:15', Subuh: '04:25', Terbit: '05:40', Dzuhur: '11:50', Ashar: '15:00', Maghrib: '17:55', Isya: '19:05' };

function fetchPrayerTimes() {
    const updateTimes = (data) => { if(data && data.data && data.data.timings) { let t = data.data.timings; window.currentPrayerTimes = { Imsak: t.Imsak, Subuh: t.Fajr, Terbit: t.Sunrise, Dzuhur: t.Dhuhr, Ashar: t.Asr, Maghrib: t.Maghrib, Isya: t.Isha }; } };
    if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((pos) => { fetch(`https://api.aladhan.com/v1/timings?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&method=20`).then(r=>r.json()).then(updateTimes).catch(e=>console.log("Error API Geolocation:", e)); }, (err) => { fetch(`https://api.aladhan.com/v1/timingsByCity?city=Tangerang&country=Indonesia&method=20`).then(r=>r.json()).then(updateTimes).catch(e=>console.log("Error API City:", e)); }); } else { fetch(`https://api.aladhan.com/v1/timingsByCity?city=Tangerang&country=Indonesia&method=20`).then(r=>r.json()).then(updateTimes).catch(e=>console.log("Error API Fallback:", e)); }
}

function toggleSimulation(forceStartIdx = null, skipStart = false) {
    if(isSimulating) { stopSimulation(); if(typeof forceStartIdx !== 'number' && !skipStart) return; } 
    isSimulating = true; selectedObjs = []; syncPropPanel(); let btn = document.getElementById('btnSimulate'); btn.innerHTML = "⏹️"; btn.className = "top-btn btn-red-icon"; btn.title = "Stop Simulation";
    playMode = (typeof forceStartIdx === 'number') ? 'screen' : 'all';
    function buildBackup(list) { return list.map(o => { o._simOriginalVis = o.visibleCanvas; return { name: o.name, vis: o.visibleCanvas, children: o.children ? buildBackup(o.children) : null }; }); }
    preSimState = JSON.stringify(screens.map(s => ({ id: s.id, objects: buildBackup(s.objects) })));
    screens.forEach(s => { function stopAllRec(list) { list.forEach(o => { o.isAnimPlaying = false; o.currentOffsetX = 0; o.currentOffsetY = 0; o.hasFiredOnShow = false; if(o.children) stopAllRec(o.children); }); } stopAllRec(s.objects); });
    if(!skipStart) { let startIdx = 0; if (typeof forceStartIdx === 'number') { startIdx = forceStartIdx; } else { startIdx = screens.findIndex(s => s.type === 'splash' && s.visibleLed); if(startIdx === -1) startIdx = screens.findIndex(s => s.type === 'main' && s.visibleLed); if(startIdx === -1) startIdx = 0; } startScreenSim(startIdx); }
}

function previewScreen(idx, event) { if (event) event.stopPropagation(); if (isSimulating) stopSimulation(); toggleSimulation(idx); }

function stopSimulation() {
    isSimulating = false; isClockSimulated = false; pendingTrigger = null;
    let btn = document.getElementById('btnSimulate'); btn.innerHTML = "▶️"; btn.className = "top-btn btn-green-icon"; btn.title = "Play All";
    document.getElementById('simOverlay').style.display = 'none'; setMode('select'); 
    if(preSimState) { let backup = JSON.parse(preSimState); backup.forEach(bScr => { let s = screens.find(x => x.id === bScr.id); if(s) { function restoreRec(backupList, realList) { backupList.forEach(bObj => { let o = realList.find(x => x.name === bObj.name); if (o) { o.visibleCanvas = bObj.vis; o.isAnimPlaying = false; o.resetAnimation(); if (o.children && bObj.children) restoreRec(bObj.children, o.children); } }); } restoreRec(bScr.objects, s.objects); } }); }
    let splashIdx = screens.findIndex(s => s.type === 'splash'); switchScreen(splashIdx !== -1 ? splashIdx : 0); 
}

function startScreenSim(idx) {
    switchScreen(idx); let scr = screens[idx];
    function startVisRec(list) { list.forEach(o => { if (o.visibleCanvas && o.visibleLed) { if (o.type === 'iqomah') { let totalSecs = o.iqomahUnit === 'menit' ? o.iqomahTime * 60 : o.iqomahTime; o.iqomahTimer = totalSecs - o.iqomahOffset; o._iqomahAnimTriggered = false; o._iqomahDone = false; o.isAnimPlaying = false; } else { o.isAnimPlaying = true; o.resetAnimation(); } } if (o.children) startVisRec(o.children); }); }
    startVisRec(scr.objects); if (scr.durationMode === 'fixed') { simTimer = parseDuration(scr.durationFixed || "00:00:10"); } else { simTimer = 999999; }
}

function findAndToggleVisibilityRecursive(list, name, isShow) {
    for(let o of list) { if(o.name === name) { if(o.visibleLed) { o.visibleCanvas = isShow; function setPlayStateRec(obj, state) { if (obj.type === 'iqomah' && state) { let totalSecs = obj.iqomahUnit === 'menit' ? obj.iqomahTime * 60 : obj.iqomahTime; obj.iqomahTimer = totalSecs - obj.iqomahOffset; obj._iqomahAnimTriggered = false; obj._iqomahDone = false; obj.isAnimPlaying = false; } else { obj.isAnimPlaying = state; if(state) obj.resetAnimation(); } if(obj.children) obj.children.forEach(c => setPlayStateRec(c, state)); } setPlayStateRec(o, isShow); } return true; } if(o.type === 'group' && o.children) { if(findAndToggleVisibilityRecursive(o.children, name, isShow)) return true; } } return false;
}

function triggerEvent(act, tgt) {
    if (!isSimulating || !act) return; 
    if(act === 'show_screen') { let idx = screens.findIndex(s => s.id === tgt && s.visibleLed); if(idx !== -1) { playMode = 'all'; startScreenSim(idx); } }
    else if(act === 'hide_screen') { stopSimulation(); }
    else if(act === 'show_object' || act === 'show_group') { findAndToggleVisibilityRecursive(screens[activeScreenIdx].objects, tgt, true); }
    else if(act === 'hide_object' || act === 'hide_group') { findAndToggleVisibilityRecursive(screens[activeScreenIdx].objects, tgt, false); }
}

function playObjectAnim() { if(selectedObj) { function playRec(o) { o.isAnimPlaying = true; o.resetAnimation(); if(o.children) o.children.forEach(c=>playRec(c)); } playRec(selectedObj); } }
function stopObjectAnim() { if(selectedObj) { function stopRec(o) { o.isAnimPlaying = false; o.currentOffsetX = 0; o.currentOffsetY = 0; o.hasFiredOnShow = false; if(o.children) o.children.forEach(c=>stopRec(c)); } stopRec(selectedObj); } }

function addScreen(type = 'generic') {
    if (type === 'splash' && screens.some(s => s.type === 'splash')) { alert("Maksimal hanya boleh ada 1 Splash Screen!"); return; }
    if (type === 'main' && screens.some(s => s.type === 'main')) { alert("Maksimal hanya boleh ada 1 Main Screen!"); return; }
    saveState(); let newId = type === 'splash' ? "Screen_Splash" : type === 'main' ? "Screen_Main" : "Screen_" + (screens.length + 1);
    let count = 1; let origId = newId; while (screens.some(s => s.id === newId)) { newId = `${origId}_${count}`; count++; } newId = newId.substring(0, 20); 
    let durFixed = type === 'splash' ? '00:00:03' : '00:00:10';
    screens.push({ id: newId, type: type, visibleCanvas: true, visibleLed: true, objects: [], durationMode: 'fixed', durationFixed: durFixed, durationAnimObj: '', nextAction: '', nextTarget: '' });
    switchScreen(screens.length - 1); renderTriggerBrowser();
}

function switchScreen(idx) { if(isSimulating && idx !== activeScreenIdx) { } else { saveState(); } activeScreenIdx = idx; objects = screens[idx].objects; selectedObjs = []; function resetRec(list) { list.forEach(o => { o.isAnimPlaying = false; o.currentOffsetX = 0; o.currentOffsetY = 0; o.hasFiredOnShow = false; o.resetAnimation(); if (o.children) resetRec(o.children); }); } resetRec(objects); resizeCanvas(); updateSidebarButtons(); syncPropPanel(); renderTree(); }
function deleteCurrentScreen() { if (screens.length <= 1) { alert("Tidak bisa menghapus screen terakhir!"); return; } let scrName = screens[activeScreenIdx].id; if (confirm(`Hapus screen '${scrName}' beserta seluruh objek di dalamnya?`)) { saveState(); screens.splice(activeScreenIdx, 1); switchScreen(activeScreenIdx > 0 ? activeScreenIdx - 1 : 0); renderTriggerBrowser(); } }
function generateImageForObject(o) { let tempCanvas = document.createElement('canvas'); tempCanvas.width = o.w; tempCanvas.height = o.h; let tCtx = tempCanvas.getContext('2d'); if (!o.bgColorNone) { tCtx.fillStyle = o.bgColor; tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height); } if (!o.colorNone && o.pixels) { o.pixels.forEach(p => { tCtx.fillStyle = p.c ? p.c : o.color; tCtx.fillRect(p.x, p.y, 1, 1); }); } return tempCanvas.toDataURL('image/png'); }

function exportToJerryScript() {
    let projNameInput = document.getElementById('projectName').value.trim() || "Project_1";
    const out = { project: projNameInput, resolution: { w: PROJECT_W, h: PROJECT_H }, triggers: globalTriggers, screens: screens.map(scr => ({ id: scr.id, type: scr.type, visible_canvas: scr.visibleCanvas, visible_led: scr.visibleLed, duration: scr.durationMode === 'fixed' ? scr.durationFixed : { waitForAnim: scr.durationAnimObj }, nextEvent: { action: scr.nextAction, target: scr.nextTarget }, objects: scr.objects.map(serializeObj) })) };
    const imagesArea = document.getElementById('exportImagesArea'); const btnDownload = document.getElementById('btnDownloadImages'); imagesArea.innerHTML = ''; window.generatedExportImages = []; let hasImages = false;
    screens.forEach(scr => { function extractImages(list) { list.forEach(o => { if (o.type === 'drawing' || o.type === 'image') { hasImages = true; let dataUrl = generateImageForObject(o); window.generatedExportImages.push({ name: o.name + '.gif', data: dataUrl }); let wrapper = document.createElement('div'); wrapper.style.textAlign = 'center'; wrapper.style.background = '#222'; wrapper.style.padding = '5px'; wrapper.style.borderRadius = '4px'; wrapper.style.border = '1px solid #444'; let img = document.createElement('img'); img.src = dataUrl; img.style.height = '60px'; img.style.width = 'auto'; img.style.imageRendering = 'pixelated'; img.style.display = 'block'; img.style.margin = '0 auto'; let label = document.createElement('div'); label.innerText = o.name + '.gif'; label.style.fontSize = '10px'; label.style.color = '#ccc'; label.style.marginTop = '4px'; wrapper.appendChild(img); wrapper.appendChild(label); imagesArea.appendChild(wrapper); } if (o.type === 'group' && o.children) extractImages(o.children); }); } extractImages(scr.objects); });
    if (hasImages) { imagesArea.classList.remove('hidden'); btnDownload.classList.remove('hidden'); } else { imagesArea.classList.add('hidden'); btnDownload.classList.add('hidden'); } document.getElementById('outputArea').value = "var sceneData = " + JSON.stringify(out, null, 2) + ";"; document.getElementById('exportModal').style.display = 'block';
}

function downloadAllImages() { if(!window.generatedExportImages) return; window.generatedExportImages.forEach(img => { let a = document.createElement('a'); a.href = img.data; a.download = img.name; document.body.appendChild(a); a.click(); document.body.removeChild(a); }); }
function copyToClipboard() { const copyText = document.getElementById("outputArea"); copyText.select(); copyText.setSelectionRange(0, 99999); navigator.clipboard.writeText(copyText.value).then(() => { alert("Kode JSON berhasil di-copy!"); }); }
function openImportModal() { document.getElementById('importArea').value = ""; document.getElementById('importModal').style.display = 'block'; }

function importFromJson() {
    try {
        const str = document.getElementById('importArea').value; let jsonStr = str.replace(/var sceneData = /g, '').replace(/;$/g, '').trim(); const data = JSON.parse(jsonStr);
        if(data.project) document.getElementById('projectName').value = data.project; PROJECT_W = data.resolution.w; PROJECT_H = data.resolution.h; document.getElementById('globalW').value = PROJECT_W; document.getElementById('globalH').value = PROJECT_H;
        if(data.triggers) { globalTriggers = data.triggers; if(!globalTriggers.whenJumat) globalTriggers.whenJumat = { action: 'show_screen', target: '' }; if(globalTriggers.whenDzuhur && globalTriggers.whenDzuhur.dayRule) delete globalTriggers.whenDzuhur.dayRule; } else { globalTriggers = { whenImsak: { action: 'show_screen', target: '' }, whenSubuh: { action: 'show_screen', target: '' }, whenTerbit: { action: 'show_screen', target: '' }, whenDzuhur: { action: 'show_screen', target: '' }, whenJumat: { action: 'show_screen', target: '' }, whenAshar: { action: 'show_screen', target: '' }, whenMagrib: { action: 'show_screen', target: '' }, whenIsya: { action: 'show_screen', target: '' } }; }
        screens = data.screens.map(scrData => { let scr = { id: scrData.id, type: scrData.type, visibleCanvas: scrData.visible_canvas !== false, visibleLed: scrData.visible_led !== false, objects: [], nextAction: scrData.nextEvent?.action || '', nextTarget: scrData.nextEvent?.target || '' }; if (typeof scrData.duration === 'string') { scr.durationMode = 'fixed'; scr.durationFixed = scrData.duration; scr.durationAnimObj = ''; } else { scr.durationMode = 'anim'; scr.durationFixed = '00:00:10'; scr.durationAnimObj = scrData.duration?.waitForAnim || ''; } scr.objects = scrData.objects.map(oData => restoreObject(oData)); return scr; });
        undoStack = []; redoStack = []; switchScreen(0); renderTriggerBrowser(); document.getElementById('importModal').style.display = 'none'; alert('Project berhasil di-load!');
    } catch (e) { alert('Format JSON tidak valid atau rusak!'); console.error(e); }
}

function animate(timestamp) {
    if(!timestamp) timestamp = performance.now(); if (!lastFrameTime) lastFrameTime = timestamp; window.deltaTime = timestamp - lastFrameTime; lastFrameTime = timestamp; if(window.deltaTime > 100 || window.deltaTime < 0) window.deltaTime = 16.6; 
    if (isClockSimulated) { simulatedTimeMs += window.deltaTime; }
    
    // PERUBAHAN DI SINI: Background Kanvas Kembali Hitam
    ctx.fillStyle = "#000000"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height); 
    
    let scr = screens[activeScreenIdx]; if (!isSimulating || scr.visibleLed) { objects.forEach(o => o.draw()); }
    
    // PERUBAHAN DI SINI: Grid Kembali Putih Transparan
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; 
    ctx.lineWidth = 1; ctx.beginPath(); 
    for(let i=0; i<=canvas.width; i+=GRID_SIZE) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); } 
    for(let i=0; i<=canvas.height; i+=GRID_SIZE) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); } ctx.stroke();
    
    if (isSimulating) {
        if (playMode === 'countdown') {
            document.getElementById('simOverlay').style.display = 'block'; let secLeft = Math.ceil(triggerCountdownTimer / 1000); document.getElementById('simOverlayTime').innerText = `⏱️ -${secLeft}s`; let tName = pendingTrigger ? pendingTrigger.replace('when', '').toUpperCase() : ''; document.getElementById('simOverlayAction').innerHTML = `MENUJU WAKTU: <span style="color:#f39c12;">${tName}</span>`;
            triggerCountdownTimer -= window.deltaTime; if (triggerCountdownTimer <= 0) { playMode = 'all'; if (pendingTrigger && globalTriggers[pendingTrigger]) { let config = globalTriggers[pendingTrigger]; triggerEvent('show_screen', config.target); } else { stopSimulation(); } }
        } else if (scr.durationMode === 'fixed') {
            document.getElementById('simOverlay').style.display = 'block'; let s = Math.max(0, Math.ceil(simTimer / 1000)); let h = Math.floor(s/3600).toString().padStart(2,'0'); let m = Math.floor((s%3600)/60).toString().padStart(2,'0'); let sec = Math.floor(s%60).toString().padStart(2,'0'); document.getElementById('simOverlayTime').innerText = `⏱️ ${h}:${m}:${sec}`; let actLabel = scr.nextAction ? scr.nextAction.toUpperCase() : 'STOP SIMULATION'; let tgtLabel = scr.nextTarget ? ` ➡️ ${scr.nextTarget}` : ''; document.getElementById('simOverlayAction').innerHTML = `NEXT: <span style="color:#fff;">${actLabel}${tgtLabel}</span>`;
        } else {
            document.getElementById('simOverlay').style.display = 'block'; document.getElementById('simOverlayTime').innerText = `⏳ WAITING ANIM`; document.getElementById('simOverlayAction').innerHTML = `TRIGGER: <span style="color:#fff;">${scr.durationAnimObj || "NONE"}</span>`;
        }

        if (playMode !== 'countdown') {
            simTimer -= window.deltaTime; 
            if (simTimer <= 0) {
                if (preSimState) { let backup = JSON.parse(preSimState); let bScr = backup.find(x => x.id === screens[activeScreenIdx].id); if (bScr) { function restoreRec(backupList, realList) { backupList.forEach(bObj => { let o = realList.find(x => x.name === bObj.name); if (o) { o.visibleCanvas = bObj.vis; o.isAnimPlaying = false; o.currentOffsetX = 0; o.currentOffsetY = 0; o.hasFiredOnShow = false; if (o.children && bObj.children) restoreRec(bObj.children, o.children); } }); } restoreRec(bScr.objects, screens[activeScreenIdx].objects); } }
                if (playMode === 'screen') { stopSimulation(); } else {
                    let act = scr.nextAction; let tgt = scr.nextTarget;
                    if (act === 'show_screen') { let idx = screens.findIndex(s => s.id === tgt && s.visibleLed); if (idx !== -1) startScreenSim(idx); else stopSimulation(); } 
                    else if (act === 'show_object' || act === 'show_group') { if(findAndToggleVisibilityRecursive(scr.objects, tgt, true)) { simTimer = scr.durationMode === 'fixed' ? parseDuration(scr.durationFixed) : 999999; } else stopSimulation(); } 
                    else if (act === 'hide_object' || act === 'hide_group') { if(findAndToggleVisibilityRecursive(scr.objects, tgt, false)) { simTimer = scr.durationMode === 'fixed' ? parseDuration(scr.durationFixed) : 999999; } else stopSimulation(); } 
                    else { if (scr.type === 'splash') { let mIdx = screens.findIndex(s=>s.type==='main' && s.visibleLed); if(mIdx !== -1) startScreenSim(mIdx); else stopSimulation(); } else { stopSimulation(); } }
                }
            }
        }
    }
    requestAnimationFrame(animate); if(selectedObj && selectedObjs.length === 1 && (selectedObj.anim !== 'none' || selectedObj.anim2 !== 'none' || !['text','drawing','image','sholat','sholat_name','iqomah','group', 'line', 'auto_sholat'].includes(selectedObj.type))) syncGeometryUI();
}

fetchPrayerTimes(); initFonts();
screens.push({ id: "Screen_Splash", type: "splash", visibleCanvas: true, visibleLed: true, objects: [], durationMode: 'fixed', durationFixed: '00:00:03', durationAnimObj: '', nextAction: '', nextTarget: '' });
screens.push({ id: "Screen_Main", type: "main", visibleCanvas: true, visibleLed: true, objects: [], durationMode: 'fixed', durationFixed: '00:00:10', durationAnimObj: '', nextAction: '', nextTarget: '' });
switchScreen(0); updateSidebarButtons(); renderTriggerBrowser(); requestAnimationFrame(animate);