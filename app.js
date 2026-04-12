// Initialize Lucide icons
lucide.createIcons();

let html5QrCode;
let tesseractWorker = null;

const dashboard = document.getElementById('dashboard');
const cameraInterface = document.getElementById('camera-interface');
const resultDrawer = document.getElementById('result-drawer');
const drawerContent = document.getElementById('drawer-content');
const analysisHud = document.getElementById('analysis-hud');
const hudMessage = document.getElementById('hud-message');
const hudProgressBar = document.getElementById('hud-progress-bar');
const flashEffect = document.getElementById('flash-effect');
const resultsList = document.getElementById('results-list');

const openCameraBtn = document.getElementById('open-camera-btn');
const closeCameraBtn = document.getElementById('close-camera-btn');
const shutterBtn = document.getElementById('shutter-btn');
const closeDrawerBtn = document.getElementById('close-drawer-btn');
const clearBtn = document.getElementById('clear-btn');
const copyBtn = document.getElementById('copy-btn');

// --- Utils ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function updateHUD(message, progress = null) {
    hudMessage.textContent = message;
    if (progress !== null) {
        hudProgressBar.style.width = `${progress * 100}%`;
    }
}

// --- OCR Engine Management ---
// Singleton pattern to prevent re-initializing
async function initOCR() {
    if (tesseractWorker) return tesseractWorker;
    
    analysisHud.classList.remove('hidden');
    updateHUD('Đang nạp bộ máy OCR...', 0.1);
    
    try {
        const worker = await Tesseract.createWorker({
            corePath: 'https://unpkg.com/tesseract.js-core@v5.0.0/tesseract-core.wasm.js', // CDN cụ thể để tránh lỗi nạp
            logger: m => {
                if (m.status === 'loading tesseract core') updateHUD('Đang nạp lõi xử lý...', 0.3);
                if (m.status === 'loading language traineddata') updateHUD('Đang nạp ngôn ngữ...', 0.6);
                if (m.status === 'initializing api') updateHUD('Đang khởi tạo ứng dụng...', 0.9);
            }
        });
        
        await worker.loadLanguage('vie+eng');
        await worker.initialize('vie+eng');
        tesseractWorker = worker;
        updateHUD('Đã sẵn sàng!', 1);
        setTimeout(() => analysisHud.classList.add('hidden'), 500);
        return worker;
    } catch (err) {
        console.error(err);
        showToast('Lỗi nạp OCR. Hãy thử load lại trang.');
        analysisHud.classList.add('hidden');
        return null;
    }
}

// --- Camera Logic ---
async function openCamera() {
    dashboard.classList.add('hidden');
    cameraInterface.classList.remove('hidden');
    
    html5QrCode = new Html5Qrcode("reader");
    
    // Bắt đầu nạp OCR ngay khi mở camera (tiết kiệm thời gian)
    initOCR();

    try {
        const config = { 
            fps: 10, 
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                return { width: viewfinderWidth * 0.8, height: viewfinderWidth * 0.8 };
            },
            aspectRatio: window.innerHeight / window.innerWidth // Giả lập full-screen
        };
        
        await html5QrCode.start(
            { facingMode: "environment" }, 
            config,
            () => {} // Không chạy auto-loop scan để tập trung vào phím chụp
        );
        showToast('Đã mở Camera');
    } catch (err) {
        showToast('Lỗi Camera: ' + err);
        closeCamera();
    }
}

async function closeCamera() {
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
    }
    cameraInterface.classList.add('hidden');
    dashboard.classList.remove('hidden');
    resultDrawer.classList.remove('active');
}

// --- Analysis Logic ---
async function captureAndAnalyze() {
    const video = document.querySelector('#reader video');
    if (!video) return;

    // 1. Hiệu ứng Flash trắng (như iPhone)
    flashEffect.classList.add('flash-active');
    setTimeout(() => flashEffect.classList.remove('flash-active'), 300);

    // 2. Chụp ảnh từ khung hình video
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);

    // 3. Hiển thị HUD phân tích
    analysisHud.classList.remove('hidden');
    updateHUD('Đang xử lý ảnh...', 0.1);

    let finalResults = [];

    try {
        const imageBlob = await (await fetch(imageDataUrl)).blob();
        
        // A. QUÉT MÃ QR/BARCODE TRÊN ẢNH VỪA CHỤP
        const qrTemp = new Html5Qrcode("reader"); 
        try {
            updateHUD('Đang tìm mã vạch...', 0.3);
            const qrResult = await qrTemp.scanFile(imageBlob, true);
            if (qrResult) finalResults.push({ type: 'MÃ ĐƠN HÀNG', content: qrResult });
        } catch(e) { }

        // B. QUÉT VĂN BẢN (OCR)
        const worker = await initOCR();
        if (worker) {
            updateHUD('Đang trích xuất chữ...', 0.6);
            const { data: { text } } = await worker.recognize(imageDataUrl);
            if (text.trim()) finalResults.push({ type: 'THÔNG TIN BỔ SUNG (OCR)', content: text });
        }

        displayResultsInDrawer(finalResults);
    } catch (err) {
        showToast('Lỗi khi phân tích ảnh.');
        console.error(err);
    } finally {
        analysisHud.classList.add('hidden');
    }
}

function displayResultsInDrawer(results) {
    drawerContent.innerHTML = '';
    
    if (results.length === 0) {
        drawerContent.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-muted);">
                <i data-lucide="frown" style="width:48px; height:48px; margin-bottom:10px;"></i>
                <p>Không tìm thấy thông tin gì trên nhãn này.</p>
            </div>
        `;
    } else {
        results.forEach(res => {
            const card = document.createElement('div');
            card.className = 'result-card';
            card.style.background = 'rgba(255,255,255,0.05)';
            card.innerHTML = `
                <div class="type">${res.type}</div>
                <div class="content" style="white-space: pre-wrap;">${res.content}</div>
                <button class="copy-small-btn" onclick="navigator.clipboard.writeText('${res.content.replace(/'/g, "\\'")}'); showToast('Đã copy!')">
                    <i data-lucide="copy" style="width:14px;"></i> Copy
                </button>
            `;
            drawerContent.appendChild(card);
            saveToHistory(res);
        });
    }
    
    lucide.createIcons();
    resultDrawer.classList.add('active');
}

function saveToHistory(res) {
    const emptyState = resultsList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const time = new Date().toLocaleTimeString();
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
        <div class="type">${res.type}</div>
        <div class="content">${res.content.substring(0, 100)}${res.content.length > 100 ? '...' : ''}</div>
        <span class="time">${time}</span>
    `;
    resultsList.prepend(card);
}

// --- Event Listeners ---
openCameraBtn.addEventListener('click', openCamera);
closeCameraBtn.addEventListener('click', closeCamera);
shutterBtn.addEventListener('click', captureAndAnalyze);
closeDrawerBtn.addEventListener('click', () => resultDrawer.classList.remove('active'));

clearBtn.addEventListener('click', () => {
    resultsList.innerHTML = '<div class="empty-state"><i data-lucide="scan"></i><p>Nhấn "Mở Camera" để bắt đầu</p></div>';
    lucide.createIcons();
    showToast('Đã xóa lịch sử');
});

copyBtn.addEventListener('click', () => {
    const text = Array.from(drawerContent.querySelectorAll('.content'))
        .map(el => el.innerText)
        .join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
    showToast('Đã copy tất cả!');
});
