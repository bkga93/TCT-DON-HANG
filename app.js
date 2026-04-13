/**
 * TCT Ultimate Multi-Scanner Pro - Logic v1.2.6.0
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
    // Flash effect
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
            // Downscale if too large for performance
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

// --- The Ultimate Scanning Flow ---

async function runUltimateScan() {
    const results = [];
    showProgress(0, "Đang khởi tạo...");
    
    try {
        // 1. BarcodeDetector (Modern API)
        showProgress(20, "Đang quét Mã vạch & QR (API Gốc)...");
        if ('BarcodeDetector' in window) {
            const formats = ['qr_code', 'code_128', 'code_39', 'ean_13', 'itf', 'upc_a'];
            const detector = new BarcodeDetector({ formats });
            const detected = await detector.detect(canvas);
            detected.forEach(d => results.push({ type: d.format === 'qr_code' ? 'qr' : 'barcode', text: d.rawValue }));
        }

        // 2. ZXing Fallback (Iterative)
        if (results.length === 0) {
            showProgress(40, "Đang quét chuyên sâu (ZXing)...");
            const zxingResults = await scanZXingIterative(canvas);
            zxingResults.forEach(r => results.push({ type: 'qr', text: r.text }));
        }

        // 3. OCR (Tesseract.js) with Preprocessing
        showProgress(60, "Đang tối ưu ảnh & Đọc chữ...");
        
        // Enhance image for OCR
        const ocrCanvas = document.createElement('canvas');
        ocrCanvas.width = canvas.width;
        ocrCanvas.height = canvas.height;
        const ocrCtx = ocrCanvas.getContext('2d');
        ocrCtx.drawImage(canvas, 0, 0);
        preprocessCanvasForOCR(ocrCanvas);

        const ocrData = await Tesseract.recognize(ocrCanvas, 'vie+eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    showProgress(60 + (m.progress * 35), `Đang bóc tách chữ: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        // Filter OCR results (looking for serials, codes, etc.)
        const lines = ocrData.data.lines;
        lines.forEach(line => {
            const cleanText = line.text.trim();
            if (isUsefulText(cleanText)) {
                results.push({ type: 'text', text: cleanText });
            }
        });

        showProgress(100, "Hoàn tất!");
        setTimeout(() => hideProgress(), 500);
        
        displayResults(results);
    } catch (err) {
        console.error("Scanning Error:", err);
        hideProgress();
        alert("Có lỗi xảy ra: " + err.message);
    }
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

function preprocessCanvasForOCR(canv) {
    const ctx = canv.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canv.width, canv.height);
    const data = imageData.data;
    
    // Contrast factor (1.5 - 2.0 is usually good)
    const contrast = 1.8;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
        // 1. Grayscale
        const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        
        // 2. High Contrast
        let color = factor * (avg - 128) + 128;
        
        // 3. Thresholding (Simple)
        color = color > 130 ? 255 : 0;

        data[i] = data[i + 1] = data[i + 2] = color;
    }
    ctx.putImageData(imageData, 0, 0);
}

function isUsefulText(text) {
    // Filter out short noise or common non-data text
    if (text.length < 4) return false;
    // Regex to find things that look like serial numbers or codes (contains numbers and letters)
    if (/[0-9]/.test(text) && text.length > 5) return true;
    // Or Uppercase words (potential category/ID)
    if (/^[A-Z0-9\-\. ]+$/.test(text)) return true;
    return false;
}

// --- UI Helpers ---

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
    
    // Remove duplicates
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
    navigator.clipboard.writeText(text).then(() => {
        // Simple visual feedback instead of alert if possible, but alert is fine for now
        alert("Đã copy: " + text);
    });
};

document.getElementById('closeResultBtn').addEventListener('click', () => {
    resultSection.style.display = 'none';
});

// --- Theme & Settings (Same as before) ---
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
