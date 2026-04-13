/**
 * TCT Ultimate Multi-Scanner Pro - Logic v1.3.0
 * Kỹ thuật Hyper Deep Scan (jsQR + Multi-Threshold + Native Tiling)
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
            width: { ideal: 4096 }, // Target 4K if available for maximum detail
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
            // No downscaling for the master canvas to preserve native resolution for tiles
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
    
    // 1. jsQR (Specialized for QR - very robust)
    try {
        const ctx = targetCanvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "dontInvert" });
        if (code) {
            findings.push({ type: 'qr', text: code.data });
        }
    } catch (e) {}

    // 2. BarcodeDetector (Native)
    if ('BarcodeDetector' in window) {
        try {
            const formats = ['qr_code', 'code_128', 'code_39', 'ean_13', 'itf', 'upc_a'];
            const detector = new BarcodeDetector({ formats });
            const detected = await detector.detect(targetCanvas);
            detected.forEach(d => findings.push({ type: d.format === 'qr_code' ? 'qr' : 'barcode', text: d.rawValue }));
        } catch (e) {}
    }
    
    // 3. ZXing (Iterative Fallback)
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

// --- The Nuclear Scanning Flow ---

async function runUltimateScan(sourceCanvas) {
    const results = [];
    showProgress(0, "Khởi tạo Hệ thống Siêu Quét...");
    
    try {
        // Step 1: Global Scan with Multi-Thresholds
        const filters = ['original', 'contrast', 'binary'];
        for (let i = 0; i < filters.length; i++) {
            showProgress(5 + (i * 5), `Quét toàn cục (Chế độ: ${filters[i]})...`);
            const procCanvas = document.createElement('canvas');
            procCanvas.width = Math.min(sourceCanvas.width, 2000); // Global scan doesn't need 4000px
            procCanvas.height = (procCanvas.width / sourceCanvas.width) * sourceCanvas.height;
            const pCtx = procCanvas.getContext('2d');
            pCtx.drawImage(sourceCanvas, 0, 0, procCanvas.width, procCanvas.height);
            
            if (filters[i] !== 'original') applyFilters(procCanvas, filters[i]);
            
            const findings = await scanCanvasHyper(procCanvas);
            findings.forEach(f => {
                if (!results.some(r => r.text === f.text)) results.push(f);
            });
        }

        // Step 2: Native Tiling Scan (4x4 Grid on ORIGINAL resolution)
        const cols = 4;
        const rows = 4;
        const tileW = Math.floor(sourceCanvas.width / 2.5); // Large overlap
        const tileH = Math.floor(sourceCanvas.height / 2.5);
        
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileW;
        tileCanvas.height = tileH;
        const tileCtx = tileCanvas.getContext('2d');

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const step = (y * cols + x);
                const progress = 25 + Math.floor((step / (rows * cols)) * 40);
                showProgress(progress, `Quét sâu vùng ${step + 1}/16 (Độ phân giải gốc)...`);

                const startX = Math.floor(x * (sourceCanvas.width - tileW) / (cols - 1));
                const startY = Math.floor(y * (sourceCanvas.height - tileH) / (rows - 1));

                tileCtx.clearRect(0, 0, tileW, tileH);
                tileCtx.drawImage(sourceCanvas, startX, startY, tileW, tileH, 0, 0, tileW, tileH);
                
                // Scan tile with 2 filters (Original and Contrast)
                const findingsNormal = await scanCanvasHyper(tileCanvas);
                findingsNormal.forEach(f => {
                    if (!results.some(r => r.text === f.text)) results.push(f);
                });

                applyFilters(tileCanvas, 'contrast');
                const findingsContrast = await scanCanvasHyper(tileCanvas);
                findingsContrast.forEach(f => {
                    if (!results.some(r => r.text === f.text)) results.push(f);
                });
            }
        }

        // Step 3: OCR for Serial Numbers
        showProgress(70, "Đang bóc tách số Series (OCR)...");
        const ocrCanvas = document.createElement('canvas');
        ocrCanvas.width = Math.min(sourceCanvas.width, 2500); 
        ocrCanvas.height = (ocrCanvas.width / sourceCanvas.width) * sourceCanvas.height;
        const ocrCtx = ocrCanvas.getContext('2d');
        ocrCtx.drawImage(sourceCanvas, 0, 0, ocrCanvas.width, ocrCanvas.height);
        applyFilters(ocrCanvas, 'contrast');

        const ocrData = await Tesseract.recognize(ocrCanvas, 'vie+eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    showProgress(70 + (m.progress * 25), `Đang tìm số Series: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        const lines = ocrData.data.lines;
        lines.forEach(line => {
            const cleanText = line.text.trim();
            if (isUsefulText(cleanText)) {
                results.push({ type: 'text', text: cleanText });
            }
        });

        // Finalize
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
        const contrast = 2.0;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        for (let i = 0; i < data.length; i += 4) {
            data[i] = factor * (data[i] - 128) + 128;
            data[i + 1] = factor * (data[i + 1] - 128) + 128;
            data[i + 2] = factor * (data[i + 2] - 128) + 128;
        }
    } else if (type === 'binary') {
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            const val = avg > 128 ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = val;
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
    const lower = text.toLowerCase();
    if (lower.includes('serial') || lower.includes('series') || lower.includes('no.') || lower.includes('s/n') || lower.includes('no:')) return true;
    if (/RS[0-9]{5,}/.test(text)) return true;
    if (/SPX[A-Z0-9]{10,}/i.test(text)) return true;
    return false;
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
