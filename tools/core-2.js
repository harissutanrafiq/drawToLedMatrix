const canvas = document.getElementById('editorCanvas'); const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('hoverTooltip');
const offCanvas = document.createElement('canvas'); const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

let PROJECT_W = 64; let PROJECT_H = 32; const BASE_GRID_SIZE = 12; let GRID_SIZE = 12; 
let screens = []; let activeScreenIdx = 0; let objects = []; let selectedObjs = []; 
let undoStack = [], redoStack = []; let selectedObj = null; 
let mode = 'pen', isDrawing = false, isDragging = false, isResizing = false;
let resizeDir = ''; let dragOffsets = []; let clipboardData = [];
let isSimulating = false; let simTimer = 0; let preSimState = null; let playMode = 'all'; 
let isClockSimulated = false; let simulatedTimeMs = 0; let triggerCountdownTimer = 0; let pendingTrigger = null;
let lastUsedFont = null; let lastFrameTime = 0; window.deltaTime = 16.6;
window.activePrayerName = "SUBUH";

let globalTriggers = { whenImsak: { action: 'show_screen', target: '' }, whenSubuh: { action: 'show_screen', target: '' }, whenTerbit: { action: 'show_screen', target: '' }, whenDzuhur: { action: 'show_screen', target: '' }, whenJumat: { action: 'show_screen', target: '' }, whenAshar: { action: 'show_screen', target: '' }, whenMagrib: { action: 'show_screen', target: '' }, whenIsya: { action: 'show_screen', target: '' } };

const FORMATS = { 
    clock: ['HH:mm:ss', 'HH:mm', 'hh:mm A', 'HH', 'mm', 'ss', 'dddd, DD-MM-YY'], 
    cal_masehi: ['DD/MM/YYYY', 'DD-MM-YYYY', 'DD MMM YYYY', 'dddd, DD MMM YYYY', 'DD', 'MM', 'MMMM', 'MMM', 'YYYY', 'YY'], 
    cal_hijri: ['DD MMMM YYYY (H)', 'DD/MM/YYYY (H)', 'dddd, DD MMMM YYYY (H)', 'DD (H)', 'MMMM (H)', 'YYYY (H)'], 
    iqomah: ['HH:mm:ss', 'mm:ss'] 
};

function initFonts() { const fontSelect = document.getElementById('propFont'); if(!fontSelect) return; fontSelect.innerHTML = ''; if (typeof PixelFonts !== 'undefined') { for (let key in PixelFonts) { let opt = document.createElement('option'); opt.value = key; opt.innerText = PixelFonts[key].name; fontSelect.appendChild(opt); } } }
function updateProjectRes() { PROJECT_W = parseInt(document.getElementById('globalW').value) || 64; PROJECT_H = parseInt(document.getElementById('globalH').value) || 32; resizeCanvas(); renderTree(); }
function isNameUnique(name) { let found = false; function checkList(list) { for(let o of list) { if(o.name === name) found = true; if(o.type === 'group' && o.children) checkList(o.children); } } screens.forEach(s => checkList(s.objects)); return !found; }
function getUniqueName(base) { let count = 1; let shortBase = base.substring(0, 7); let n = `${shortBase}_${count}`; while (!isNameUnique(n) && count < 100) { count++; n = `${shortBase}_${count}`; } return n.substring(0, 10); }
function parseDuration(str) { if(!str) return 10000; let pts = str.split(':'); if(pts.length === 3) return (parseInt(pts[0], 10)*3600 + parseInt(pts[1], 10)*60 + parseInt(pts[2], 10)) * 1000; return 10000; }

class PixelObject {
    constructor(name, type, gridX, gridY) {
        this.name = name; this.type = type; this.x = gridX; this.y = gridY; 
        this.visibleCanvas = true; this.visibleLed = true;
        this.w = ['drawing', 'image', 'sholat', 'sholat_name', 'iqomah', 'auto_sholat'].includes(type) ? 25 : (type === 'line' ? 32 : 32); 
        this.h = ['drawing', 'image', 'sholat', 'sholat_name', 'iqomah', 'auto_sholat'].includes(type) ? 10 : (type === 'line' ? 1 : 10);  
        this.text = ['drawing', 'image', 'sholat', 'sholat_name', 'iqomah', 'group', 'line', 'auto_sholat'].includes(type) ? "" : "TEXT"; 
        this.format = ""; this.editable = false; this.title = name;
        this.font = lastUsedFont || ((typeof PixelFonts !== 'undefined' && Object.keys(PixelFonts).length > 0) ? Object.keys(PixelFonts)[0] : "monospace"); 
        
        this.color = "#ffffff"; this.colorTime = "#ff0000"; this.colorNone = false; this.fColor = "#00ff00"; this.fColorNone = true; this.bgColor = "#000000"; this.bgColorNone = true;
        this.lineDir = 'h'; this.lineThick = 1; this.lineLength = 32; this.lineColor = "#8e44ad";
        this.radius = 0; this.alignH = 'center'; this.alignV = 'middle'; 
        this.anim = 'none'; this.speed = 1.0; this.animDelay = 0; this.animStopX = 5;
        this.anim2 = 'none'; this.speed2 = 1.0; this.animDelay2 = 0; this.anim2StopX = 5;
        this.isAnimPlaying = false; this.animState = 1; this._nextStepX1 = 0; this._nextStepX2 = 0; this.delayTimer = 0; this.blinkTimer = 0; this.currentOffsetX = 0; this.currentOffsetY = 0;
        this.onShowAction = ""; this.onShowTarget = ""; this.onDoneAction = ""; this.onDoneTarget = ""; this.hasFiredOnShow = false;
        
        this.sholatType = 'Subuh'; this.iqomahTime = 5; this.iqomahUnit = 'menit'; this.iqomahOffset = 0; this.iqomahAnimTriggerSec = 3; this.iqomahTriggerUnit = 'detik'; this.iqomahTimer = 0; this._iqomahAnimTriggered = false; this._iqomahDone = false;
        
        this.autoList = ['Imsak', 'Terbit', 'Dhuha', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya']; this.autoCount = 2; this.autoPos = 'left'; this.autoGapItems = 5; this.autoGapNameTime = 2; this.autoDir = 'h'; this.fontTime = this.font; this._autoIndex = 0;
        this.autoGaps = {}; 

        this.pixels = []; this.customPixels = []; this.children = []; this.textWidth = 0; this.textHeight = 7; 
        if (type !== 'group' && type !== 'line') this.updateContent();
    }

    getContentW() { return ['text', 'clock', 'cal_masehi', 'cal_hijri', 'sholat', 'sholat_name', 'iqomah', 'auto_sholat'].includes(this.type) ? (this.textWidth || this.w) : this.w; }
    getContentH() { return ['text', 'clock', 'cal_masehi', 'cal_hijri', 'sholat', 'sholat_name', 'iqomah', 'auto_sholat'].includes(this.type) ? (this.textHeight || this.h) : this.h; }

    resetAnimation() {
        if (this.type === 'auto_sholat') this._autoIndex = 0;
        if (this.type === 'iqomah' && isSimulating && !this._iqomahDone) { this.animState = (this.anim !== 'none') ? 1 : 2; } 
        else { this.animState = (this.anim !== 'none') ? 1 : ((this.anim2 !== 'none') ? 3 : 0); }
        this.delayTimer = 0; this.blinkTimer = 0; this.hasFiredOnShow = false;
        let aStart = this.animState === 1 ? this.anim : (this.animState === 3 ? this.anim2 : 'none');
        this._setupAnimStart(aStart, this.animState === 3);
        if (this.children) this.children.forEach(c => c.resetAnimation());
    }

    _setupAnimStart(type, isAnim2 = false) {
        let align = this.calcAlign();
        if(type === 'slide-left' || type === 'slide-left-stop') { this.currentOffsetX = this.w - align.aX; this.currentOffsetY = 0; }
        else if(type === 'slide-right' || type === 'slide-right-stop') { this.currentOffsetX = -(this.getContentW() + align.aX); this.currentOffsetY = 0; }
        else if(type.includes('stop-current')) {
            let stopVal = isAnim2 ? this.anim2StopX : this.animStopX; let stepDist = Math.max(1, Math.abs(stopVal || 0)); if (stopVal == 0) stepDist = 9999;
            if (isAnim2) this._nextStepX2 = this.currentOffsetX + (type.includes('left') ? -stepDist : stepDist);
            else this._nextStepX1 = this.currentOffsetX + (type.includes('left') ? -stepDist : stepDist);
        }
        else if(type === 'slide-up') { this.currentOffsetX = 0; this.currentOffsetY = this.h; }
        else if(type === 'slide-down') { this.currentOffsetX = 0; this.currentOffsetY = 0; }
        else if(type === 'scroll-up') { this.currentOffsetX = 0; this.currentOffsetY = this.h; this._phase = 0; }
        else if(type === 'scroll-down') { this.currentOffsetX = 0; this.currentOffsetY = -(this.getContentH() + align.aY); this._phase = 0; }
        else { this.currentOffsetX = 0; this.currentOffsetY = 0; } 
        this.blinkTimer = 0;
    }

    _stepAnimation(type, speed, isAnim2 = false) {
        let dtRatio = window.deltaTime / 16.6; 
        if (type === 'blink') { this.blinkTimer += window.deltaTime; if (this.blinkTimer >= 1000/speed) { this.blinkTimer = 0; return true; } return false; }
        let step = 0.5 * speed * dtRatio; 
        
        if(type === 'slide-left') { this.currentOffsetX -= step; let endX = -(this.getContentW() + this.calcAlign().aX); if(this.currentOffsetX <= endX) { this.currentOffsetX = endX; return true; } return false; } 
        else if(type === 'slide-left-stop') { this.currentOffsetX -= step; if(this.currentOffsetX <= 0) { this.currentOffsetX = 0; return true; } return false; } 
        else if(type === 'slide-left-stop-current') {
            let stopVal = isAnim2 ? this.anim2StopX : this.animStopX; let stepDist = Math.max(1, Math.abs(stopVal || 0)); if(stopVal == 0) stepDist = 9999;
            this.currentOffsetX -= step; let targetX = isAnim2 ? this._nextStepX2 : this._nextStepX1; let endX = -(this.getContentW() + this.calcAlign().aX);
            if (this.currentOffsetX <= endX) { this.currentOffsetX = endX; return true; }
            if (this.currentOffsetX <= targetX) { this.currentOffsetX = targetX; if (isAnim2) this._nextStepX2 -= stepDist; else this._nextStepX1 -= stepDist; return 'pause'; } return false;
        } 
        else if(type === 'slide-right') { this.currentOffsetX += step; if(this.currentOffsetX >= this.w) { this.currentOffsetX = this.w; return true; } return false; } 
        else if(type === 'slide-right-stop') { this.currentOffsetX += step; if(this.currentOffsetX >= 0) { this.currentOffsetX = 0; return true; } return false; } 
        else if(type === 'slide-right-stop-current') {
            let stopVal = isAnim2 ? this.anim2StopX : this.animStopX; let stepDist = Math.max(1, Math.abs(stopVal || 0)); if(stopVal == 0) stepDist = 9999;
            this.currentOffsetX += step; let targetX = isAnim2 ? this._nextStepX2 : this._nextStepX1;
            if (this.currentOffsetX >= this.w) { this.currentOffsetX = this.w; return true; }
            if (this.currentOffsetX >= targetX) { this.currentOffsetX = targetX; if (isAnim2) this._nextStepX2 += stepDist; else this._nextStepX1 += stepDist; return 'pause'; } return false;
        } 
        else if(type === 'slide-up') { this.currentOffsetY -= step; if(this.currentOffsetY <= 0) { this.currentOffsetY = 0; return true; } return false; } 
        else if(type === 'slide-down') { this.currentOffsetY += step; if(this.currentOffsetY >= this.h) { this.currentOffsetY = this.h; return true; } return false; } 
        else if(type === 'scroll-up') {
            if (this._phase === 0) {
                this.currentOffsetY -= step;
                if (this.currentOffsetY <= 0) { this.currentOffsetY = 0; this._phase = 1; return 'pause'; }
                return false;
            } else {
                this.currentOffsetY -= step;
                if (this.currentOffsetY <= -(this.getContentH() + this.calcAlign().aY)) { return true; }
                return false;
            }
        }
        else if(type === 'scroll-down') {
            if (this._phase === 0) {
                this.currentOffsetY += step;
                if (this.currentOffsetY >= 0) { this.currentOffsetY = 0; this._phase = 1; return 'pause'; }
                return false;
            } else {
                this.currentOffsetY += step;
                if (this.currentOffsetY >= this.h) { return true; }
                return false;
            }
        }
        return true; 
    }

    getDisplayString() {
        if (['drawing', 'image', 'group', 'line', 'auto_sholat'].includes(this.type)) return "";
        if (this.type === 'sholat') return window.currentPrayerTimes ? (window.currentPrayerTimes[this.sholatType] || '00:00') : '00:00'; 
        if (this.type === 'sholat_name') return window.activePrayerName || 'SUBUH';
        
        if (this.type === 'iqomah') { 
            let totalSecs = isSimulating ? Math.ceil(this.iqomahTimer) : ((this.iqomahUnit === 'menit' ? this.iqomahTime * 60 : this.iqomahTime) - this.iqomahOffset); 
            if (totalSecs < 0) totalSecs = 0; 
            let h = Math.floor(totalSecs / 3600).toString().padStart(2, '0'), m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0'), s = Math.floor(totalSecs % 60).toString().padStart(2, '0'); 
            return this.format === 'HH:mm:ss' ? `${h}:${m}:${s}` : `${m}:${s}`; 
        }
        
        const now = isClockSimulated ? new Date(simulatedTimeMs) : new Date(); 
        const d = String(now.getDate()).padStart(2,'0'), 
              mNum = String(now.getMonth()+1).padStart(2,'0'), 
              y2 = String(now.getFullYear()).slice(-2), 
              y4 = now.getFullYear(), 
              mShort = now.toLocaleDateString('id-ID', {month:'short'}).toUpperCase(), 
              mLong = now.toLocaleDateString('id-ID', {month:'long'}).toUpperCase(); 
        let dayName = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"][now.getDay()];

        if (this.type === 'clock') { 
            const h = String(now.getHours()).padStart(2,'0'), 
                  m = String(now.getMinutes()).padStart(2,'0'), 
                  s = String(now.getSeconds()).padStart(2,'0'); 
            if(this.format === 'HH:mm') return `${h}:${m}`; 
            if(this.format === 'hh:mm A') return now.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}); 
            if(this.format === 'HH') return h;
            if(this.format === 'mm') return m;
            if(this.format === 'ss') return s;
            if(this.format === 'dddd, DD-MM-YY') return `${dayName}, ${d}-${mNum}-${y2}`; 
            return `${h}:${m}:${s}`; 
        }
        
        if (this.type === 'cal_masehi') { 
            if(this.format === 'DD-MM-YYYY') return `${d}-${mNum}-${y4}`; 
            if(this.format === 'DD MMM YYYY') return `${d} ${mShort} ${y4}`; 
            if(this.format === 'dddd, DD MMM YYYY') return `${dayName}, ${d} ${mShort} ${y4}`; 
            if(this.format === 'DD') return d;
            if(this.format === 'MM') return mNum;
            if(this.format === 'MMMM') return mLong;
            if(this.format === 'MMM') return mShort;
            if(this.format === 'YYYY') return String(y4);
            if(this.format === 'YY') return y2;
            return `${d}/${mNum}/${y4}`; 
        }
        
        if (this.type === 'cal_hijri') { 
            const formatter = new Intl.DateTimeFormat('id-u-ca-islamic', { day: '2-digit', month: 'long', year: 'numeric' });
            const parts = formatter.formatToParts(now);
            let hDay = parts.find(p => p.type === 'day')?.value || '01';
            let hMonth = parts.find(p => p.type === 'month')?.value || 'Muharram';
            let hYear = parts.find(p => p.type === 'year')?.value || '1445';
            let hMonthNum = new Intl.DateTimeFormat('id-u-ca-islamic', { month: '2-digit' }).format(now);
            
            if (this.format === 'DD MMMM YYYY (H)') return `${hDay} ${hMonth} ${hYear}`;
            if (this.format === 'DD/MM/YYYY (H)') return `${hDay}/${hMonthNum}/${hYear}`;
            if (this.format === 'dddd, DD MMMM YYYY (H)') return `${dayName}, ${hDay} ${hMonth} ${hYear}`;
            if (this.format === 'DD (H)') return hDay;
            if (this.format === 'MMMM (H)') return hMonth.toUpperCase();
            if (this.format === 'YYYY (H)') return hYear;
            return `${hDay} ${hMonth} ${hYear}`;
        }
        
        return this.text;
    }

    generateTextPixels(str, fontName) {
        let pixels = []; let textWidth = 0; let textHeight = 7; let fontDef = (typeof PixelFonts !== 'undefined') ? PixelFonts[fontName] : null;
        if (fontDef) {
            let xOff = 0; let height = fontDef.height; let heightBytes = Math.ceil(height / 8); let firstChar = fontDef.firstChar || 32; let order = fontDef.order || "horiz_page"; 
            for (let char of str) {
                if (char === ' ') { let nIdx = 'n'.charCodeAt(0) - firstChar; let sw = (fontDef.widths && fontDef.widths[nIdx]) ? fontDef.widths[nIdx] : (fontDef.width || 4); xOff += (sw === 0 ? 4 : sw) + (fontDef.space || 1); continue; }
                const index = char.charCodeAt(0) - firstChar; if (index < 0 || (fontDef.widths && index >= fontDef.widths.length)) continue;
                let charWidth = fontDef.widths ? (fontDef.widths[index] || 0) : fontDef.width; let charDataStart = 0;
                if (fontDef.widths) { for (let i = 0; i < index; i++) charDataStart += (fontDef.widths[i] || 0) * heightBytes; } else { charDataStart = index * heightBytes * charWidth; }
                for (let cx = 0; cx < charWidth; cx++) {
                    for (let cy = 0; cy < heightBytes; cy++) {
                        let dataIndex = (order === "horiz_page") ? charDataStart + (cy * charWidth) + cx : charDataStart + (cx * heightBytes) + cy; let value = fontDef.data[dataIndex] || 0;
                        let posn = cy * 8; if (heightBytes > 1 && cy === (heightBytes - 1)) posn = height - 8;
                        for (let bit = 0; bit < 8; bit++) { let targetY = posn + bit; let isValidY = (height <= 8) ? (targetY < 8) : (targetY >= cy * 8 && targetY < height); if (isValidY && ((value >> bit) & 0x01)) pixels.push({ x: cx + xOff, y: targetY }); }
                    }
                } xOff += charWidth + (fontDef.space || 1);
            } textWidth = Math.max(0, xOff - (fontDef.space || 1)); textHeight = height;
        } else {
            offCanvas.width = Math.max(1, str.length * 10); offCanvas.height = 14; offCtx.clearRect(0,0,offCanvas.width,offCanvas.height); offCtx.fillStyle="black"; offCtx.font="bold 10px monospace"; offCtx.textBaseline="top"; offCtx.fillText(str,0,0);
            const data = offCtx.getImageData(0,0,offCanvas.width,offCanvas.height); let maxW = 0;
            for (let y=0;y<offCanvas.height;y++) { for (let x=0;x<offCanvas.width;x++) { if (data.data[(y*offCanvas.width+x)*4+3]>128) { pixels.push({x:x,y:y}); if(x>maxW) maxW=x; } } } textWidth = maxW+1; textHeight = 10;
        } return { pixels, w: textWidth, h: textHeight };
    }
    
    updateContent() {
        if (this.type === 'group' || this.type === 'line') return; 
        if (this.type === 'drawing' || this.type === 'image') { this.pixels = this.customPixels.map(p => ({ x: p.x, y: p.y, c: p.c })); this.textWidth = this.w; this.textHeight = this.h;
        } else if (this.type === 'auto_sholat') {
            this.pixels = []; 
            let batch = this.autoList.slice(this._autoIndex, this._autoIndex + this.autoCount);
            
            if (batch.length < this.autoCount && this.autoList.length >= this.autoCount) {
                let diff = this.autoCount - batch.length;
                batch = this.autoList.slice(this._autoIndex - diff, this._autoIndex + batch.length);
            } else if (batch.length === 0 && this.autoList.length > 0) { 
                this._autoIndex = 0; batch = this.autoList.slice(0, this.autoCount); 
            }

            let currentX = 0; let currentY = 0; let totalW = 0; let totalH = 0; let dhuhaDummy = '06:10'; 
            batch.forEach((prayer) => {
                let nameText = prayer.toUpperCase(); let timeText = window.currentPrayerTimes ? (window.currentPrayerTimes[prayer] || window.currentPrayerTimes[prayer.toLowerCase()]) : null;
                if(!timeText && prayer === 'Dhuha') timeText = dhuhaDummy; if(!timeText) timeText = '00:00';
                let nameData = this.generateTextPixels(nameText, this.font); let timeData = this.generateTextPixels(timeText, this.fontTime);
                let itemW = 0, itemH = 0, nOx = 0, nOy = 0, tOx = 0, tOy = 0;
                
                let gapVal = this.autoGaps[prayer] !== undefined ? this.autoGaps[prayer] : 'auto';
                let calculatedGap = this.autoGapNameTime; 
                if (gapVal === 'auto' || gapVal === '') {
                    if (this.autoPos === 'left' || this.autoPos === 'right') {
                        let maxW = (this.autoDir === 'h') ? Math.floor((this.w - (this.autoGapItems * (this.autoCount-1))) / this.autoCount) : this.w;
                        calculatedGap = Math.max(0, maxW - nameData.w - timeData.w);
                    } else {
                        let maxH = (this.autoDir === 'v') ? Math.floor((this.h - (this.autoGapItems * (this.autoCount-1))) / this.autoCount) : this.h;
                        calculatedGap = Math.max(0, maxH - nameData.h - timeData.h);
                    }
                } else { calculatedGap = parseInt(gapVal) || 0; }

                if (this.autoPos === 'left') { nOx=0; nOy=Math.max(0,Math.floor((timeData.h-nameData.h)/2)); tOx=nameData.w+calculatedGap; tOy=Math.max(0,Math.floor((nameData.h-timeData.h)/2)); itemW=nameData.w+calculatedGap+timeData.w; itemH=Math.max(nameData.h,timeData.h); } 
                else if (this.autoPos === 'right') { tOx=0; tOy=Math.max(0,Math.floor((nameData.h-timeData.h)/2)); nOx=timeData.w+calculatedGap; nOy=Math.max(0,Math.floor((timeData.h-nameData.h)/2)); itemW=timeData.w+calculatedGap+nameData.w; itemH=Math.max(nameData.h,timeData.h); } 
                else if (this.autoPos === 'top') { let cW=Math.max(nameData.w,timeData.w); nOx=Math.floor((cW-nameData.w)/2); nOy=0; tOx=Math.floor((cW-timeData.w)/2); tOy=nameData.h+calculatedGap; itemW=cW; itemH=nameData.h+calculatedGap+timeData.h; } 
                else { let cW=Math.max(nameData.w,timeData.w); tOx=Math.floor((cW-timeData.w)/2); tOy=0; nOx=Math.floor((cW-nameData.w)/2); nOy=timeData.h+calculatedGap; itemW=cW; itemH=timeData.h+calculatedGap+nameData.h; }
                
                nameData.pixels.forEach(p => this.pixels.push({ x: currentX + nOx + p.x, y: currentY + nOy + p.y, c: this.color }));
                timeData.pixels.forEach(p => this.pixels.push({ x: currentX + tOx + p.x, y: currentY + tOy + p.y, c: this.colorTime }));
                
                if (this.autoDir === 'h') { currentX += itemW + this.autoGapItems; totalW = currentX - this.autoGapItems; totalH = Math.max(totalH, itemH); } else { currentY += itemH + this.autoGapItems; totalH = currentY - this.autoGapItems; totalW = Math.max(totalW, itemW); }
            }); this.textWidth = totalW; this.textHeight = totalH;
        } else { const str = this.getDisplayString(); let res = this.generateTextPixels(str, this.font); this.pixels = res.pixels.map(p => ({...p, c: this.color})); this.textWidth = res.w; this.textHeight = res.h; }
    }
    calcAlign() { if (['drawing','image','group','line'].includes(this.type)) return { aX: 0, aY: 0 }; let aX = 0; if(this.alignH === 'center') aX = Math.floor((this.w - this.textWidth) / 2); if(this.alignH === 'right') aX = this.w - this.textWidth; let aY = 0; if(this.alignV === 'middle') aY = Math.floor((this.h - this.textHeight) / 2); if(this.alignV === 'bottom') aY = this.h - this.textHeight; return { aX, aY }; }

    draw() {
        if (isSimulating) { if (!this.visibleLed || !this.visibleCanvas) return; } else { if (!this.visibleCanvas) return; }
        if (isSimulating && this.type === 'iqomah') { if (this.iqomahTimer > 0) { this.iqomahTimer -= window.deltaTime / 1000; let th = this.iqomahTriggerUnit === 'menit' ? this.iqomahAnimTriggerSec * 60 : this.iqomahAnimTriggerSec; if (this.iqomahTimer <= th && this.iqomahTimer > 0 && !this._iqomahAnimTriggered) { this._iqomahAnimTriggered = true; this.isAnimPlaying = true; this.resetAnimation(); } if (this.iqomahTimer <= 0) { this.iqomahTimer = 0; if (!this._iqomahDone) { this._iqomahDone = true; if (this.anim2 !== 'none') { this.animState = 3; this._setupAnimStart(this.anim2, true); this.isAnimPlaying = true; } else { this.isAnimPlaying = false; this.animState = 0; triggerEvent(this.onDoneAction, this.onDoneTarget); if (isSimulating) { let currentScr = screens[activeScreenIdx]; if (currentScr && currentScr.durationMode === 'anim' && currentScr.durationAnimObj === this.name) simTimer = 0; } } } } } }
        const rX = this.x * GRID_SIZE, rY = this.y * GRID_SIZE, dW = this.w * GRID_SIZE, dH = this.h * GRID_SIZE, rPx = this.radius * Math.min(GRID_SIZE/2, 4);
        ctx.save(); ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(rX, rY, dW, dH, rPx); else ctx.rect(rX, rY, dW, dH); ctx.clip(); 
        let isBlinking = false; if(this.isAnimPlaying && ((this.animState === 1 && this.anim === 'blink') || (this.animState === 3 && this.anim2 === 'blink'))) { let bSpeed = (this.animState === 1) ? this.speed : this.speed2; ctx.globalAlpha = (this.blinkTimer < (1000/bSpeed)/2) ? 0 : 1; } else { ctx.globalAlpha = 1; }

        if (this.isAnimPlaying) {
            if (!this.hasFiredOnShow) { this.hasFiredOnShow = true; triggerEvent(this.onShowAction, this.onShowTarget); }
            if (this.animState === 1) { let res = this._stepAnimation(this.anim, this.speed, false); if (res === 'pause') { this.animState = 1.5; this.delayTimer = this.animDelay * 1000; } else if (res === true) { this.animState = 2; this.delayTimer = this.animDelay * 1000; } } 
            else if (this.animState === 1.5) { this.delayTimer -= window.deltaTime; if (this.delayTimer <= 0) this.animState = 1; } 
            else if (this.animState === 2) { this.delayTimer -= window.deltaTime; if (this.delayTimer <= 0) {
                if (this.type === 'iqomah' && !this._iqomahDone) { if (!this.anim.includes('stop') && this.anim !== 'none') { this.animState = 1; this._setupAnimStart(this.anim, false); } else { this.delayTimer = 100; } } else {
                    if (this.anim2 !== 'none') { this.animState = 3; this._setupAnimStart(this.anim2, true); } else { 
                        if (this.type === 'auto_sholat') { this._autoIndex += this.autoCount; if (this._autoIndex < this.autoList.length) { this.updateContent(); this.animState = 1; this._setupAnimStart(this.anim, false); ctx.restore(); return; } else { this._autoIndex = 0; } }
                        triggerEvent(this.onDoneAction, this.onDoneTarget); if (isSimulating) { let scr = screens[activeScreenIdx]; if (scr && scr.durationMode === 'anim' && scr.durationAnimObj === this.name) simTimer = 0; }
                        if (this.anim.includes('stop')) { this.isAnimPlaying = false; } else { this.animState = 1; this._setupAnimStart(this.anim, false); }
                    } } } } 
            else if (this.animState === 3) { let res = this._stepAnimation(this.anim2, this.speed2, true); if (res === 'pause') { this.animState = 3.5; this.delayTimer = this.animDelay2 * 1000; } else if (res === true) { this.animState = 4; this.delayTimer = this.animDelay2 * 1000; } } 
            else if (this.animState === 3.5) { this.delayTimer -= window.deltaTime; if (this.delayTimer <= 0) this.animState = 3; } 
            else if (this.animState === 4) { this.delayTimer -= window.deltaTime; if (this.delayTimer <= 0) {
                if (this.type === 'auto_sholat') { this._autoIndex += this.autoCount; if (this._autoIndex < this.autoList.length) { this.updateContent(); this.animState = 1; this._setupAnimStart(this.anim, false); ctx.restore(); return; } else { this._autoIndex = 0; } }
                triggerEvent(this.onDoneAction, this.onDoneTarget); if (isSimulating) { let scr = screens[activeScreenIdx]; if (scr && scr.durationMode === 'anim' && scr.durationAnimObj === this.name) simTimer = 0; }
                if (this.anim2.includes('stop')) { this.isAnimPlaying = false; } else { if (this.anim !== 'none') { this.animState = 1; this._setupAnimStart(this.anim, false); } else { this.animState = 3; this._setupAnimStart(this.anim2, true); } }
            } }
        } else if (!isSimulating && !this.anim.includes('stop') && !this.anim2.includes('stop')) { this.currentOffsetX = 0; this.currentOffsetY = 0; }

        if (this.type === 'group') {
            let sX = this.currentOffsetX * GRID_SIZE, sY = this.currentOffsetY * GRID_SIZE;
            if (!this.bgColorNone && ctx.globalAlpha !== 0) { ctx.fillStyle = this.bgColor; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(rX+sX, rY+sY, dW, dH, rPx); else ctx.rect(rX+sX, rY+sY, dW, dH); ctx.fill(); }
            if (!this.fColorNone && ctx.globalAlpha !== 0) { ctx.fillStyle = this.fColor; ctx.fillRect(rX+sX, rY+sY, dW, GRID_SIZE); ctx.fillRect(rX+sX, rY+sY+dH-GRID_SIZE, dW, GRID_SIZE); ctx.fillRect(rX+sX, rY+sY, GRID_SIZE, dH); ctx.fillRect(rX+sX+dW-GRID_SIZE, rY+sY, GRID_SIZE, dH); }
            ctx.translate(sX, sY); 
            // PERBAIKAN: Jangan tambahkan posisi parent. Koordinat anak murni absolut.
            this.children.forEach(c => { 
                c.draw(); 
            }); 
            ctx.translate(-sX, -sY);
        } else if (this.type === 'line') { if (ctx.globalAlpha !== 0) { ctx.fillStyle = this.lineColor; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(rX, rY, dW, dH, rPx); else ctx.rect(rX, rY, dW, dH); ctx.fill(); } } 
        else {
            this.updateContent(); let align = this.calcAlign();
            if (!this.bgColorNone && ctx.globalAlpha !== 0) { ctx.fillStyle = this.bgColor; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(rX, rY, dW, dH, rPx); else ctx.rect(rX, rY, dW, dH); ctx.fill(); }
            if (!this.fColorNone && ctx.globalAlpha !== 0) { ctx.fillStyle = this.fColor; ctx.fillRect(rX, rY, dW, GRID_SIZE); ctx.fillRect(rX, rY+dH-GRID_SIZE, dW, GRID_SIZE); ctx.fillRect(rX, rY, GRID_SIZE, dH); ctx.fillRect(rX+dW-GRID_SIZE, rY, GRID_SIZE, dH); }
            if (ctx.globalAlpha !== 0 && !this.colorNone) { this.pixels.forEach(p => { let dx = p.x + align.aX + this.currentOffsetX; let dy = p.y + align.aY + this.currentOffsetY; ctx.fillStyle = p.c ? p.c : this.color; ctx.fillRect(rX + (dx * GRID_SIZE), rY + (dy * GRID_SIZE), GRID_SIZE - 1, GRID_SIZE - 1); }); }
        } ctx.restore(); 

        if (!isSimulating && selectedObjs.includes(this)) { ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = (this.type === 'line' || this.type === 'group') ? "#e67e22" : "#2ecc71"; ctx.lineWidth = 2; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(rX, rY, dW, dH, rPx); else ctx.rect(rX, rY, dW, dH); ctx.stroke();
            if (mode === 'select' && selectedObjs.length === 1) { const hs = 10; ctx.fillStyle = "#e74c3c"; ctx.fillRect(rX+dW/2-hs/2, rY-hs/2, hs, hs); ctx.fillRect(rX+dW/2-hs/2, rY+dH-hs/2, hs, hs); ctx.fillRect(rX-hs/2, rY+dH/2-hs/2, hs, hs); ctx.fillRect(rX+dW-hs/2, rY+dH/2-hs/2, hs, hs); } ctx.restore(); }
    }
}

function restoreObject(oData) { 
    let n = new PixelObject(oData.id || oData.name, oData.type, oData.frameX ?? oData.x, oData.frameY ?? oData.y); 
    n.visibleCanvas = (oData.visible_canvas !== false && oData.visible !== false); n.visibleLed = oData.visible_led !== false; n.isAnimPlaying = false; n._iqomahDone = false;
    n.editable = oData.editable || false; n.title = (oData.title !== undefined) ? oData.title : (oData.name || ""); n.w = oData.w; n.h = oData.h; n.text = oData.text || ""; n.font = oData.font || "monospace"; n.format = oData.format || "";
    n.colorNone = oData.color === "transparent" || oData.colorNone === true; n.color = n.colorNone ? "#ffffff" : (oData.color || "#ffffff"); n.colorTime = oData.colorTime || oData.color || "#ff0000"; n.bgColorNone = oData.bgColor === "transparent" || oData.bgColorNone === true; n.bgColor = n.bgColorNone ? "#000000" : (oData.bgColor || "#000000"); n.fColorNone = oData.frameColor === "transparent" || oData.fColor === "transparent" || oData.fColorNone === true; n.fColor = n.fColorNone ? "#00ff00" : (oData.frameColor || oData.fColor || "#00ff00");
    if (oData.anim1) { n.anim = oData.anim1.type; n.speed = oData.anim1.speed; n.animDelay = oData.anim1.delay; n.animStopX = oData.anim1.stopX || 5; } else { n.anim = oData.anim || 'none'; n.speed = oData.speed || 1; n.animDelay = oData.animDelay || 0; n.animStopX = oData.animStopX || 5; }
    if (oData.anim2) { n.anim2 = oData.anim2.type; n.speed2 = oData.anim2.speed; n.animDelay2 = oData.anim2.delay || 0; n.anim2StopX = oData.anim2.stopX || 5; } else { n.anim2 = oData.anim2 || 'none'; n.speed2 = oData.speed2 || 1; n.animDelay2 = oData.animDelay2 || 0; n.anim2StopX = oData.anim2StopX || 5; }
    n.radius = oData.radius || 0;
    if (oData.onShowEvent) { n.onShowAction = oData.onShowEvent.action; n.onShowTarget = oData.onShowEvent.target; }
    if (oData.onDoneEvent) { n.onDoneAction = oData.onDoneEvent.action; n.onDoneTarget = oData.onDoneEvent.target; } else if (oData.nextEvent) { n.onDoneAction = oData.nextEvent.action; n.onDoneTarget = oData.nextEvent.target; }
    if (n.type === 'sholat') n.sholatType = oData.sholatType || 'Subuh';
    if (n.type === 'auto_sholat') { n.autoList = oData.autoList || ['Imsak', 'Subuh', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya']; n.autoCount = oData.autoCount || 2; n.autoPos = oData.autoPos || 'left'; n.autoDir = oData.autoDir || 'h'; n.autoGapItems = oData.autoGapItems !== undefined ? oData.autoGapItems : 5; n.autoGapNameTime = oData.autoGapNameTime !== undefined ? oData.autoGapNameTime : 2; n.autoGaps = oData.autoGaps || {}; n.fontTime = oData.fontTime || n.font; n._autoIndex = 0; }
    if (n.type === 'iqomah') { n.iqomahTime = oData.iqomahTime !== undefined ? oData.iqomahTime : 5; n.iqomahUnit = oData.iqomahUnit || 'menit'; n.iqomahOffset = oData.iqomahOffset || 0; n.iqomahAnimTriggerSec = oData.iqomahAnimTriggerSec !== undefined ? oData.iqomahAnimTriggerSec : 3; n.iqomahTriggerUnit = oData.iqomahTriggerUnit || 'detik'; n._iqomahAnimTriggered = false; n.iqomahTimer = 0; }
    if (n.type === 'line') { n.lineDir = oData.lineDir || 'h'; n.lineThick = oData.lineThick || 1; n.lineLength = oData.lineLength || 32; n.lineColor = oData.lineColor || '#8e44ad'; }
    if (n.type === 'drawing' || n.type === 'image') n.customPixels = oData.customPixels || oData.pixels || [];
    if (n.type === 'group' && oData.children) n.children = oData.children.map(c => restoreObject(c));
    n.resetAnimation(); if(n.type !== 'group' && n.type !== 'line') n.updateContent(); return n; 
}

function serializeObj(o) {
    let align = o.calcAlign();
    let objData = { id: o.name, type: o.type, visible_canvas: o.visibleCanvas, visible_led: o.visibleLed, frameX: o.x, frameY: o.y, w: o.w, h: o.h, contentX: o.x + align.aX, contentY: o.y + align.aY, text: (o.type === 'text' && o.editable) ? o.title : o.text, editable: o.editable, title: o.title, font: o.font, format: o.format, color: o.colorNone ? "transparent" : o.color, colorTime: o.colorTime, bgColor: o.bgColorNone ? "transparent" : o.bgColor, frameColor: o.fColorNone ? "transparent" : o.fColor, anim1: { type: o.anim, speed: o.speed, delay: o.animDelay, stopX: o.animStopX }, anim2: { type: o.anim2, speed: o.speed2, delay: o.animDelay2, stopX: o.anim2StopX }, radius: o.radius, onShowEvent: { action: o.onShowAction, target: o.onShowTarget }, onDoneEvent: { action: o.onDoneAction, target: o.onDoneTarget } };
    if (o.type === 'line') { objData.lineDir = o.lineDir; objData.lineThick = o.lineThick; objData.lineLength = o.lineLength; objData.lineColor = o.lineColor; objData.x1 = o.x; objData.y1 = o.y; objData.x2 = o.lineDir === 'h' ? o.x + o.lineLength - 1 : o.x; objData.y2 = o.lineDir === 'v' ? o.y + o.lineLength - 1 : o.y; }
    if (o.type === 'iqomah') { objData.iqomahTime = o.iqomahTime; objData.iqomahUnit = o.iqomahUnit; objData.iqomahOffset = o.iqomahOffset; objData.iqomahAnimTriggerSec = o.iqomahAnimTriggerSec; objData.iqomahTriggerUnit = o.iqomahTriggerUnit; }
    if (o.type === 'auto_sholat') { objData.autoList = o.autoList; objData.autoCount = o.autoCount; objData.autoPos = o.autoPos; objData.autoDir = o.autoDir; objData.autoGapItems = o.autoGapItems; objData.autoGapNameTime = o.autoGapNameTime; objData.autoGaps = o.autoGaps; objData.fontTime = o.fontTime; }
    if (o.type === 'drawing' || o.type === 'image') { objData.image_file = o.name + ".gif"; } if (o.type === 'sholat') { objData.sholatType = o.sholatType; } if (o.type === 'group') objData.children = o.children.map(c => serializeObj(c));
    return objData;
}

function saveState() { if(isSimulating) return; let state = { w: PROJECT_W, h: PROJECT_H, activeScreenIdx: activeScreenIdx, triggers: JSON.parse(JSON.stringify(globalTriggers)), screens: screens.map(scr => ({ id: scr.id, type: scr.type, visibleCanvas: scr.visibleCanvas, visibleLed: scr.visibleLed, durationMode: scr.durationMode, durationFixed: scr.durationFixed, durationAnimObj: scr.durationAnimObj, nextAction: scr.nextAction, nextTarget: scr.nextTarget, objects: scr.objects.map(serializeObj) })) }; undoStack.push(state); if (undoStack.length > 30) undoStack.shift(); redoStack = []; }
function undo() { if (undoStack.length > 0 && !isSimulating) { let state = { w: PROJECT_W, h: PROJECT_H, activeScreenIdx: activeScreenIdx, triggers: JSON.parse(JSON.stringify(globalTriggers)), screens: screens.map(scr => ({ id: scr.id, type: scr.type, visibleCanvas: scr.visibleCanvas, visibleLed: scr.visibleLed, durationMode: scr.durationMode, durationFixed: scr.durationFixed, durationAnimObj: scr.durationAnimObj, nextAction: scr.nextAction, nextTarget: scr.nextTarget, objects: scr.objects.map(serializeObj) })) }; redoStack.push(state); restoreFromState(undoStack.pop()); } }
function redo() { if (redoStack.length > 0 && !isSimulating) { let state = { w: PROJECT_W, h: PROJECT_H, activeScreenIdx: activeScreenIdx, triggers: JSON.parse(JSON.stringify(globalTriggers)), screens: screens.map(scr => ({ id: scr.id, type: scr.type, visibleCanvas: scr.visibleCanvas, visibleLed: scr.visibleLed, durationMode: scr.durationMode, durationFixed: scr.durationFixed, durationAnimObj: scr.durationAnimObj, nextAction: scr.nextAction, nextTarget: scr.nextTarget, objects: scr.objects.map(serializeObj) })) }; undoStack.push(state); restoreFromState(redoStack.pop()); } }
function restoreFromState(s) { PROJECT_W = s.w || 64; PROJECT_H = s.h || 32; document.getElementById('globalW').value = PROJECT_W; document.getElementById('globalH').value = PROJECT_H; if (s.triggers) globalTriggers = JSON.parse(JSON.stringify(s.triggers)); screens = s.screens.map(scrData => { let scr = { id: scrData.id, type: scrData.type, visibleCanvas: scrData.visible_canvas !== false && scrData.visibleCanvas !== false, visibleLed: scrData.visible_led !== false && scrData.visibleLed !== false, objects: [], durationMode: scrData.durationMode, durationFixed: scrData.durationFixed, durationAnimObj: scrData.durationAnimObj, nextAction: scrData.nextAction, nextTarget: scrData.nextTarget }; scr.objects = scrData.objects.map(oData => restoreObject(oData)); return scr; }); activeScreenIdx = s.activeScreenIdx; objects = screens[activeScreenIdx].objects; selectedObjs = []; resizeCanvas(); syncPropPanel(); renderTree(); renderTriggerBrowser(); }
function copyObjects() { if (selectedObjs.length === 0) return; clipboardData = selectedObjs.map(o => serializeObj(o)); }
function pasteObjects() { if (clipboardData.length === 0) return; saveState(); let newSelected = []; function renameDeep(data) { let base = (data.id || data.name || "Obj").replace(/(_Copy)?(_\d+)?$/, ''); if (data.type === 'group' && !base.startsWith('Group_')) base = "Group_" + base; data.id = getUniqueName(base + "_Copy"); data.name = data.id; if (data.children) data.children.forEach(c => renameDeep(c)); } clipboardData.forEach(objData => { let dataCopy = JSON.parse(JSON.stringify(objData)); dataCopy.frameX = (dataCopy.frameX !== undefined ? dataCopy.frameX : dataCopy.x) + 2; dataCopy.frameY = (dataCopy.frameY !== undefined ? dataCopy.frameY : dataCopy.y) + 2; renameDeep(dataCopy); let newObj = restoreObject(dataCopy); objects.push(newObj); newSelected.push(newObj); }); selectedObjs = newSelected; setMode('select'); syncPropPanel(); renderTree(); }
function addPixelObject(type) { saveState(); let base = type === 'drawing' ? "Draw" : type === 'image' ? "Img" : type === 'line' ? "Line" : type === 'sholat' ? "Jadwal" : type === 'sholat_name' ? "NamaSholat" : type === 'auto_sholat' ? "AutoJadwal" : type === 'iqomah' ? "Count" : type === 'text' ? "Text" : "Layer"; let o = new PixelObject(getUniqueName(base), type, Math.max(0, Math.floor(PROJECT_W/2) - 8), Math.max(0, Math.floor(PROJECT_H/2) - 4)); if (type === 'sholat' || type === 'sholat_name' || type === 'auto_sholat') { o.updateContent(); o.w = Math.max(1, o.textWidth); o.h = Math.max(1, o.textHeight); } objects.push(o); selectedObjs = [o]; setMode('select'); syncPropPanel(); renderTree(); }
function deleteSelected(skipConfirm = false) { if(selectedObjs.length > 0) { if(!skipConfirm) { if(!confirm(`Hapus ${selectedObjs.length} objek terpilih dari Screen ini?`)) return; } saveState(); objects = objects.filter(o => !selectedObjs.includes(o)); screens[activeScreenIdx].objects = objects; selectedObjs = []; syncPropPanel(); renderTree(); } }

function exportToTXT() {
    let output = [];
    output.push("// === AUTO GENERATED LAYOUT TXT ===");

    output.push("\n// --- TRIGGERS ---");
    let prayerKeys = {
        "Imsak": "whenImsak", "Subuh": "whenSubuh", "Terbit": "whenTerbit",
        "Dzuhur": "whenDzuhur", "Ashar": "whenAshar", "Maghrib": "whenMagrib", "Isya": "whenIsya"
    };
    for (let pName in prayerKeys) {
        let jKey = prayerKeys[pName];
        if (globalTriggers[jKey] && globalTriggers[jKey].action) {
            output.push(`TRIG~${pName}~${globalTriggers[jKey].action}~${globalTriggers[jKey].target}`);
        }
    }

    screens.forEach(scr => {
        let scrId = scr.id || scr.name; 
        output.push(`\n// --- SCREEN: ${scrId} ---`);
        let vis = scr.visibleLed ? "1" : "0";
        let dMode = scr.durationMode || "fixed";
        let dVal = dMode === "fixed" ? (parseDuration(scr.durationFixed) || 10000) : scr.durationAnimObj;
        let nxA = scr.nextAction || ""; let nxT = scr.nextTarget || "";
        output.push(`SCR~${scrId}~${vis}~${dMode}~${dVal}~${nxA}~${nxT}`);

        let exportedIds = new Set(); 

        function parseObj(o, fallbackParentId = "root") {
            if (!o) return;
            let objId = o.id || o.name; 
            if (exportedIds.has(objId)) return; 
            exportedIds.add(objId);

            let parentId = o.parentId || fallbackParentId;
            if (parentId === "null" || parentId === "") parentId = "root";

            let visObj = o.visibleLed ? "1" : "0";
            let text = o.text || ""; let font = o.font || ""; let fmt = o.format || "";
            
            if (o.type === "sholat") text = o.sholatType || "";
            if (o.type === "auto_sholat") { text = o.autoDir || "h"; fmt = o.fontTime || ""; }
            if (o.type === "line") { text = o.lineX1 || 0; font = o.lineY1 || 0; fmt = o.lineX2 || 0; }
            
            let fX = o.type === "line" ? (o.lineY2 || 0) : (o.x || 0);  // Gunakan o.x langsung untuk frameX
            let fY = o.y || 0;
            
            // Hitung contentX/contentY dengan alignment offset
            let align = (o.calcAlign && typeof o.calcAlign === 'function') ? o.calcAlign() : { aX: 0, aY: 0 };
            let cX = fX + align.aX;
            let cY = fY + align.aY;
            
            let w = o.w || 0; let h = o.h || 0;
            let col = o.type === "line" ? o.lineColor : (o.color || "transparent");
            let fCol = o.frameColor || "transparent"; let bCol = o.bgColor || "transparent"; let rad = o.radius || 0;

            // CRITICAL: Urutan di row string adalah cX, cY, fX, fY (contentX dulu, baru frameX)
            // Ini untuk backward compatibility dengan format file existing
            let row = `OBJ~${objId}~${o.type}~${visObj}~${parentId}~${text}~${font}~${fmt}~${cX}~${cY}~${fX}~${fY}~${w}~${h}~${col}~${fCol}~${bCol}~${rad}~${o.anim || 'none'}~${o.animSpeed || 0}~${o.animDelay || 0}~${o.animStop || 0}~${o.anim2 || 'none'}~${o.animSpeed2 || 0}~${o.animDelay2 || 0}~${o.animStop2 || 0}~${o.onShowAction || ''}~${o.onShowTarget || ''}~${o.onDoneAction || ''}~${o.onDoneTarget || ''}`;
            output.push(row);

            if (o.type === "auto_sholat" && o.autoList) output.push(`ALIST~${objId}~${o.autoCount || 1}~${o.autoList.join("~")}`);

            let pixelDataArray = o.customPixels || o.pixels || o.data;
            if ((o.type === "drawing" || o.type === "image") && pixelDataArray && pixelDataArray.length > 0) {
                let pixData = pixelDataArray.map(p => `${p.x},${p.y},${(p.c || p.color || p.hex || "#FFFFFF").replace('#', '')}`).join("~");
                output.push(`PIX~${objId}~${pixData}`);
            }

            if (o.children && Array.isArray(o.children)) o.children.forEach(child => parseObj(child, objId));
        }

        if (scr.objects && Array.isArray(scr.objects)) scr.objects.forEach(obj => parseObj(obj, "root"));
    });

    let blob = new Blob([output.join("\n")], { type: "text/plain" });
    let link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "layout.txt"; link.click();
}

function formatDur(ms) {
    let s = Math.floor(ms / 1000); let m = Math.floor(s / 60); s = s % 60; let h = Math.floor(m / 60); m = m % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function importFromTXT(file) {
    let reader = new FileReader();
    reader.onload = function(e) {
        let lines = e.target.result.split('\n');
        screens = [];
        globalTriggers = { whenImsak: {}, whenSubuh: {}, whenTerbit: {}, whenDzuhur: {}, whenJumat: {}, whenAshar: {}, whenMagrib: {}, whenIsya: {} };
        let currentScreen = null; let objMap = {}; 
        
        lines.forEach(line => {
            line = line.trim();
            if(line.length === 0 || line.startsWith('//') || line.startsWith('#')) return;
            let tk = line.split('~'); let cmd = tk[0];
            
            if (cmd === 'TRIG') {
                let key = tk[1] === "Maghrib" ? "whenMagrib" : "when" + tk[1];
                if(globalTriggers[key]) { globalTriggers[key].action = tk[2]; globalTriggers[key].target = tk[3]; }
            } 
            else if (cmd === 'SCR') {
                currentScreen = {
                    id: tk[1], type: tk[1].toLowerCase().includes('splash') ? 'splash' : (tk[1].toLowerCase().includes('main') ? 'main' : 'generic'),
                    visibleCanvas: true, visibleLed: tk[2] === '1',
                    durationMode: tk[3], durationFixed: tk[3] === 'fixed' ? formatDur(parseInt(tk[4])) : "00:00:10",
                    durationAnimObj: tk[3] === 'anim' ? tk[4] : "", nextAction: tk[5] || "", nextTarget: tk[6] || "", objects: []
                };
                screens.push(currentScreen);
            } 
            else if (cmd === 'OBJ') {
                if(!currentScreen) return;
                
                // CRITICAL FIX: Di file TXT yang di-generate, ternyata ada SWAP!
                // frameX/frameY ada di tk[10] dan tk[11], BUKAN di tk[8] dan tk[9]
                // Ini karena bug di export function yang menukar fX/cX
                
                let frameX = parseInt(tk[10]) || 0;  // frameX ada di tk[10]!
                let frameY = parseInt(tk[11]) || 0;  // frameY ada di tk[11]!
                // tk[8] dan tk[9] berisi nilai yang salah, diabaikan
                
                let o = new PixelObject(tk[1], tk[2], frameX, frameY);
                o.id = tk[1]; o.name = tk[1]; o.visibleLed = tk[3] !== '0'; o.visibleCanvas = true;
                
                let parentId = tk[4];
                o.parentId = (!parentId || parentId === 'root' || parentId === 'null') ? null : parentId;
                
                o.text = tk[5]; o.font = tk[6]; o.format = tk[7];
                
                if (o.type === 'sholat') o.sholatType = o.text;
                if (o.type === 'auto_sholat') { o.autoDir = o.text; o.fontTime = o.format; }
                if (o.type === 'line') { 
                    o.lineX1 = parseInt(o.text)||0; 
                    o.lineY1 = parseInt(o.font)||0; 
                    o.lineX2 = parseInt(o.format)||0; 
                    o.lineY2 = frameX;
                } else { 
                    o.frameX = frameX; 
                }
                
                o.frameY = frameY; 
                o.x = frameX; 
                o.y = frameY;
                
                o.w = parseInt(tk[12]) || 1; o.h = parseInt(tk[13]) || 1;
                o.color = tk[14] !== "transparent" ? tk[14] : "#ffffff"; o.lineColor = o.type === 'line' ? o.color : "#ffffff";
                o.frameColor = tk[15] !== "transparent" ? tk[15] : "transparent"; o.bgColor = tk[16] !== "transparent" ? tk[16] : "transparent";
                o.radius = parseInt(tk[17]) || 0;
                
                o.anim = tk[18] || 'none'; o.animSpeed = parseFloat(tk[19]) || 50; o.animDelay = parseFloat(tk[20]) || 0; o.animStop = parseInt(tk[21]) || 0;
                o.anim2 = tk[22] || 'none'; o.animSpeed2 = parseFloat(tk[23]) || 50; o.animDelay2 = parseFloat(tk[24]) || 0; o.animStop2 = parseInt(tk[25]) || 0;
                o.onShowAction = tk[26] || ""; o.onShowTarget = tk[27] || ""; o.onDoneAction = tk[28] || ""; o.onDoneTarget = tk[29] || "";
                
                if (o.type !== 'group' && o.type !== 'line' && o.type !== 'image' && o.type !== 'drawing') o.updateContent();
                objMap[o.id] = o;
                
                if (!o.parentId) {
                    currentScreen.objects.push(o);
                } else {
                    let pObj = objMap[o.parentId];
                    if (pObj) {
                        if (!pObj.children) pObj.children = [];
                        pObj.children.push(o);
                    } else {
                        currentScreen.objects.push(o);
                    }
                }
            } 
            else if (cmd === 'ALIST') {
                let o = objMap[tk[1]];
                if (o && o.type === 'auto_sholat') {
                    o.autoCount = parseInt(tk[2]) || 1; o.autoList = [];
                    for(let i=3; i<tk.length; i++){ if(tk[i].length > 0) o.autoList.push(tk[i]); }
                }
            }
            else if (cmd === 'PIX') {
                let o = objMap[tk[1]];
                if (o && (o.type === 'image' || o.type === 'drawing')) {
                    o.customPixels = []; o.pixels = []; o.data = []; 
                    for(let i=2; i<tk.length; i++) {
                        let pData = tk[i].split(',');
                        if(pData.length === 3) o.customPixels.push({ x: parseInt(pData[0]), y: parseInt(pData[1]), c: '#' + pData[2] });
                    }
                    o.updateContent();
                }
            }
        });
        
        activeScreenIdx = 0; 
        selectedObjs = []; 
        selectedObj = null;
        
        objects = screens[activeScreenIdx].objects; 
        
        undoStack = []; 
        redoStack = [];
        
        if(typeof switchScreen === 'function') switchScreen(0); 
        if(typeof renderTree === 'function') renderTree(); 
        if(typeof syncPropPanel === 'function') syncPropPanel();
        
        if(typeof saveState === 'function') saveState(); 
        
        alert("✅ Layout TXT berhasil di-import!");
    };
    reader.readAsText(file);
}