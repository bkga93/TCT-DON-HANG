/**
 * TCT Ultimate Multi-Scanner Pro - Logic v1.3.5
 * Chế độ Clean Data Scan (Chỉ lấy QR & Serial No)
 * Thực hiện bởi NVH
 */

const video = document.getElementById('video');
const canvas = document.getElementById('captureCanvas');
const captureBtn = document.getElementById('captureBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const switchCamBtn = document.getElementById('switchCamBtn');
const settingsBtn = document.getElementById('settingsBtn');
const resultSection = document.getElementById('resultSection');
const resultBody = document.getElementById('resultBody');
const qrCount = document.getElementById('qrCount');
const scanLine = document.getElementById('scanLine');
const settingsModal = document.getElementById('settingsModal');

// Progress UI
const scanProgress = document.getElementById('scanProgress');
const scanProgressBar = scanProgress.querySelector('.scan-progress-bar');
const scanProgressText = scanProgress.querySelector('.scan-progress-text');

let currentStream = null;
let useFrontCamera = false;
let lastCapturedDataURL = null;

// Initialize ZXing
const codeReader = new ZXing.BrowserMultiFormatReader();

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    startCamera();
    
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        processImageFile(file);
    });

    captureBtn.addEventListener('click', () => {
        if (!currentStream) {
            alert("Camera chưa sẵn sàng. Vui lòng sử dụng 'CHỌN ẢNH'!");
            return;
        }
        captureFromVideo();
    });
});

// --- Camera Management ---

async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: {
            facingMode: useFrontCamera ? "user" : "environment",
            width: { ideal: 4096 },
            height: { ideal: 2160 }
        }
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        scanLine.style.display = 'block';
    } catch (err) {
        console.warn("Camera access failed:", err);
    }
}

switchCamBtn.addEventListener('click', () => {
    useFrontCamera = !useFrontCamera;
    startCamera();
});

// --- Workflow ---

function captureFromVideo() {
    video.style.opacity = '0.5';
    setTimeout(() => video.style.opacity = '1', 100);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    runUltimateScan(canvas);
}

function processImageFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            runUltimateScan(canvas);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// --- Hyper Scanning Core ---

async function scanCanvasHyper(targetCanvas) {
    const findings = [];
    
    try {
        const ctx = targetCanvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "dontInvert" });
        if (code) {
            findings.push({ type: 'qr', text: code.data });
        }
    } catch (e) {}

    if ('BarcodeDetector' in window) {
        try {
            const formats = ['qr_code', 'code_128', 'code_39', 'ean_13', 'itf', 'upc_a'];
            const detector = new BarcodeDetector({ formats });
            const detected = await detector.detect(targetCanvas);
            detected.forEach(d => findings.push({ type: d.format === 'qr_code' ? 'qr' : 'barcode', text: d.rawValue }));
        } catch (e) {}
    }
    
    try {
        const zxingResults = await scanZXingIterative(targetCanvas);
        zxingResults.forEach(r => {
            if (!findings.some(f => f.text === r.text)) {
                findings.push({ type: 'qr', text: r.text });
            }
        });
    } catch (e) {}

    return findings;
}

// --- The Ultra-Selective Scanning Flow ---

async function runUltimateScan(sourceCanvas) {
    const results = [];
    showProgress(0, "Khởi tạo Clean Data Scan v1.3.5...");
    
    try {
        // Step 1: Global Scan
        const filters = ['original', 'contrast'];
        for (let i = 0; i < filters.length; i++) {
            showProgress(5 + (i * 10), `Quét toàn cục (${filters[i]})...`);
            const procCanvas = document.createElement('canvas');
            procCanvas.width = Math.min(sourceCanvas.width, 2000);
            procCanvas.height = (procCanvas.width / sourceCanvas.width) * sourceCanvas.height;
            const pCtx = procCanvas.getContext('2d');
            pCtx.drawImage(sourceCanvas, 0, 0, procCanvas.width, procCanvas.height);
            
            if (filters[i] !== 'original') applyFilters(procCanvas, filters[i]);
            
            const findings = await scanCanvasHyper(procCanvas);
            findings.forEach(f => {
                if (!results.some(r => r.text === f.text)) results.push(f);
            });
        }

        // Step 2: Native Tiling Scan (4x4 Grid)
        const cols = 4;
        const rows = 4;
        const tileW = Math.floor(sourceCanvas.width / 2.5);
        const tileH = Math.floor(sourceCanvas.height / 2.5);
        
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileW;
        tileCanvas.height = tileH;
        const tileCtx = tileCanvas.getContext('2d');

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const step = (y * cols + x);
                const progress = 25 + Math.floor((step / (rows * cols)) * 40);
                showProgress(progress, `Soi từng vùng ${step + 1}/16...`);

                const startX = Math.floor(x * (sourceCanvas.width - tileW) / (cols - 1));
                const startY = Math.floor(y * (sourceCanvas.height - tileH) / (rows - 1));

                tileCtx.clearRect(0, 0, tileW, tileH);
                tileCtx.drawImage(sourceCanvas, startX, startY, tileW, tileH, 0, 0, tileW, tileH);
                
                const fN = await scanCanvasHyper(tileCanvas);
                fN.forEach(f => {
                    if (!results.some(r => r.text === f.text)) results.push(f);
                });

                applyFilters(tileCanvas, 'contrast');
                const fC = await scanCanvasHyper(tileCanvas);
                fC.forEach(f => {
                    if (!results.some(r => r.text === f.text)) results.push(f);
                });
            }
        }

        // Step 3: OCR (Only for Serial Numbers)
        showProgress(70, "Bóc tách Serial No...");
        const ocrCanvas = document.createElement('canvas');
        ocrCanvas.width = Math.min(sourceCanvas.width, 2500); 
        ocrCanvas.height = (ocrCanvas.width / sourceCanvas.width) * sourceCanvas.height;
        const ocrCtx = ocrCanvas.getContext('2d');
        ocrCtx.drawImage(sourceCanvas, 0, 0, ocrCanvas.width, ocrCanvas.height);
        applyFilters(ocrCanvas, 'contrast');

        const ocrData = await Tesseract.recognize(ocrCanvas, 'vie+eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    showProgress(70 + (m.progress * 25), `Đọc chữ: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        const lines = ocrData.data.lines;
        lines.forEach(line => {
            const cleanText = line.text.trim();
            if (isUsefulText(cleanText)) {
                // Deduplicate against already found QR/Barcodes
                if (!results.some(r => r.text === cleanText)) {
                    results.push({ type: 'text', text: cleanText });
                }
            }
        });

        lastCapturedDataURL = sourceCanvas.toDataURL('image/jpeg', 0.8);
        showProgress(100, "Hoàn tất!");
        setTimeout(() => hideProgress(), 500);
        
        displayResults(results);
    } catch (err) {
        console.error("Scanning Error:", err);
        hideProgress();
        alert("Có lỗi xảy ra: " + err.message);
    }
}

// --- Image Processing Filters ---

function applyFilters(canv, type) {
    const ctx = canv.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canv.width, canv.height);
    const data = imageData.data;
    
    if (type === 'contrast') {
        const contrast = 1.8;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        for (let i = 0; i < data.length; i += 4) {
            data[i] = factor * (data[i] - 128) + 128;
            data[i + 1] = factor * (data[i + 1] - 128) + 128;
            data[i + 2] = factor * (data[i + 2] - 128) + 128;
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

// --- Utils ---

async function scanZXingIterative(sourceCanvas) {
    const tempResults = [];
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sourceCanvas.width;
    tempCanvas.height = sourceCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(sourceCanvas, 0, 0);

    let attempts = 0;
    while (attempts < 3) {
        try {
            const res = await codeReader.decodeFromCanvas(tempCanvas);
            tempResults.push(res);
            const pts = res.resultPoints;
            if (pts && pts.length >= 3) {
                tempCtx.fillStyle = 'black';
                tempCtx.beginPath();
                tempCtx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) tempCtx.lineTo(pts[i].x, pts[i].y);
                tempCtx.closePath();
                tempCtx.fill();
            } else break;
            attempts++;
        } catch (e) { break; }
    }
    return tempResults;
}

function isUsefulText(text) {
    const lower = text.toLowerCase().trim();
    if (lower.length < 5) return false;
    
    // Only Serial/Series/RS
    const serialKeywords = ['serial', 'series', 'rs'];
    return serialKeywords.some(k => lower.includes(k));
}

function showProgress(percent, text) {
    scanProgress.style.display = 'flex';
    scanProgressBar.style.width = percent + '%';
    scanProgressText.innerText = text;
}

function hideProgress() {
    scanProgress.style.display = 'none';
}

function displayResults(results) {
    resultBody.innerHTML = '';
    const capturePreview = document.getElementById('capturePreview');
    if (capturePreview && lastCapturedDataURL) {
        capturePreview.src = lastCapturedDataURL;
    }

    const unique = [];
    const seen = new Set();
    results.forEach(r => {
        const key = r.type + ':' + r.text;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(r);
        }
    });

    qrCount.innerText = unique.length;
    
    if (unique.length > 0) {
        unique.forEach(res => {
            const row = document.createElement('tr');
            const typeLabel = res.type === 'qr' ? 'QR Code' : (res.type === 'barcode' ? 'Mã vạch' : 'Văn bản');
            row.innerHTML = `
                <td style="word-break: break-all;">
                    <span class="type-badge type-${res.type}">${typeLabel}</span>
                    <div style="font-size: 0.95rem; color: var(--text-color); font-weight: 500;">${res.text}</div>
                </td>
                <td style="width: 80px; text-align: center;">
                    <button class="btn" style="padding: 10px; font-size: 0.7rem;" onclick="copyToClipboard('${res.text}')">Copy</button>
                </td>
            `;
            resultBody.appendChild(row);
        });
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth' });
    } else {
        alert("Không tìm thấy thông tin nào! Vui lòng thử lại với ảnh rõ nét hơn.");
    }
}

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => alert("Đã copy: " + text));
};

document.getElementById('closeResultBtn').addEventListener('click', () => {
    resultSection.style.display = 'none';
});

// --- Settings ---
settingsBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
document.getElementById('closeSettingsModal').addEventListener('click', () => settingsModal.style.display = 'none');
document.querySelectorAll('.theme-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        const theme = opt.getAttribute('data-theme');
        document.body.className = theme;
        document.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        localStorage.setItem('tct-theme', theme);
    });
});
