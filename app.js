/**
 * TCT Multi-QR Scanner Pro - Logic
 * Thực hiện bởi NVH
 */

const video = document.getElementById('video');
const canvas = document.getElementById('captureCanvas');
const captureBtn = document.getElementById('captureBtn');
const switchCamBtn = document.getElementById('switchCamBtn');
const settingsBtn = document.getElementById('settingsBtn');
const resultSection = document.getElementById('resultSection');
const resultBody = document.getElementById('resultBody');
const qrCount = document.getElementById('qrCount');
const scanLine = document.getElementById('scanLine');
const settingsModal = document.getElementById('settingsModal');

let currentStream = null;
let useFrontCamera = false;

// Initialize ZXing
const codeReader = new ZXing.BrowserMultiFormatReader();
const hints = new Map();
hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);

// --- Camera Management ---

async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: {
            facingMode: useFrontCamera ? "user" : "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        scanLine.style.display = 'block';
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Không thể truy cập camera. Vui lòng cấp quyền.");
    }
}

switchCamBtn.addEventListener('click', () => {
    useFrontCamera = !useFrontCamera;
    startCamera();
});

// --- QR Detection Logic ---

async function scanMultipleQRs() {
    // 1. Capture current frame to canvas
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Prepare ZXing multiple reader
    try {
        const luminanceSource = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        const binarizer = new ZXing.HybridBinarizer(luminanceSource);
        const binaryBitmap = new ZXing.BinaryBitmap(binarizer);

        const multiFormatReader = new ZXing.MultiFormatReader();
        multiFormatReader.setHints(hints);
        const multiReader = new ZXing.GenericMultipleBarcodeReader(multiFormatReader);

        const results = multiReader.decodeMultiple(binaryBitmap, hints);
        
        displayResults(results);
    } catch (err) {
        if (err instanceof ZXing.NotFoundException) {
            alert("Không tìm thấy mã QR nào trong ảnh. Hãy thử lại!");
        } else {
            console.error("Scan error:", err);
            alert("Có lỗi xảy ra khi quét: " + err.message);
        }
    }
}

function displayResults(results) {
    resultBody.innerHTML = '';
    qrCount.innerText = results.length;
    
    if (results.length > 0) {
        results.forEach(res => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="word-break: break-all; font-size: 0.9rem;">${res.text}</td>
                <td>
                    <button class="btn" style="padding: 5px 10px; font-size: 0.7rem;" onclick="copyToClipboard('${res.text}')">Copy</button>
                </td>
            `;
            resultBody.appendChild(row);
        });
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth' });
    }
}

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        alert("Đã copy: " + text);
    });
};

captureBtn.addEventListener('click', () => {
    // Add a quick flash effect
    video.style.opacity = '0.5';
    setTimeout(() => video.style.opacity = '1', 100);
    
    scanMultipleQRs();
});

document.getElementById('closeResultBtn').addEventListener('click', () => {
    resultSection.style.display = 'none';
});

// --- Theme Management ---

settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
});

document.getElementById('closeSettingsModal').addEventListener('click', () => {
    settingsModal.style.display = 'none';
});

document.querySelectorAll('.theme-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        const theme = opt.getAttribute('data-theme');
        document.body.className = theme;
        
        // Update active state
        document.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        
        // Optional: Save to localStorage
        localStorage.setItem('tct-theme', theme);
    });
});

// Load saved theme
const savedTheme = localStorage.getItem('tct-theme');
if (savedTheme) {
    document.body.className = savedTheme;
    const activeOpt = document.querySelector(`.theme-opt[data-theme="${savedTheme}"]`);
    if (activeOpt) {
        document.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
        activeOpt.classList.add('active');
    }
}

// Start app
startCamera();
