const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('hoverTooltip');
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

let PROJECT_W = 64;
let PROJECT_H = 32;
const BASE_GRID_SIZE = 12;
let GRID_SIZE = 12; 

let screens = [];
let activeScreenIdx = 0;
let objects = []; 
let selectedObjs = []; 
let undoStack = [], redoStack = [];
let selectedObj = null; 

let mode = 'pen', isDrawing = false, isDragging = false, isResizing = false;
let resizeDir = ''; let dragOffsets = [];
let clipboardData = [];

let isSimulating = false;
let simTimer = 0;
let preSimState = null;
let playMode = 'all'; 

let isClockSimulated = false;
let simulatedTimeMs = 0;
let triggerCountdownTimer = 0;
let pendingTrigger = null;

let lastUsedFont = null;
let lastFrameTime = 0;
window.deltaTime = 16.6;

let globalTriggers = {
    whenImsak: { action: 'show_screen', target: '' },
    whenSubuh: { action: 'show_screen', target: '' },
    whenTerbit: { action: 'show_screen', target: '' },
    whenDzuhur: { action: 'show_screen', target: '' },
    whenJumat: { action: 'show_screen', target: '' },
    whenAshar: { action: 'show_screen', target: '' },
    whenMagrib: { action: 'show_screen', target: '' },
    whenIsya: { action: 'show_screen', target: '' }
};

const FORMATS = { 
    clock: ['HH:mm:ss', 'HH:mm', 'hh:mm A', 'dddd, DD-MM-YY'], 
    cal_masehi: ['DD/MM/YYYY', 'DD-MM-YYYY', 'DD MMM YYYY', 'dddd, DD MMM YYYY'], 
    cal_hijri: ['DD MMMM YYYY (H)', 'DD/MM/YYYY (H)', 'dddd, DD MMMM YYYY (H)'],
    iqomah: ['HH:mm:ss', 'mm:ss'] 
};

function initFonts() {
    const fontSelect = document.getElementById('propFont');
    if(!fontSelect) return;
    fontSelect.innerHTML = '';
    if (typeof PixelFonts !== 'undefined') {
        for (let key in PixelFonts) { let opt = document.createElement('option'); opt.value = key; opt.innerText = PixelFonts[key].name; fontSelect.appendChild(opt); }
    } else { let opt = document.createElement('option'); opt.value = "error"; opt.innerText = "Error: fonts.js tidak ditemukan"; fontSelect.appendChild(opt); }
}

function updateProjectRes() { PROJECT_W = parseInt(document.getElementById('globalW').value) || 64; PROJECT_H = parseInt(document.getElementById('globalH').value) || 32; resizeCanvas(); renderTree(); }
function isNameUnique(name) { let found = false; function checkList(list) { for(let o of list) { if(o.name === name) found = true; if(o.type === 'group' && o.children) checkList(o.children); } } screens.forEach(s => checkList(s.objects)); return !found; }

function getUniqueName(base) { 
    let count = 1; 
    let shortBase = base.substring(0, 7);
    let n = `${shortBase}_${count}`; 
    while (!isNameUnique(n) && count < 100) { count++; n = `${shortBase}_${count}`; } 
    return n.substring(0, 10); 
}

function parseDuration(str) { 
    if(!str) return 10000;
    let pts = str.split(':'); 
    if(pts.length === 3) return (parseInt(pts[0], 10)*3600 + parseInt(pts[1], 10)*60 + parseInt(pts[2], 10)) * 1000; 
    return 10000; 
}

class PixelObject {
    constructor(name, type, gridX, gridY) {
        this.name = name; this.type = type; this.x = gridX; this.y = gridY; 
        this.visibleCanvas = true; this.visibleLed = true;
        this.w = (type === 'drawing' || type === 'image' || type === 'sholat' || type === 'sholat_name' || type === 'iqomah') ? 25 : (type === 'line' ? 32 : 32); 
        this.h = (type === 'drawing' || type === 'image' || type === 'sholat' || type === 'sholat_name' || type === 'iqomah') ? 10 : (type === 'line' ? 1 : 10);  
        this.text = (type === 'drawing' || type === 'image' || type === 'sholat' || type === 'sholat_name' || type === 'iqomah' || type === 'group' || type === 'line') ? "" : "TEXT"; 
        this.format = ""; 
        this.editable = false; this.title = name;

        let defaultFont = (typeof PixelFonts !== 'undefined' && Object.keys(PixelFonts).length > 0) ? Object.keys(PixelFonts)[0] : "monospace"; 
        this.font = lastUsedFont || defaultFont; 
        
        this.color = "#ffffff"; this.colorNone = false;
        this.fColor = "#00ff00"; this.fColorNone = true;
        this.bgColor = "#000000"; this.bgColorNone = true;
        
        this.lineDir = 'h'; this.lineThick = 1; this.lineLength = 32; this.lineColor = "#8e44ad";
        this.radius = 0; this.alignH = 'center'; this.alignV = 'middle'; 
        
        this.anim = 'none'; this.speed = 1.0; this.animDelay = 0; this.animStopX = 5;
        this.anim2 = 'none'; this.speed2 = 1.0; this.animDelay2 = 0; this.anim2StopX = 5;
        
        this.isAnimPlaying = false; 
        this.animState = 1; 
        this._nextStepX1 = 0;
        this._nextStepX2 = 0;
        this.delayTimer = 0;
        this.blinkTimer = 0;
        this.currentOffsetX = 0; this.currentOffsetY = 0;

        this.onShowAction = ""; this.onShowTarget = "";
        this.onDoneAction = ""; this.onDoneTarget = "";
        this.hasFiredOnShow = false;

        this.sholatType = 'Subuh';
        this.iqomahTime = 5; 
        this.iqomahUnit = 'menit';
        this.iqomahOffset = 0;
        this.iqomahAnimTriggerSec = 3; 
        this.iqomahTriggerUnit = 'detik';
        this.iqomahTimer = 0; 
        this._iqomahAnimTriggered = false;
        this._iqomahDone = false;

        this.pixels = []; this.customPixels = []; this.children = []; this.textWidth = 0; this.textHeight = 7; 
        if (type !== 'group' && type !== 'line') this.updateContent();
    }

    getContentW() { return ['text', 'clock', 'cal_masehi', 'cal_hijri', 'sholat', 'sholat_name', 'iqomah'].includes(this.type) ? (this.textWidth || this.w) : this.w; }
    getContentH() { return ['text', 'clock', 'cal_masehi', 'cal_hijri', 'sholat', 'sholat_name', 'iqomah'].includes(this.type) ? (this.textHeight || this.h) : this.h; }

    resetAnimation() {
        if (this.type === 'iqomah' && isSimulating && !this._iqomahDone) {
            this.animState = (this.anim !== 'none') ? 1 : 2;
        } else {
            this.animState = (this.anim !== 'none') ? 1 : ((this.anim2 !== 'none') ? 3 : 0);
        }
        this.delayTimer = 0;
        this.blinkTimer = 0;
        this.hasFiredOnShow = false;
        
        let aStart = 'none';
        if (this.animState === 1) aStart = this.anim;
        else if (this.animState === 3) aStart = this.anim2;
        
        this._setupAnimStart(aStart, this.animState === 3);
        if (this.children) this.children.forEach(c => c.resetAnimation());
    }

    _setupAnimStart(type, isAnim2 = false) {
        if(type === 'slide-left' || type === 'slide-left-stop') { 
            let align = this.calcAlign();
            this.currentOffsetX = this.w - align.aX; 
            this.currentOffsetY = 0; 
        }
        else if(type === 'slide-right' || type === 'slide-right-stop') { 
            let align = this.calcAlign();
            this.currentOffsetX = -(this.getContentW() + align.aX); 
            this.currentOffsetY = 0; 
        }
        else if(type === 'slide-left-stop-current') {
            let stopVal = isAnim2 ? this.anim2StopX : this.animStopX;
            let stepDist = Math.max(1, Math.abs(stopVal || 0));
            if (stopVal == 0) stepDist = 9999;
            if (isAnim2) this._nextStepX2 = this.currentOffsetX - stepDist;
            else this._nextStepX1 = this.currentOffsetX - stepDist;
        }
        else if(type === 'slide-right-stop-current') {
            let stopVal = isAnim2 ? this.anim2StopX : this.animStopX;
            let stepDist = Math.max(1, Math.abs(stopVal || 0));
            if (stopVal == 0) stepDist = 9999;
            if (isAnim2) this._nextStepX2 = this.currentOffsetX + stepDist;
            else this._nextStepX1 = this.currentOffsetX + stepDist;
        }
        else if(type === 'slide-up') { this.currentOffsetX = 0; this.currentOffsetY = this.h; }
        else if(type === 'slide-down') { this.currentOffsetX = 0; this.currentOffsetY = 0; }
        else { this.currentOffsetX = 0; this.currentOffsetY = 0; }
        this.blinkTimer = 0;
    }

    _stepAnimation(type, speed, isAnim2 = false) {
        let dtRatio = window.deltaTime / 16.6; 
        
        if (type === 'blink') {
            this.blinkTimer += window.deltaTime;
            let cycle = 1000 / speed;
            if (this.blinkTimer >= cycle) { this.blinkTimer = 0; return true; }
            return false;
        }

        let step = 0.5 * speed * dtRatio; 
        
        if(type === 'slide-left') {
            let align = this.calcAlign(); let cW = this.getContentW();
            this.currentOffsetX -= step;
            if(this.currentOffsetX <= -(cW + align.aX)) { this.currentOffsetX = -(cW + align.aX); return true; }
            return false;
        } 
        else if(type === 'slide-left-stop') {
            this.currentOffsetX -= step;
            if(this.currentOffsetX <= 0) { this.currentOffsetX = 0; return true; } 
            return false;
        } 
        else if(type === 'slide-left-stop-current') {
            let stopVal = isAnim2 ? this.anim2StopX : this.animStopX;
            let stepDist = Math.max(1, Math.abs(stopVal || 0));
            if(stopVal == 0) stepDist = 9999;

            let align = this.calcAlign();
            let cW = this.getContentW();
            let endBoundary = -(cW + align.aX);

            this.currentOffsetX -= step;
            let targetStepX = isAnim2 ? this._nextStepX2 : this._nextStepX1;

            if (this.currentOffsetX <= endBoundary) {
                this.currentOffsetX = endBoundary;
                return true; 
            }

            if (this.currentOffsetX <= targetStepX) {
                this.currentOffsetX = targetStepX;
                if (isAnim2) this._nextStepX2 = this.currentOffsetX - stepDist;
                else this._nextStepX1 = this.currentOffsetX - stepDist;
                return 'pause';
            }
            return false;
        } 
        else if(type === 'slide-right') {
            this.currentOffsetX += step;
            if(this.currentOffsetX >= this.w) { this.currentOffsetX = this.w; return true; }
            return false;
        } 
        else if(type === 'slide-right-stop') {
            this.currentOffsetX += step;
            if(this.currentOffsetX >= 0) { this.currentOffsetX = 0; return true; } 
            return false;
        } 
        else if(type === 'slide-right-stop-current') {
            let stopVal = isAnim2 ? this.anim2StopX : this.animStopX;
            let stepDist = Math.max(1, Math.abs(stopVal || 0));
            if(stopVal == 0) stepDist = 9999;

            let endBoundary = this.w;

            this.currentOffsetX += step;
            let targetStepX = isAnim2 ? this._nextStepX2 : this._nextStepX1;

            if (this.currentOffsetX >= endBoundary) {
                this.currentOffsetX = endBoundary;
                return true; 
            }

            if (this.currentOffsetX >= targetStepX) {
                this.currentOffsetX = targetStepX;
                if (isAnim2) this._nextStepX2 = this.currentOffsetX + stepDist;
                else this._nextStepX1 = this.currentOffsetX + stepDist;
                return 'pause';
            }
            return false;
        } 
        else if(type === 'slide-up') {
            this.currentOffsetY -= step;
            if(this.currentOffsetY <= 0) { this.currentOffsetY = 0; return true; } 
            return false;
        } 
        else if(type === 'slide-down') {
            this.currentOffsetY += step;
            if(this.currentOffsetY >= this.h) { this.currentOffsetY = this.h; return true; } 
            return false;
        } 
        
        return true; 
    }

    getDisplayString() {
        if (this.type === 'drawing' || this.type === 'image' || this.type === 'group' || this.type === 'line') return "";
        if (this.type === 'sholat') { 
            return window.currentPrayerTimes ? (window.currentPrayerTimes[this.sholatType] || '00:00') : '00:00'; 
        }
        if (this.type === 'sholat_name') {
            // Mengambil nama sholat aktif dari variabel global
            return window.activePrayerName || 'SUBUH';
        }
        
        if (this.type === 'iqomah') { 
            let totalSecs = isSimulating ? Math.ceil(this.iqomahTimer) : ((this.iqomahUnit === 'menit' ? this.iqomahTime * 60 : this.iqomahTime) - this.iqomahOffset);
            if (totalSecs < 0) totalSecs = 0;
            let h = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
            let m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
            let s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
            return this.format === 'HH:mm:ss' ? `${h}:${m}:${s}` : `${m}:${s}`; 
        }
        
        const now = isClockSimulated ? new Date(simulatedTimeMs) : new Date();
        const d = String(now.getDate()).padStart(2,'0'); 
        const mNum = String(now.getMonth()+1).padStart(2,'0'); 
        const y2 = String(now.getFullYear()).slice(-2);
        const y4 = now.getFullYear();
        const mShort = now.toLocaleDateString('id-ID', {month:'short'}).toUpperCase(); 
        const mLong = now.toLocaleDateString('id-ID', {month:'long'}).toUpperCase();
        
        let dayName = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"][now.getDay()];

        if (this.format === 'DD-MM-YY') return `${d}-${mNum}-${y2}`;
        if (this.format === 'DD-MON-YY') return `${d}-${mShort}-${y2}`;
        if (this.format === 'DD-MONTH-YY') return `${d}-${mLong}-${y2}`;
        if (this.format === 'dddd, DD-MM-YY') return `${dayName}, ${d}-${mNum}-${y2}`;
        if (this.format === 'dddd, DD MMM YYYY') return `${dayName}, ${d} ${mShort} ${y4}`;

        if (this.type === 'clock') { 
            const h = String(now.getHours()).padStart(2,'0'), m = String(now.getMinutes()).padStart(2,'0'), s = String(now.getSeconds()).padStart(2,'0'); 
            if(this.format === 'HH:mm') return `${h}:${m}`; 
            if(this.format === 'hh:mm A') return now.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}); 
            return `${h}:${m}:${s}`; 
        }
        if (this.type === 'cal_masehi') { 
            if(this.format === 'DD-MM-YYYY') return `${d}-${mNum}-${y4}`; 
            if(this.format === 'DD MMM YYYY') return `${d} ${mShort} ${y4}`;
            return `${d}/${mNum}/${y4}`; 
        }
        if (this.type === 'cal_hijri') { 
            let hStr = new Intl.DateTimeFormat('id-u-ca-islamic', {day:'numeric',month:'long',year:'numeric'}).format(now);
            if (this.format === 'DD/MM/YYYY (H)') hStr = new Intl.DateTimeFormat('id-u-ca-islamic', {day:'2-digit',month:'2-digit',year:'numeric'}).format(now); 
            if (this.format === 'dddd, DD MMMM YYYY (H)') return `${dayName}, ${hStr}`;
            return hStr; 
        }
        return this.text;
    }
    
    updateContent() {
        if (this.type === 'group' || this.type === 'line') return; 

        if (this.type === 'drawing' || this.type === 'image') {
            this.pixels = this.customPixels.map(p => ({ x: p.x, y: p.y, c: p.c }));
            this.textWidth = this.w; this.textHeight = this.h;
        } else {
            const str = this.getDisplayString(); this.pixels = []; 
            let fontDef = (typeof PixelFonts !== 'undefined') ? PixelFonts[this.font] : null;

            if (fontDef) {
                let xOff = 0; let height = fontDef.height; let heightBytes = Math.ceil(height / 8); 
                let firstChar = fontDef.firstChar || 32; let order = fontDef.order || "horiz_page"; 

                for (let char of str) {
                    if (char === ' ') {
                        let nIdx = 'n'.charCodeAt(0) - firstChar;
                        let sw = (fontDef.widths && fontDef.widths[nIdx]) ? fontDef.widths[nIdx] : (fontDef.width || 4);
                        xOff += (sw === 0 ? 4 : sw) + (fontDef.space || 1);
                        continue;
                    }

                    const index = char.charCodeAt(0) - firstChar;
                    if (index < 0 || (fontDef.widths && index >= fontDef.widths.length)) continue;

                    let charWidth = fontDef.widths ? (fontDef.widths[index] || 0) : fontDef.width;
                    let charDataStart = 0;

                    if (fontDef.widths) { for (let i = 0; i < index; i++) { charDataStart += (fontDef.widths[i] || 0) * heightBytes; } } else { charDataStart = index * heightBytes * charWidth; }

                    for (let cx = 0; cx < charWidth; cx++) {
                        for (let cy = 0; cy < heightBytes; cy++) {
                            let dataIndex = (order === "horiz_page") ? charDataStart + (cy * charWidth) + cx : charDataStart + (cx * heightBytes) + cy;
                            let value = fontDef.data[dataIndex] || 0;
                            let posn = cy * 8; if (heightBytes > 1 && cy === (heightBytes - 1)) { posn = height - 8; }

                            for (let bit = 0; bit < 8; bit++) {
                                let targetY = posn + bit;
                                let isValidY = (height <= 8) ? (targetY < 8) : (targetY >= cy * 8 && targetY < height);
                                if (isValidY && ((value >> bit) & 0x01)) { this.pixels.push({ x: cx + xOff, y: targetY }); }
                            }
                        }
                    }
                    xOff += charWidth + (fontDef.space || 1);
                }
                this.textWidth = Math.max(0, xOff - (fontDef.space || 1)); this.textHeight = height;
            } else {
                const fontSize = 10; offCanvas.width = Math.max(1, str.length * fontSize); offCanvas.height = fontSize + 4;
                offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height); offCtx.fillStyle = "black"; 
                offCtx.font = `bold ${fontSize}px monospace`; offCtx.textBaseline = "top"; offCtx.fillText(str, 0, 0);
                const data = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height); let maxW = 0;
                for (let y = 0; y < offCanvas.height; y++) { for (let x = 0; x < offCanvas.width; x++) { if (data.data[(y * offCanvas.width + x) * 4 + 3] > 128) { this.pixels.push({ x: x, y: y }); if (x > maxW) maxW = x; } } } 
                this.textWidth = maxW + 1; this.textHeight = fontSize;
            }
        }
    }
    
    calcAlign() {
        if (this.type === 'drawing' || this.type === 'image' || this.type === 'group' || this.type === 'line') return { aX: 0, aY: 0 }; 
        let aX = 0; if(this.alignH === 'center') aX = Math.floor((this.w - this.textWidth) / 2); if(this.alignH === 'right') aX = this.w - this.textWidth;
        let aY = 0; if(this.alignV === 'middle') aY = Math.floor((this.h - this.textHeight) / 2); if(this.alignV === 'bottom') aY = this.h - this.textHeight; return { aX, aY };
    }

    draw() {
        if (isSimulating) { if (!this.visibleLed || !this.visibleCanvas) return; } else { if (!this.visibleCanvas) return; }

        if (isSimulating && this.type === 'iqomah') {
            if (this.iqomahTimer > 0) {
                this.iqomahTimer -= window.deltaTime / 1000;
                
                let triggerThreshold = this.iqomahTriggerUnit === 'menit' ? this.iqomahAnimTriggerSec * 60 : this.iqomahAnimTriggerSec;

                if (this.iqomahTimer <= triggerThreshold && this.iqomahTimer > 0 && !this._iqomahAnimTriggered) {
                    this._iqomahAnimTriggered = true;
                    this.isAnimPlaying = true;
                    this.resetAnimation();
                }

                if (this.iqomahTimer <= 0) {
                    this.iqomahTimer = 0;
                    if (!this._iqomahDone) {
                        this._iqomahDone = true;
                        if (this.anim2 !== 'none') {
                            this.animState = 3;
                            this._setupAnimStart(this.anim2, true);
                            this.isAnimPlaying = true;
                        } else {
                            this.isAnimPlaying = false;
                            this.animState = 0;
                            triggerEvent(this.onDoneAction, this.onDoneTarget);
                            if (isSimulating) { let currentScr = screens[activeScreenIdx]; if (currentScr && currentScr.durationMode === 'anim' && currentScr.durationAnimObj === this.name) simTimer = 0; }
                        }
                    }
                }
            }
        }

        const renderX = this.x * GRID_SIZE; const renderY = this.y * GRID_SIZE; const dW = this.w * GRID_SIZE; const dH = this.h * GRID_SIZE; const rPx = this.radius * Math.min(GRID_SIZE/2, 4);

        ctx.save(); ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(renderX, renderY, dW, dH, rPx); else ctx.rect(renderX, renderY, dW, dH);
        ctx.clip(); 

        let isBlinking = false;
        if(this.isAnimPlaying && this.animState === 1 && this.anim === 'blink') isBlinking = true;
        if(this.isAnimPlaying && this.animState === 3 && this.anim2 === 'blink') isBlinking = true;

        if (isBlinking) { 
            let bSpeed = (this.animState === 1) ? this.speed : this.speed2;
            let halfCycle = (1000 / bSpeed) / 2;
            ctx.globalAlpha = (this.blinkTimer < halfCycle) ? 0 : 1; 
        } else { ctx.globalAlpha = 1; }

        if (this.isAnimPlaying) {
            if (!this.hasFiredOnShow) { this.hasFiredOnShow = true; triggerEvent(this.onShowAction, this.onShowTarget); }

            if (this.animState === 1) { 
                let res = this._stepAnimation(this.anim, this.speed, false);
                if (res === 'pause') { 
                    this.animState = 1.5; this.delayTimer = this.animDelay * 1000;
                } else if (res === true) {
                    this.animState = 2; this.delayTimer = this.animDelay * 1000;
                }
            } else if (this.animState === 1.5) {
                this.delayTimer -= window.deltaTime;
                if (this.delayTimer <= 0) {
                    this.animState = 1; 
                }
            } else if (this.animState === 2) { 
                this.delayTimer -= window.deltaTime;
                if (this.delayTimer <= 0) {
                    if (this.type === 'iqomah' && !this._iqomahDone) {
                        if (this.anim.includes('stop')) {
                            this.delayTimer = 100; 
                        } else if (this.anim === 'none') {
                            this.delayTimer = 100; 
                        } else {
                            this.animState = 1; this._setupAnimStart(this.anim, false); 
                        }
                    } else {
                        if (this.anim2 !== 'none') { 
                            this.animState = 3; this._setupAnimStart(this.anim2, true); 
                        } else { 
                            triggerEvent(this.onDoneAction, this.onDoneTarget); 
                            if (isSimulating) { let currentScr = screens[activeScreenIdx]; if (currentScr && currentScr.durationMode === 'anim' && currentScr.durationAnimObj === this.name) simTimer = 0; }
                            
                            if (this.anim.includes('stop')) {
                                this.isAnimPlaying = false; 
                            } else {
                                this.animState = 1; this._setupAnimStart(this.anim, false); 
                            }
                        }
                    }
                }
            } else if (this.animState === 3) { 
                let res = this._stepAnimation(this.anim2, this.speed2, true);
                if (res === 'pause') { 
                    this.animState = 3.5; this.delayTimer = this.animDelay2 * 1000;
                } else if (res === true) {
                    this.animState = 4; this.delayTimer = this.animDelay2 * 1000;
                }
            } else if (this.animState === 3.5) {
                this.delayTimer -= window.deltaTime;
                if (this.delayTimer <= 0) {
                    this.animState = 3; 
                }
            } else if (this.animState === 4) { 
                this.delayTimer -= window.deltaTime;
                if (this.delayTimer <= 0) {
                    triggerEvent(this.onDoneAction, this.onDoneTarget);
                    if (isSimulating) { let currentScr = screens[activeScreenIdx]; if (currentScr && currentScr.durationMode === 'anim' && currentScr.durationAnimObj === this.name) simTimer = 0; }
                    
                    if (this.anim2.includes('stop')) {
                        this.isAnimPlaying = false; 
                    } else {
                        if (this.anim !== 'none') { 
                            this.animState = 1; this._setupAnimStart(this.anim, false); 
                        } else { 
                            this.animState = 3; this._setupAnimStart(this.anim2, true); 
                        }
                    }
                }
            }
        } else if (!isSimulating && (!this.anim.includes('stop') && !this.anim2.includes('stop'))) {
            this.currentOffsetX = 0; this.currentOffsetY = 0;
        }

        if (this.type === 'group') {
            let sOffX = this.currentOffsetX * GRID_SIZE; let sOffY = this.currentOffsetY * GRID_SIZE;
            if (!this.bgColorNone && ctx.globalAlpha !== 0) { ctx.fillStyle = this.bgColor; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(renderX + sOffX, renderY + sOffY, dW, dH, rPx); else ctx.rect(renderX + sOffX, renderY + sOffY, dW, dH); ctx.fill(); }
            if (!this.fColorNone && ctx.globalAlpha !== 0) { ctx.fillStyle = this.fColor; ctx.fillRect(renderX + sOffX, renderY + sOffY, dW, GRID_SIZE); ctx.fillRect(renderX + sOffX, renderY + sOffY + dH - GRID_SIZE, dW, GRID_SIZE); ctx.fillRect(renderX + sOffX, renderY + sOffY, GRID_SIZE, dH); ctx.fillRect(renderX + sOffX + dW - GRID_SIZE, renderY + sOffY, GRID_SIZE, dH); }
            ctx.translate(sOffX, sOffY);
            this.children.forEach(c => { let origX = c.x, origY = c.y; c.x = this.x + c.x; c.y = this.y + c.y; c.draw(); c.x = origX; c.y = origY; });
            ctx.translate(-sOffX, -sOffY);
        } else if (this.type === 'line') {
            if (ctx.globalAlpha !== 0) { ctx.fillStyle = this.lineColor; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(renderX, renderY, dW, dH, rPx); else ctx.rect(renderX, renderY, dW, dH); ctx.fill(); }
        } else {
            this.updateContent(); let align = this.calcAlign(); let aX = align.aX, aY = align.aY;

            if (!this.bgColorNone && ctx.globalAlpha !== 0) { ctx.fillStyle = this.bgColor; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(renderX, renderY, dW, dH, rPx); else ctx.rect(renderX, renderY, dW, dH); ctx.fill(); }
            if (!this.fColorNone && ctx.globalAlpha !== 0) { ctx.fillStyle = this.fColor; ctx.fillRect(renderX, renderY, dW, GRID_SIZE); ctx.fillRect(renderX, renderY + dH - GRID_SIZE, dW, GRID_SIZE); ctx.fillRect(renderX, renderY, GRID_SIZE, dH); ctx.fillRect(renderX + dW - GRID_SIZE, renderY, GRID_SIZE, dH); }

            if (ctx.globalAlpha !== 0 && !this.colorNone) {
                this.pixels.forEach((p, i) => {
                    let dx = p.x + aX + this.currentOffsetX; let dy = p.y + aY + this.currentOffsetY;
                    const fx = renderX + (dx * GRID_SIZE); const fy = renderY + (dy * GRID_SIZE);
                    ctx.fillStyle = p.c ? p.c : this.color; ctx.fillRect(fx, fy, GRID_SIZE - 1, GRID_SIZE - 1); 
                });
            }
        }
        
        ctx.restore(); 

        if (!isSimulating && selectedObjs.includes(this)) {
            ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = (this.type === 'line' || this.type === 'group') ? "#e67e22" : "#2ecc71";
            ctx.lineWidth = 2; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(renderX, renderY, dW, dH, rPx); else ctx.rect(renderX, renderY, dW, dH); ctx.stroke();
            if (mode === 'select' && selectedObjs.length === 1) { 
                const hs = 10; ctx.fillStyle = "#e74c3c";
                ctx.fillRect(renderX + dW/2 - hs/2, renderY - hs/2, hs, hs); ctx.fillRect(renderX + dW/2 - hs/2, renderY + dH - hs/2, hs, hs); 
                ctx.fillRect(renderX - hs/2, renderY + dH/2 - hs/2, hs, hs); ctx.fillRect(renderX + dW - hs/2, renderY + dH/2 - hs/2, hs, hs); 
            }
            ctx.restore();
        }
    }
}

function restoreObject(oData) { 
    let n = new PixelObject(oData.id || oData.name, oData.type, oData.frameX ?? oData.x, oData.frameY ?? oData.y); 
    n.visibleCanvas = (oData.visible_canvas !== false && oData.visible !== false); n.visibleLed = oData.visible_led !== false; n.isAnimPlaying = false; 
    n._iqomahDone = false;
    
    n.editable = oData.editable || false; n.title = (oData.title !== undefined) ? oData.title : (oData.name || "");
    n.w = oData.w; n.h = oData.h; n.text = oData.text || ""; n.font = oData.font || "monospace"; n.format = oData.format || "";
    n.colorNone = oData.color === "transparent" || oData.colorNone === true; n.color = n.colorNone ? "#ffffff" : (oData.color || "#ffffff");
    n.bgColorNone = oData.bgColor === "transparent" || oData.bgColorNone === true; n.bgColor = n.bgColorNone ? "#000000" : (oData.bgColor || "#000000");
    n.fColorNone = oData.frameColor === "transparent" || oData.fColor === "transparent" || oData.fColorNone === true; n.fColor = n.fColorNone ? "#00ff00" : (oData.frameColor || oData.fColor || "#00ff00");
    
    if (oData.anim1) { n.anim = oData.anim1.type; n.speed = oData.anim1.speed; n.animDelay = oData.anim1.delay; n.animStopX = oData.anim1.stopX || 5; } else { n.anim = oData.anim || 'none'; n.speed = oData.speed || 1; n.animDelay = oData.animDelay || 0; n.animStopX = oData.animStopX || 5; }
    if (oData.anim2) { n.anim2 = oData.anim2.type; n.speed2 = oData.anim2.speed; n.animDelay2 = oData.anim2.delay || 0; n.anim2StopX = oData.anim2.stopX || 5; } else { n.anim2 = oData.anim2 || 'none'; n.speed2 = oData.speed2 || 1; n.animDelay2 = oData.animDelay2 || 0; n.anim2StopX = oData.anim2StopX || 5; }
    
    n.radius = oData.radius || 0;
    
    if (oData.onShowEvent) { n.onShowAction = oData.onShowEvent.action; n.onShowTarget = oData.onShowEvent.target; }
    if (oData.onDoneEvent) { n.onDoneAction = oData.onDoneEvent.action; n.onDoneTarget = oData.onDoneEvent.target; } else if (oData.nextEvent) { n.onDoneAction = oData.nextEvent.action; n.onDoneTarget = oData.nextEvent.target; }
    
    if (n.type === 'sholat') n.sholatType = oData.sholatType || 'Subuh';
    if (n.type === 'iqomah') { 
        n.iqomahTime = oData.iqomahTime !== undefined ? oData.iqomahTime : 5; 
        n.iqomahUnit = oData.iqomahUnit || 'menit';
        n.iqomahOffset = oData.iqomahOffset || 0;
        n.iqomahAnimTriggerSec = oData.iqomahAnimTriggerSec !== undefined ? oData.iqomahAnimTriggerSec : 3;
        n.iqomahTriggerUnit = oData.iqomahTriggerUnit || 'detik';
        n._iqomahAnimTriggered = false;
        n.iqomahTimer = 0; 
    }
    if (n.type === 'line') { n.lineDir = oData.lineDir || 'h'; n.lineThick = oData.lineThick || 1; n.lineLength = oData.lineLength || 32; n.lineColor = oData.lineColor || '#8e44ad'; }
    if (n.type === 'drawing' || n.type === 'image') n.customPixels = oData.customPixels || oData.pixels || [];
    if (n.type === 'group' && oData.children) n.children = oData.children.map(c => restoreObject(c));
    
    n.resetAnimation(); if(n.type !== 'group' && n.type !== 'line') n.updateContent(); return n; 
}

function serializeObj(o) {
    let align = o.calcAlign();
    let objData = { 
        id: o.name, type: o.type, visible_canvas: o.visibleCanvas, visible_led: o.visibleLed, frameX: o.x, frameY: o.y, w: o.w, h: o.h, contentX: o.x + align.aX, contentY: o.y + align.aY, 
        text: (o.type === 'text' && o.editable) ? o.title : o.text, editable: o.editable, title: o.title,
        font: o.font, format: o.format, color: o.colorNone ? "transparent" : o.color, bgColor: o.bgColorNone ? "transparent" : o.bgColor, frameColor: o.fColorNone ? "transparent" : o.fColor, 
        anim1: { type: o.anim, speed: o.speed, delay: o.animDelay, stopX: o.animStopX }, anim2: { type: o.anim2, speed: o.speed2, delay: o.animDelay2, stopX: o.anim2StopX }, radius: o.radius, 
        onShowEvent: { action: o.onShowAction, target: o.onShowTarget }, onDoneEvent: { action: o.onDoneAction, target: o.onDoneTarget } 
    };

    if (o.type === 'line') { objData.lineDir = o.lineDir; objData.lineThick = o.lineThick; objData.lineLength = o.lineLength; objData.lineColor = o.lineColor; objData.x1 = o.x; objData.y1 = o.y; objData.x2 = o.lineDir === 'h' ? o.x + o.lineLength - 1 : o.x; objData.y2 = o.lineDir === 'v' ? o.y + o.lineLength - 1 : o.y; }
    if (o.type === 'iqomah') { 
        objData.iqomahTime = o.iqomahTime; 
        objData.iqomahUnit = o.iqomahUnit;
        objData.iqomahOffset = o.iqomahOffset;
        objData.iqomahAnimTriggerSec = o.iqomahAnimTriggerSec;
        objData.iqomahTriggerUnit = o.iqomahTriggerUnit;
    }

    if (o.type === 'drawing' || o.type === 'image') { objData.image_file = o.name + ".gif"; }
    if (o.type === 'sholat') { objData.sholatType = o.sholatType; }
    if (o.type === 'group') objData.children = o.children.map(c => serializeObj(c));
    return objData;
}

function saveState() { 
    if(isSimulating) return;
    let state = { 
        w: PROJECT_W, h: PROJECT_H, activeScreenIdx: activeScreenIdx, triggers: JSON.parse(JSON.stringify(globalTriggers)),
        screens: screens.map(scr => ({ id: scr.id, type: scr.type, visibleCanvas: scr.visibleCanvas, visibleLed: scr.visibleLed, durationMode: scr.durationMode, durationFixed: scr.durationFixed, durationAnimObj: scr.durationAnimObj, nextAction: scr.nextAction, nextTarget: scr.nextTarget, objects: scr.objects.map(serializeObj) })) 
    };
    undoStack.push(state); if (undoStack.length > 30) undoStack.shift(); redoStack = []; 
}
function undo() { if (undoStack.length > 0 && !isSimulating) { let state = { w: PROJECT_W, h: PROJECT_H, activeScreenIdx: activeScreenIdx, triggers: JSON.parse(JSON.stringify(globalTriggers)), screens: screens.map(scr => ({ id: scr.id, type: scr.type, visibleCanvas: scr.visibleCanvas, visibleLed: scr.visibleLed, durationMode: scr.durationMode, durationFixed: scr.durationFixed, durationAnimObj: scr.durationAnimObj, nextAction: scr.nextAction, nextTarget: scr.nextTarget, objects: scr.objects.map(serializeObj) })) }; redoStack.push(state); restoreFromState(undoStack.pop()); } }
function redo() { if (redoStack.length > 0 && !isSimulating) { let state = { w: PROJECT_W, h: PROJECT_H, activeScreenIdx: activeScreenIdx, triggers: JSON.parse(JSON.stringify(globalTriggers)), screens: screens.map(scr => ({ id: scr.id, type: scr.type, visibleCanvas: scr.visibleCanvas, visibleLed: scr.visibleLed, durationMode: scr.durationMode, durationFixed: scr.durationFixed, durationAnimObj: scr.durationAnimObj, nextAction: scr.nextAction, nextTarget: scr.nextTarget, objects: scr.objects.map(serializeObj) })) }; undoStack.push(state); restoreFromState(redoStack.pop()); } }

function restoreFromState(s) {
    PROJECT_W = s.w || 64; PROJECT_H = s.h || 32; document.getElementById('globalW').value = PROJECT_W; document.getElementById('globalH').value = PROJECT_H;
    if (s.triggers) globalTriggers = JSON.parse(JSON.stringify(s.triggers));
    screens = s.screens.map(scrData => { let scr = { id: scrData.id, type: scrData.type, visibleCanvas: scrData.visible_canvas !== false && scrData.visibleCanvas !== false, visibleLed: scrData.visible_led !== false && scrData.visibleLed !== false, objects: [], durationMode: scrData.durationMode, durationFixed: scrData.durationFixed, durationAnimObj: scrData.durationAnimObj, nextAction: scrData.nextAction, nextTarget: scrData.nextTarget }; scr.objects = scrData.objects.map(oData => restoreObject(oData)); return scr; });
    activeScreenIdx = s.activeScreenIdx; objects = screens[activeScreenIdx].objects; selectedObjs = []; resizeCanvas(); syncPropPanel(); renderTree(); renderTriggerBrowser();
}

function copyObjects() { if (selectedObjs.length === 0) return; clipboardData = selectedObjs.map(o => serializeObj(o)); }
function pasteObjects() {
    if (clipboardData.length === 0) return; saveState(); let newSelected = [];
    function renameDeep(data) { let base = (data.id || data.name || "Obj").replace(/(_Copy)?(_\d+)?$/, ''); if (data.type === 'group' && !base.startsWith('Group_')) base = "Group_" + base; data.id = getUniqueName(base + "_Copy"); data.name = data.id; if (data.children) data.children.forEach(c => renameDeep(c)); }
    clipboardData.forEach(objData => { let dataCopy = JSON.parse(JSON.stringify(objData)); dataCopy.frameX = (dataCopy.frameX !== undefined ? dataCopy.frameX : dataCopy.x) + 2; dataCopy.frameY = (dataCopy.frameY !== undefined ? dataCopy.frameY : dataCopy.y) + 2; renameDeep(dataCopy); let newObj = restoreObject(dataCopy); objects.push(newObj); newSelected.push(newObj); });
    selectedObjs = newSelected; setMode('select'); syncPropPanel(); renderTree();
}

function addPixelObject(type) { 
    saveState(); let base = type === 'drawing' ? "Draw" : type === 'image' ? "Img" : type === 'line' ? "Line" : type === 'sholat' ? "Jadwal" : type === 'sholat_name' ? "NamaSholat" : type === 'iqomah' ? "Count" : type === 'text' ? "Text" : "Layer";
    let o = new PixelObject(getUniqueName(base), type, Math.max(0, Math.floor(PROJECT_W/2) - 8), Math.max(0, Math.floor(PROJECT_H/2) - 4)); 
    if (type === 'sholat' || type === 'sholat_name') { o.updateContent(); o.w = Math.max(1, o.textWidth); o.h = Math.max(1, o.textHeight); }
    objects.push(o); selectedObjs = [o]; setMode('select'); syncPropPanel(); renderTree();
}

function deleteSelected(skipConfirm = false) { if(selectedObjs.length > 0) { if(!skipConfirm) { if(!confirm(`Hapus ${selectedObjs.length} objek terpilih dari Screen ini?`)) return; } saveState(); objects = objects.filter(o => !selectedObjs.includes(o)); screens[activeScreenIdx].objects = objects; selectedObjs = []; syncPropPanel(); renderTree(); } }