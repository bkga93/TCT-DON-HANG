/**
 * TCT Ultimate Multi-Scanner Pro - Logic v1.2.9.0
 * Kỹ thuật Super Tiling Scan (Phân vùng quét sâu)
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

// Initialize Libraries
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
            width: { ideal: 1920 },
            height: { ideal: 1080 }
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
    
    runUltimateScan();
}

function processImageFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const MAX_WIDTH = 1600;
            let width = img.width;
            let height = img.height;
            
            if (width > MAX_WIDTH) {
                height = (MAX_WIDTH / width) * height;
                width = MAX_WIDTH;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            runUltimateScan();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// --- Core Scanning Function ---

async function scanTarget(targetCanvas) {
    const findings = [];
    
    // 1. Native API
    if ('BarcodeDetector' in window) {
        try {
            const formats = ['qr_code', 'code_128', 'code_39', 'ean_13', 'itf', 'upc_a'];
            const detector = new BarcodeDetector({ formats });
            const detected = await detector.detect(targetCanvas);
            detected.forEach(d => findings.push({ type: d.format === 'qr_code' ? 'qr' : 'barcode', text: d.rawValue }));
        } catch (e) {}
    }
    
    // 2. ZXing Iterative Scan
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

async function scanZXingIterative(sourceCanvas) {
    const tempResults = [];
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sourceCanvas.width;
    tempCanvas.height = sourceCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(sourceCanvas, 0, 0);

    let foundAll = false;
    let attempts = 0;
    while (!foundAll && attempts < 5) {
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
            } else foundAll = true;
            attempts++;
        } catch (e) {
            foundAll = true;
        }
    }
    return tempResults;
}

// --- The Super Tiling Scanning Flow ---

async function runUltimateScan() {
    const results = [];
    showProgress(0, "Đang chuẩn bị...");
    
    try {
        // Step 1: Global Scan (Full Image)
        showProgress(10, "Quét toàn cục...");
        const globalFindings = await scanTarget(canvas);
        results.push(...globalFindings);

        // Step 2: Super Tiling Scan (3x3 Grid)
        showProgress(25, "Bắt đầu quét sâu từng vùng...");
        const cols = 3;
        const rows = 3;
        const tileW = Math.floor(canvas.width / 2); // 50% width to ensure overlap
        const tileH = Math.floor(canvas.height / 2);
        
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileW;
        tileCanvas.height = tileH;
        const tileCtx = tileCanvas.getContext('2d');

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const step = (y * cols + x);
                const progress = 25 + Math.floor((step / (rows * cols)) * 30);
                showProgress(progress, `Đang quét vùng ${step + 1}/9...`);

                const startX = Math.floor(x * (canvas.width - tileW) / (cols - 1));
                const startY = Math.floor(y * (canvas.height - tileH) / (rows - 1));

                tileCtx.clearRect(0, 0, tileW, tileH);
                tileCtx.drawImage(canvas, startX, startY, tileW, tileH, 0, 0, tileW, tileH);
                
                const tileFindings = await scanTarget(tileCanvas);
                tileFindings.forEach(f => {
                    if (!results.some(r => r.text === f.text)) {
                        results.push(f);
                    }
                });
            }
        }

        // Step 3: OCR (Tesseract.js) for Text/Serial Numbers
        showProgress(60, "Tối ưu ảnh & Đọc văn bản...");
        const ocrCanvas = document.createElement('canvas');
        ocrCanvas.width = canvas.width;
        ocrCanvas.height = canvas.height;
        const ocrCtx = ocrCanvas.getContext('2d');
        ocrCtx.drawImage(canvas, 0, 0);
        preprocessCanvasForOCR(ocrCanvas);

        const ocrData = await Tesseract.recognize(ocrCanvas, 'vie+eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    showProgress(60 + (m.progress * 35), `Bóc tách chữ: ${Math.round(m.progress * 100)}%`);
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
        lastCapturedDataURL = canvas.toDataURL('image/jpeg', 0.8);
        showProgress(100, "Hoàn tất!");
        setTimeout(() => hideProgress(), 500);
        
        displayResults(results);
    } catch (err) {
        console.error("Scanning Error:", err);
        hideProgress();
        alert("Có lỗi xảy ra: " + err.message);
    }
}

// --- Utils ---

function preprocessCanvasForOCR(canv) {
    const ctx = canv.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canv.width, canv.height);
    const data = imageData.data;
    const contrast = 1.8;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        let color = factor * (avg - 128) + 128;
        color = color > 130 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = color;
    }
    ctx.putImageData(imageData, 0, 0);
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

// --- Theme & Settings ---
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

const savedTheme = localStorage.getItem('tct-theme');
if (savedTheme) {
    document.body.className = savedTheme;
    const activeOpt = document.querySelector(`.theme-opt[data-theme="${savedTheme}"]`);
    if (activeOpt) {
        document.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
        activeOpt.classList.add('active');
    }
}
