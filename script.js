/**
 * ==========================================================================
 * SCIENCE EXPO SCANNER ULTRA - JAVASCRIPT LOGIC
 * High-Accuracy Computer Vision OCR, Multi-Tier Regex Parser, 
 * Real-Time Analytics & Report Generation
 * ==========================================================================
 */

// Database initialization
const STORAGE_KEY = 'expo_attendees_pro_db';
let studentLogs = [];
try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    studentLogs = rawData ? JSON.parse(rawData) : [];
    if (!Array.isArray(studentLogs)) studentLogs = [];
} catch (e) {
    console.warn("Storage init warning:", e);
    studentLogs = [];
}

const video = document.getElementById('videoFeed');
const canvas = document.getElementById('processCanvas');
const cameraStatus = document.getElementById('cameraStatus');

// Global Tesseract Worker Instance for Instant Response
let ocrWorker = null;
let isWorkerReady = false;
let rawDetectedLines = [];

/**
 * Pre-warm and Initialize Tesseract Worker on Startup
 */
async function initOCRWorker() {
    try {
        if (ocrWorker) return ocrWorker;
        if (typeof Tesseract === 'undefined') return null;

        ocrWorker = await Tesseract.createWorker('eng');
        await ocrWorker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -.:/&\'",()#+@|',
            tessedit_pageseg_mode: '6' // Assume single uniform block of text
        });
        isWorkerReady = true;
        console.log("Tesseract OCR Engine Ready");
        return ocrWorker;
    } catch (err) {
        console.warn("Worker warm-up warning:", err);
        return null;
    }
}

/**
 * Initialize WebRTC Camera with Optimal HD Resolution
 */
async function initializeCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (cameraStatus) {
            cameraStatus.innerText = "CAMERA NOT SUPPORTED";
            cameraStatus.className = "text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30";
        }
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                width: { min: 1280, ideal: 1920 },
                height: { min: 720, ideal: 1080 }
            },
            audio: false
        });
        video.srcObject = stream;
        if (cameraStatus) {
            cameraStatus.innerText = "CAMERA ACTIVE";
            cameraStatus.className = "text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        }
    } catch (err) {
        console.warn("Camera access fallback:", err);
        if (cameraStatus) {
            cameraStatus.innerText = "CAMERA OFFLINE";
            cameraStatus.className = "text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30";
        }
    }
}

/**
 * High-Precision Computer Vision Image Preprocessing
 * 1. Resolution Upscaling
 * 2. Adaptive Grayscale & Histogram Contrast Enhancement
 * 3. Edge Sharpening for Fine Letters and Numbers
 */
function preprocessImage(ctx, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    // Step 1: Calculate Mean Luminance & Standard Deviation
    let sum = 0;
    const len = d.length;
    for (let i = 0; i < len; i += 4) {
        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const mean = sum / (len / 4);

    // Step 2: Adaptive Contrast Equalization
    const contrast = 1.45;
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));

    for (let i = 0; i < len; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        let enhanced = factor * (gray - 128) + 128;

        // Slight gamma correction to bring out dark text on colored badge backgrounds
        if (mean < 110) {
            enhanced = Math.pow(enhanced / 255, 0.85) * 255;
        }

        const finalVal = Math.min(255, Math.max(0, enhanced));
        d[i] = finalVal;
        d[i + 1] = finalVal;
        d[i + 2] = finalVal;
    }
    ctx.putImageData(imgData, 0, 0);

    // Step 3: Unsharp Sharpening Convolution (Preserves fine text like 10-A, initials S., etc.)
    applySharpening(ctx, width, height);
}

/**
 * Unsharp 3x3 Convolution Sharpening Filter
 */
function applySharpening(ctx, w, h) {
    try {
        const weights = [
            0, -0.3, 0,
            -0.3, 2.2, -0.3,
            0, -0.3, 0
        ];
        const src = ctx.getImageData(0, 0, w, h);
        const dst = ctx.createImageData(w, h);
        const s = src.data;
        const d = dst.data;

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const dstOff = (y * w + x) * 4;
                let r = 0, g = 0, b = 0;
                for (let cy = -1; cy <= 1; cy++) {
                    for (let cx = -1; cx <= 1; cx++) {
                        const weight = weights[(cy + 1) * 3 + (cx + 1)];
                        const srcOff = ((y + cy) * w + (x + cx)) * 4;
                        r += s[srcOff] * weight;
                        g += s[srcOff + 1] * weight;
                        b += s[srcOff + 2] * weight;
                    }
                }
                d[dstOff] = Math.min(255, Math.max(0, r));
                d[dstOff + 1] = Math.min(255, Math.max(0, g));
                d[dstOff + 2] = Math.min(255, Math.max(0, b));
                d[dstOff + 3] = 255;
            }
        }
        ctx.putImageData(dst, 0, 0);
    } catch (e) {
        console.warn("Sharpening filter skipped:", e);
    }
}

/**
 * Frame Capture from Live Camera (No Aggressive Cropping to Avoid Losing Headers/Footers)
 */
async function captureAndScan() {
    if (!video.srcObject || video.videoWidth === 0) {
        alert("Camera feed is not ready. Please use the 'Upload Image' button.");
        return;
    }

    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;

    // Use full view with 5% margin to ensure School headers and Section footers aren't cut
    const cropX = Math.round(vWidth * 0.03);
    const cropY = Math.round(vHeight * 0.03);
    const cropWidth = Math.round(vWidth * 0.94);
    const cropHeight = Math.round(vHeight * 0.94);

    // Upscale to minimum 1500px width for crystal clear character recognition
    const targetWidth = Math.max(1500, cropWidth);
    const targetHeight = Math.round((cropHeight / cropWidth) * targetWidth);

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw frame
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);

    // Run enhancement
    preprocessImage(ctx, targetWidth, targetHeight);

    const processedDataUrl = canvas.toDataURL('image/png');
    await executeOCR(processedDataUrl);
}

/**
 * Handle Manual Image File Upload
 */
async function handleManualUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const img = new Image();
        img.onload = async () => {
            const targetWidth = Math.max(1500, img.width);
            const targetHeight = Math.round((img.height / img.width) * targetWidth);

            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            preprocessImage(ctx, targetWidth, targetHeight);
            await executeOCR(canvas.toDataURL('image/png'));
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

/**
 * OCR Engine Execution with Tesseract.js
 */
async function executeOCR(imageSrc) {
    const loader = document.getElementById('ocrLoader');
    if (loader) loader.classList.remove('hidden');

    try {
        let worker = ocrWorker;
        if (!worker) {
            worker = await initOCRWorker();
        }

        let rawText = '';
        if (worker) {
            const result = await worker.recognize(imageSrc);
            rawText = result.data.text;
        } else {
            // Fallback direct recognize
            const result = await Tesseract.recognize(imageSrc, 'eng', {
                tessedit_pageseg_mode: '6'
            });
            rawText = result.data.text;
        }

        parseAndFillData(rawText);
    } catch (err) {
        console.error("OCR Pipeline Error:", err);
        alert("OCR error during recognition. Please check the image and type details manually.");
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

/**
 * Comprehensive String Sanitizer
 */
function cleanString(str) {
    if (!str) return '';
    return str
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'") // Normalize smart quotes
        .replace(/^[;:,.\-_~|Il!=>\s]+|[;:,.\-_~|Il!=>\s]+$/g, '') // Strip leading/trailing punctuation & OCR artefacts
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

/**
 * High-Accuracy Multi-Tier Regex Parser
 * Specially designed for Indian School & College ID Cards
 */
function parseAndFillData(rawText) {
    if (!rawText) return;

    // Split and clean non-empty lines
    const allLines = rawText.split('\n')
        .map(l => cleanString(l))
        .filter(l => l.length >= 2);

    rawDetectedLines = allLines;
    renderOcrDebugLines(allLines);

    let detectedSchool = '';
    let detectedName = '';
    let detectedSection = '';

    // Non-name/Non-school noise words to exclude
    const noiseRegex = /^(student\s*identity\s*card|identity\s*card|student\s*id|id\s*card|government\s*of|govt\s*of|dept\s*of|department\s*of|education|valid\s*upto|blood\s*group|dob|date\s*of\s*birth|emergency|contact|phone|mobile|cell|address|pin\s*code|pincode|academic\s*year|session)/i;

    // Filter lines that are purely symbol/number artifacts or generic headers
    const candidateLines = allLines.filter(l => !/^[0-9\s:.\-_/]+$/.test(l));

    // =========================================================================
    // 1. SCHOOL EXTRACTION
    // =========================================================================
    const schoolKeywords = [
        'matriculation', 'matric', 'higher secondary', 'hr sec', 'hr. sec', 'hr.sec', 'hss', 
        'ghss', 'g.h.s.s', 'h.s.s', 'vidyalaya', 'vidyashram', 'school', 'academy', 'high school', 
        'college', 'institution', 'institute', 'kendra', 'convent', 'central', 'international', 
        'public school', 'boys', 'girls', 'cbse', 'icse', 'state board', 'don bosco', 'st.', 
        'saint', 'bharathi', 'saraswathi', 'vivekananda', 'acharya', 'petit', 'mission', 
        'campus', 'dav', 'model', 'kendriya'
    ];

    // Priority A: Search lines containing key educational institution indicators
    for (let i = 0; i < candidateLines.length; i++) {
        const line = candidateLines[i];
        const lower = line.toLowerCase();

        // Must not be labeled as student name
        if (/^(name|student|std|class|sec|dob|blood)/i.test(lower)) continue;

        const hasKeyword = schoolKeywords.some(kw => lower.includes(kw));
        if (hasKeyword) {
            let cleaned = line
                .replace(/^(school\s*name|name\s*of\s*(the\s*)?school|institution|inst|school|col)\s*[:;\-=\.]\s*/gi, '')
                .replace(/,\s*(puducherry|pondicherry|chennai|tamil\s*nadu|pin|tel|ph|phone).*/gi, '')
                .replace(/\b\d{6}\b/g, ''); // Remove pincode
            cleaned = cleanString(cleaned);
            if (cleaned.length >= 4) {
                detectedSchool = cleaned;
                break;
            }
        }
    }

    // Priority B Fallback: Header lines near the top of the ID card
    if (!detectedSchool && candidateLines.length > 0) {
        for (let i = 0; i < Math.min(3, candidateLines.length); i++) {
            const line = candidateLines[i];
            const lower = line.toLowerCase();
            if (!noiseRegex.test(lower) && 
                !/^(name|student|std|class|sec|dob|roll|adm|blood)/i.test(lower) &&
                line.length >= 4 && line.length <= 60) {
                detectedSchool = cleanString(line);
                break;
            }
        }
    }

    // =========================================================================
    // 2. STUDENT NAME EXTRACTION
    // =========================================================================
    // Priority A: Explicit Label Matching (e.g. "Name : S. Pavithra", "Student Name - K. Raghavan")
    for (const line of candidateLines) {
        const lower = line.toLowerCase();

        if (lower.startsWith('name') || lower.includes('student name') || lower.includes('name of') || lower.includes('candidate name')) {
            // Must not be school name label
            if (lower.includes('school name') || lower.includes('institution name') || lower.includes('father') || lower.includes('mother')) continue;

            let cleaned = line.replace(/^(student('?s)?\s*name|name\s*of\s*(the\s*)?(student|candidate|pupil)|name\s*of\s*pupil|candidate\s*name|student\s*name|name|student)\s*[:;.\-~|=_>I1l\s]+/gi, '');
            
            // Remove common Indian salutations if present
            cleaned = cleaned.replace(/^(mr\.|ms\.|master|selvi|kumari|mrs\.)\s*/gi, '');
            cleaned = cleanString(cleaned);

            // Strip trailing metadata if glued on the same line (e.g. "S. PAVITHRA STD : XI")
            cleaned = cleaned.replace(/\s+(std|class|sec|dob|roll|adm|blood|group).*$/gi, '');
            cleaned = cleanString(cleaned);

            if (cleaned.length >= 2 && !/^(student|identity|card|school)/i.test(cleaned)) {
                detectedName = cleaned;
                break;
            }
        }
    }

    // Priority B Fallback: Look for Indian name patterns (Single/double initials + Name e.g., "S. PAVITHRA", "K. RAGHAVAN", "M. SANJAY")
    if (!detectedName) {
        for (const line of candidateLines) {
            const lower = line.toLowerCase();

            if (line === detectedSchool || noiseRegex.test(lower)) continue;
            if (/^(class|std|sec|grade|dob|blood|roll|adm|phone|mobile|group|stream|emergency|valid)/i.test(lower)) continue;

            // Pattern for name with initial (e.g., "S. PAVITHRA", "K. RAGHAVAN", "A. MOHAMMED RIYAZ", "D. SHARVESH", "ANANYA S")
            const isNamePattern = /^([A-Z]\.?\s+)+[A-Z][a-zA-Z\s]{2,25}$|^[A-Z][a-zA-Z\s]{2,25}\s+[A-Z]\.?$/i.test(line);
            
            if (isNamePattern && line.length >= 3 && line.length <= 32) {
                detectedName = cleanString(line);
                break;
            }
        }
    }

    // Priority C Fallback: First eligible non-metadata uppercase line
    if (!detectedName) {
        for (const line of candidateLines) {
            const lower = line.toLowerCase();
            if (line !== detectedSchool && 
                !noiseRegex.test(lower) &&
                !/^(class|std|sec|dob|blood|roll|adm|phone|mobile|emergency|address)/i.test(lower) &&
                line.length >= 3 && line.length <= 28) {
                detectedName = cleanString(line);
                break;
            }
        }
    }

    // =========================================================================
    // 3. STANDARD / SECTION EXTRACTION
    // =========================================================================
    // Priority A: Search inside labeled line
    for (const line of candidateLines) {
        const lower = line.toLowerCase();
        if (lower.includes('std') || lower.includes('class') || lower.includes('standard') || 
            lower.includes('grade') || lower.includes('sec') || lower.includes('section')) {
            
            // Extract using comprehensive regex
            // Supports: 11-A, XI-A, 10 B, 12th 'A', 12-BIO, 11-CS, IX - C, 10th - A1
            const match = line.match(/\b(1[0-2]|[1-9]|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?:ST|ND|RD|TH)?[\s\/\-\:\'\"]*([A-Za-z0-9]{1,3}|BIO|CS|MATHS|COMMERCE|COMP)\b/i);
            if (match) {
                detectedSection = `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
                break;
            }

            // Simple class extraction if no section glued
            let cleaned = line.replace(/^(std\s*(&|\/|\-)?\s*sec(tion)?|class\s*(&|\/|\-)?\s*sec(tion)?|standard|class|std|grade|sec(tion)?)\s*[:;.\-~|=_>I1l\s]+/gi, '');
            cleaned = cleanString(cleaned);
            if (cleaned.length >= 1 && cleaned.length <= 10) {
                detectedSection = cleaned.toUpperCase();
                break;
            }
        }
    }

    // Priority B: Scan entire raw text for Standalone Class/Sec format (e.g. "XI - A", "10-B", "12-A1", "IX-C")
    if (!detectedSection) {
        const globalMatch = rawText.match(/\b(1[0-2]|[1-9]|XII|XI|X|IX|VIII|VII|VI)(?:ST|ND|RD|TH)?[\s\/\-\:]+([A-D]|[A-D][1-9]|BIO|CS|MATHS)\b/i);
        if (globalMatch) {
            detectedSection = `${globalMatch[1].toUpperCase()}-${globalMatch[2].toUpperCase()}`;
        }
    }

    // Populate Fields Cleanly
    document.getElementById('inputStudentName').value = detectedName || '';
    document.getElementById('inputSchoolName').value = detectedSchool || '';
    document.getElementById('inputSection').value = detectedSection || '';

    // Update confidence badges
    const nameBadge = document.getElementById('nameConfidence');
    const schoolBadge = document.getElementById('schoolConfidence');
    const secBadge = document.getElementById('secConfidence');

    if (nameBadge) nameBadge.innerHTML = detectedName ? `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-check"></i> Detected</span>` : `<span class="text-amber-400 font-medium">Verify</span>`;
    if (schoolBadge) schoolBadge.innerHTML = detectedSchool ? `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-check"></i> Detected</span>` : `<span class="text-amber-400 font-medium">Verify</span>`;
    if (secBadge) secBadge.innerHTML = detectedSection ? `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-check"></i> Detected</span>` : `<span class="text-amber-400 font-medium">Verify</span>`;
}

/**
 * Display Raw OCR Lines in Debug Inspector with One-Click Insert
 */
function renderOcrDebugLines(lines) {
    const container = document.getElementById('rawOcrLines');
    if (!container) return;

    if (!lines || lines.length === 0) {
        container.innerHTML = '<span class="text-slate-500 italic">No text recognized from this frame.</span>';
        return;
    }

    container.innerHTML = '';
    lines.forEach((line, idx) => {
        const row = document.createElement('div');
        row.className = "flex items-center justify-between p-1.5 rounded hover:bg-slate-900 border border-transparent hover:border-slate-700 transition gap-2";
        row.innerHTML = `
            <span class="truncate text-slate-300 text-xs">${idx + 1}. ${escapeHtml(line)}</span>
            <div class="flex items-center space-x-1 shrink-0">
                <button type="button" onclick="setFieldFromOcr('inputStudentName', '${escapeHtml(line)}')" class="px-1.5 py-0.5 text-[10px] bg-indigo-900/60 hover:bg-indigo-700 text-indigo-300 rounded" title="Set as Student Name">Name</button>
                <button type="button" onclick="setFieldFromOcr('inputSchoolName', '${escapeHtml(line)}')" class="px-1.5 py-0.5 text-[10px] bg-cyan-900/60 hover:bg-cyan-700 text-cyan-300 rounded" title="Set as School Name">School</button>
                <button type="button" onclick="setFieldFromOcr('inputSection', '${escapeHtml(line)}')" class="px-1.5 py-0.5 text-[10px] bg-amber-900/60 hover:bg-amber-700 text-amber-300 rounded" title="Set as Section">Sec</button>
            </div>
        `;
        container.appendChild(row);
    });
}

function setFieldFromOcr(fieldId, value) {
    const el = document.getElementById(fieldId);
    if (el) {
        el.value = value;
        el.focus();
    }
}

function toggleOcrDebug() {
    const panel = document.getElementById('ocrDebugPanel');
    const icon = document.getElementById('ocrDebugIcon');
    if (!panel) return;

    const isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        if (icon) icon.className = "fa-solid fa-chevron-up text-xs transition-transform";
    } else {
        panel.classList.add('hidden');
        if (icon) icon.className = "fa-solid fa-chevron-down text-xs transition-transform";
    }
}

/**
 * Save Student Attendance Record
 */
function saveStudentRecord(e) {
    e.preventDefault();
    const name = cleanString(document.getElementById('inputStudentName').value);
    const school = cleanString(document.getElementById('inputSchoolName').value);
    const section = cleanString(document.getElementById('inputSection').value);

    if (!name || !school) {
        alert("Please enter both Student Name and School Name.");
        return;
    }

    const record = {
        id: Date.now(),
        name,
        school,
        section: section || 'N/A',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    studentLogs.unshift(record);
    saveToStorage();

    const currentSchoolCount = studentLogs.filter(s => s.school.toLowerCase() === school.toLowerCase()).length;
    const toast = document.getElementById('schoolToast');
    if (toast) {
        toast.className = "p-4 rounded-xl border bg-emerald-950 border-emerald-700 text-emerald-300 block shadow-lg toast-animate";
        toast.innerHTML = `
            <div class="flex items-center space-x-3">
                <i class="fa-solid fa-circle-check text-emerald-400 text-2xl"></i>
                <div>
                    <p class="text-white font-bold">${escapeHtml(name)} Saved Successfully!</p>
                    <p class="text-xs text-emerald-300 font-semibold mt-0.5">${escapeHtml(school)} Total: <span class="text-amber-300 font-black text-sm">${currentSchoolCount} Students</span> recorded so far.</p>
                </div>
            </div>
        `;
    }

    resetForm();
}

/**
 * Delete Individual Student Record
 */
function deleteStudent(id) {
    const target = studentLogs.find(s => s.id === id);
    if (!target) return;

    if (confirm(`Are you sure you want to delete "${target.name}" from ${target.school}?`)) {
        studentLogs = studentLogs.filter(s => s.id !== id);
        saveToStorage();
    }
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(studentLogs));
    updateDashboard();
}

function resetForm() {
    const form = document.getElementById('attendanceForm');
    if (form) form.reset();
    const nameBadge = document.getElementById('nameConfidence');
    const schoolBadge = document.getElementById('schoolConfidence');
    const secBadge = document.getElementById('secConfidence');
    if (nameBadge) nameBadge.innerHTML = '';
    if (schoolBadge) schoolBadge.innerHTML = '';
    if (secBadge) secBadge.innerHTML = '';
}

/**
 * Update Dashboard KPIs & Tables
 */
function updateDashboard(filterQuery = '') {
    const query = filterQuery.toLowerCase().trim();
    const filteredStudents = studentLogs.filter(s => 
        s.name.toLowerCase().includes(query) || s.school.toLowerCase().includes(query) || (s.section && s.section.toLowerCase().includes(query))
    );

    // Aggregate Schools
    const schoolMap = {};
    studentLogs.forEach(s => {
        const key = s.school.trim();
        schoolMap[key] = (schoolMap[key] || 0) + 1;
    });

    const schoolSummary = Object.keys(schoolMap).map(k => ({
        school: k,
        count: schoolMap[k]
    })).sort((a, b) => b.count - a.count);

    // Stat Cards
    const totalStudentsEl = document.getElementById('statTotalStudents');
    const totalSchoolsEl = document.getElementById('statTotalSchools');
    const topSchoolEl = document.getElementById('statTopSchool');
    const badgeSchool = document.getElementById('badgeSchoolCount');
    const badgeStudent = document.getElementById('badgeStudentCount');

    if (totalStudentsEl) totalStudentsEl.innerText = studentLogs.length;
    if (totalSchoolsEl) totalSchoolsEl.innerText = schoolSummary.length;
    if (topSchoolEl) topSchoolEl.innerText = schoolSummary.length > 0 ? `${schoolSummary[0].school} (${schoolSummary[0].count})` : '-';
    if (badgeSchool) badgeSchool.innerText = schoolSummary.length;
    if (badgeStudent) badgeStudent.innerText = studentLogs.length;

    // School Summary Table
    const schoolTbody = document.getElementById('schoolTableBody');
    const emptySchoolMsg = document.getElementById('emptySchoolMsg');
    if (schoolTbody) {
        schoolTbody.innerHTML = '';
        if (schoolSummary.length === 0) {
            if (emptySchoolMsg) emptySchoolMsg.classList.remove('hidden');
        } else {
            if (emptySchoolMsg) emptySchoolMsg.classList.add('hidden');
            schoolSummary.forEach((item, idx) => {
                const row = document.createElement('tr');
                row.className = "hover:bg-slate-700/30 transition border-b border-slate-700/40";
                row.innerHTML = `
                    <td class="p-3 text-slate-500 font-bold">${idx + 1}</td>
                    <td class="p-3 font-semibold text-slate-200">${escapeHtml(item.school)}</td>
                    <td class="p-3 text-right">
                        <span class="inline-block bg-indigo-950 border border-indigo-700 text-indigo-300 font-bold px-2.5 py-1 rounded-lg text-xs">
                            ${item.count} Students
                        </span>
                    </td>
                `;
                schoolTbody.appendChild(row);
            });
        }
    }

    // Student Log Table
    const studentTbody = document.getElementById('studentTableBody');
    const emptyStudentMsg = document.getElementById('emptyStudentMsg');
    if (studentTbody) {
        studentTbody.innerHTML = '';
        if (filteredStudents.length === 0) {
            if (emptyStudentMsg) emptyStudentMsg.classList.remove('hidden');
        } else {
            if (emptyStudentMsg) emptyStudentMsg.classList.add('hidden');
            filteredStudents.forEach((item, idx) => {
                const row = document.createElement('tr');
                row.className = "hover:bg-slate-700/30 transition border-b border-slate-700/40";
                row.innerHTML = `
                    <td class="p-3 text-slate-500 font-bold">${idx + 1}</td>
                    <td class="p-3 font-semibold text-slate-200">${escapeHtml(item.name)}</td>
                    <td class="p-3 text-slate-400">${escapeHtml(item.school)}</td>
                    <td class="p-3 text-cyan-300 font-mono">${escapeHtml(item.section)}</td>
                    <td class="p-3 text-slate-500 text-xs">${escapeHtml(item.timestamp)}</td>
                    <td class="p-3 text-center">
                        <button onclick="deleteStudent(${item.id})" class="text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 p-1.5 rounded-md transition" title="Delete Student Record">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                `;
                studentTbody.appendChild(row);
            });
        }
    }
}

function filterLogs(e) {
    updateDashboard(e.target.value);
}

/**
 * Tab Switching: Schools vs Students
 */
function switchDashboardTab(tab) {
    const tabSchools = document.getElementById('tabSchools');
    const tabStudents = document.getElementById('tabStudents');
    const tabBtnSchools = document.getElementById('tabBtnSchools');
    const tabBtnStudents = document.getElementById('tabBtnStudents');

    if (tab === 'schools') {
        if (tabSchools) tabSchools.classList.remove('hidden');
        if (tabStudents) tabStudents.classList.add('hidden');
        if (tabBtnSchools) tabBtnSchools.className = "py-2 px-3.5 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white transition flex items-center gap-2";
        if (tabBtnStudents) tabBtnStudents.className = "py-2 px-3.5 rounded-lg font-bold text-xs uppercase tracking-wider bg-transparent text-slate-400 hover:text-white transition flex items-center gap-2";
    } else {
        if (tabSchools) tabSchools.classList.add('hidden');
        if (tabStudents) tabStudents.classList.remove('hidden');
        if (tabBtnSchools) tabBtnSchools.className = "py-2 px-3.5 rounded-lg font-bold text-xs uppercase tracking-wider bg-transparent text-slate-400 hover:text-white transition flex items-center gap-2";
        if (tabBtnStudents) tabBtnStudents.className = "py-2 px-3.5 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white transition flex items-center gap-2";
    }
}

/**
 * Export PDF Report
 */
function exportToPDF() {
    if (studentLogs.length === 0) {
        alert("No student records available to export!");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("Science Expo - Student Attendance Report", 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()} | Total Students: ${studentLogs.length}`, 14, 28);

    const schoolMap = {};
    studentLogs.forEach(s => {
        const key = s.school.trim();
        schoolMap[key] = (schoolMap[key] || 0) + 1;
    });
    const schoolSummary = Object.keys(schoolMap).map(k => [k, schoolMap[k].toString()]).sort((a, b) => b[1] - a[1]);

    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text("1. School-Wise Summary Breakdown", 14, 38);

    doc.autoTable({
        startY: 42,
        head: [['School Name', 'Total Students']],
        body: schoolSummary,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] }
    });

    const finalY = doc.lastAutoTable.finalY || 100;
    doc.setFontSize(13);
    doc.text("2. Complete Student Attendance Log", 14, finalY + 12);

    const studentRows = studentLogs.map((s, i) => [i + 1, s.name, s.school, s.section, s.timestamp]);

    doc.autoTable({
        startY: finalY + 16,
        head: [['#', 'Student Name', 'School Name', 'Section', 'Time']],
        body: studentRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59] }
    });

    doc.save(`Science_Expo_Report_${Date.now()}.pdf`);
}

/**
 * Clear All Data
 */
function clearAllData() {
    if (confirm("Are you sure you want to delete ALL records? This cannot be undone.")) {
        studentLogs = [];
        localStorage.removeItem(STORAGE_KEY);
        updateDashboard();
        const toast = document.getElementById('schoolToast');
        if (toast) toast.classList.add('hidden');
    }
}

// Initialization on DOM Load
window.addEventListener('DOMContentLoaded', () => {
    initializeCamera();
    initOCRWorker();
    updateDashboard();
});