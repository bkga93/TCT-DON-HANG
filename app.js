// Initialize Lucide icons
lucide.createIcons();

let html5QrCode;
const resultsList = document.getElementById('results-list');
const startBtn = document.getElementById('start-btn');
const captureBtn = document.getElementById('capture-btn');
const stopBtn = document.getElementById('stop-btn');
const retakeBtn = document.getElementById('retake-btn');
const clearBtn = document.getElementById('clear-btn');

const scannerSection = document.querySelector('.scanner-section');
const previewSection = document.getElementById('preview-section');
const capturedImage = document.getElementById('captured-image');
const ocrLoader = document.getElementById('ocr-loader');
const ocrProgress = document.getElementById('ocr-progress');
const appStatus = document.getElementById('app-status');

// Toast Notification System
function showToast(message, type = 'primary') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Result Management
function addResult(content, type = 'CODE') {
    const emptyState = resultsList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const time = new Date().toLocaleTimeString();
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
        <div class="type">${type}</div>
        <div class="content">${content}</div>
        <span class="time">${time}</span>
    `;
    
    resultsList.prepend(card);
}

// Scanner Logic
async function startScanner() {
    html5QrCode = new Html5Qrcode("reader");
    
    try {
        await html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            // Disabling the live callback to focus on "Capture" button
            () => {} 
        );
        
        startBtn.classList.add('hidden');
        captureBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        appStatus.innerHTML = '<span class="pulse" style="background:var(--accent)"></span> Camera Online';
        showToast('Camera đã sẵn sàng');
    } catch (err) {
        showToast('Lỗi mở camera: ' + err, 'error');
    }
}

async function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
    }
    startBtn.classList.remove('hidden');
    captureBtn.classList.add('hidden');
    stopBtn.classList.add('hidden');
    appStatus.innerHTML = '<span class="pulse" style="background:#999"></span> Trình duyệt';
}

// Capture & Auto-Analyze Logic
async function captureAndAnalyze() {
    const video = document.querySelector('#reader video');
    if (!video) return;

    // Capture the frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageDataUrl = canvas.toDataURL('image/png');
    capturedImage.src = imageDataUrl;

    // Switch UI to Preview
    previewSection.classList.remove('hidden');
    scannerSection.classList.add('hidden');
    
    // Show Analysis Loader
    ocrLoader.classList.remove('hidden');
    ocrProgress.style.width = '0%';
    
    try {
        // Prepare image for html5qrcode scanning
        const imageFile = await (await fetch(imageDataUrl)).blob();

        // RUN QR SCAN ON STATIC IMAGE
        const qrScanner = new Html5Qrcode("reader"); // Re-use ID but for hidden scanning
        try {
            const qrResult = await qrScanner.scanFile(imageFile, true);
            if (qrResult) {
                addResult(qrResult, 'MÃ QUÉT ĐƯỢC (QR/BARCODE)');
                showToast('Đã phát hiện mã!');
            }
        } catch (e) {
            console.log("Không tìm thấy mã QR/Barcode trong ảnh");
        }

        // RUN OCR ON STATIC IMAGE
        const worker = await Tesseract.createWorker({
            logger: m => {
                if (m.status === 'recognizing text') {
                    ocrProgress.style.width = (m.progress * 100) + '%';
                }
            }
        });
        
        await worker.loadLanguage('vie+eng');
        await worker.initialize('vie+eng');
        
        const { data: { text } } = await worker.recognize(imageDataUrl);
        await worker.terminate();

        if (text.trim()) {
            addResult(text, 'THÔNG TIN VĂN BẢN (OCR)');
            showToast('Phân tích văn bản xong');
        } else {
            showToast('Không tìm thấy văn bản rõ ràng', 'error');
        }

    } catch (err) {
        showToast('Lỗi phân tích: ' + err, 'error');
    } finally {
        ocrLoader.classList.add('hidden');
    }
}

function retake() {
    previewSection.classList.add('hidden');
    scannerSection.classList.remove('hidden');
    capturedImage.src = "";
    showToast('Đang quay lại camera...');
}

// Event Listeners
startBtn.addEventListener('click', startScanner);
stopBtn.addEventListener('click', stopScanner);
captureBtn.addEventListener('click', captureAndAnalyze);
retakeBtn.addEventListener('click', retake);
clearBtn.addEventListener('click', () => {
    resultsList.innerHTML = `<div class="empty-state"><i data-lucide="box"></i><p>Chưa có dữ liệu.</p></div>`;
    lucide.createIcons();
    showToast('Đã xóa danh sách');
});
