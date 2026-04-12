// Initialize Lucide icons
lucide.createIcons();

let html5QrCode;
const resultsList = document.getElementById('results-list');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const captureBtn = document.getElementById('capture-ocr-btn');
const clearBtn = document.getElementById('clear-btn');
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
    showToast(`Đã lưu ${type}`);
}

// Scanner Logic
async function startScanner() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    try {
        await html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            (decodedText, decodedResult) => {
                addResult(decodedText, 'QR/BARCODE');
            }
        );
        
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        captureBtn.disabled = false;
        appStatus.innerHTML = '<span class="pulse"></span> Scanning...';
        showToast('Camera đã sẵn sàng');
    } catch (err) {
        showToast('Không thể mở camera: ' + err, 'error');
    }
}

async function stopScanner() {
    if (html5QrCode) {
        await html5QrCode.stop();
        html5QrCode = null;
    }
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    captureBtn.disabled = true;
    appStatus.innerHTML = '<span class="pulse" style="background:#999"></span> Ready';
}

// OCR Logic
async function captureAndOCR() {
    const video = document.querySelector('#reader video');
    if (!video) return;

    // Create canvas to capture frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = canvas.toDataURL('image/png');
    
    // Show loader
    ocrLoader.classList.remove('hidden');
    ocrProgress.style.width = '0%';

    try {
        const worker = await Tesseract.createWorker({
            logger: m => {
                if (m.status === 'recognizing text') {
                    ocrProgress.style.width = (m.progress * 100) + '%';
                }
            }
        });
        
        await worker.loadLanguage('vie+eng');
        await worker.initialize('vie+eng');
        
        const { data: { text } } = await worker.recognize(imageData);
        await worker.terminate();

        if (text.trim()) {
            addResult(text, 'VĂN BẢN (OCR)');
        } else {
            showToast('Không tìm thấy văn bản nào', 'error');
        }
    } catch (err) {
        showToast('Lỗi OCR: ' + err, 'error');
    } finally {
        ocrLoader.classList.add('hidden');
    }
}

// Event Listeners
startBtn.addEventListener('click', startScanner);
stopBtn.addEventListener('click', stopScanner);
captureBtn.addEventListener('click', captureAndOCR);
clearBtn.addEventListener('click', () => {
    resultsList.innerHTML = `<div class="empty-state"><i data-lucide="box"></i><p>Chưa có dữ liệu.</p></div>`;
    lucide.createIcons();
    showToast('Đã xóa lịch sử');
});
