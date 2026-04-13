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

const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

let currentStream = null;
let useFrontCamera = false;

// Initialize ZXing - Fallback to a simpler approach if constructors are missing
const codeReader = new ZXing.BrowserMultiFormatReader();

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
        console.warn("Camera error (possibly none available):", err);
        // Do not alert, just log. The user might want to use file upload instead.
    }
}

switchCamBtn.addEventListener('click', () => {
    useFrontCamera = !useFrontCamera;
    startCamera();
});

// --- Upload Logic ---

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            scanMultipleQRs();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// --- QR Detection Logic (Iterative Masking to handle multiple QRs) ---

async function scanMultipleQRs() {
    const results = [];
    const context = canvas.getContext('2d');
    
    // Create a copy of the canvas for iterative masking
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    let foundAll = false;
    let attempts = 0;
    const maxAttempts = 10; // Limit to prevent infinite loops

    while (!foundAll && attempts < maxAttempts) {
        try {
            // Use decodeFromCanvas which is more stable across ZXing versions
            const result = await codeReader.decodeFromCanvas(tempCanvas);
            
            // Avoid duplicates
            if (!results.some(r => r.text === result.text)) {
                results.push(result);
            }

            // Mask the found QR to find the next one
            const points = result.resultPoints;
            if (points && points.length >= 3) {
                tempCtx.fillStyle = 'black';
                tempCtx.beginPath();
                tempCtx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    tempCtx.lineTo(points[i].x, points[i].y);
                }
                tempCtx.closePath();
                tempCtx.fill();
            } else {
                // If we can't mask it, we stop to avoid infinite loop on same QR
                foundAll = true;
            }
            attempts++;
        } catch (err) {
            // No more QR codes detected
            foundAll = true;
        }
    }

    if (results.length > 0) {
        displayResults(results);
    } else {
        alert("Không tìm thấy mã QR nào. Hãy thử camera khác hoặc ảnh rõ nét hơn!");
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
    
    // 1. Capture current frame from video to canvas
    if (currentStream) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        scanMultipleQRs();
    } else {
        alert("Camera chưa sẵn sàng. Vui lòng sử dụng tính năng 'CHỌN ẢNH'!");
    }
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
