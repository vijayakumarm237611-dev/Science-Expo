# 🔬 Science Expo Student ID Card Scanner & Real-Time Analytics Dashboard

A complete, responsive, cross-platform Universal Web Application that runs seamlessly on **Mobile (Android/iOS via Camera)** and **PC (Web/Desktop via Webcam/File Upload)** with zero installation.

---

## 🚀 Key Features

### 1. Section 1: Live Scanner & Camera Feed
- **Live Video Viewfinder**: Direct WebRTC stream (`navigator.mediaDevices.getUserMedia`) with support for environment (rear) & user (front) cameras.
- **Dynamic Bounding Reticle**: Cyber cyan/emerald scanner targeting frame with animated laser scanline and guidance overlay (`[ BRING ID CARD TO THE FRONT FOR SCANNING ]`).
- **Real-time OCR Vision Pipeline**: Powered by client-side Tesseract.js v5 with canvas image pre-processing (contrast enhancement & binarization) for crisp text capture.
- **Intelligent Regex Extraction**:
  - `NAME`: Isolates names with initials (e.g. `S. PAVITHRA`, `R. ARAVIND`).
  - `SCHOOL NAME`: Detects keywords like `HSS`, `Vidyalaya`, `Matriculation`, `Convent`, `Seminaire`, `Academy`, etc. (e.g. `AMALORPAVAM HSS`).
  - `STANDARD / SECTION`: Recognizes formats like `11-B`, `10-A`, `12-C`, `XI-B`.
  - `ROLL / REG NO`: Automatically captures registration/roll identifiers.
- **Real-time Parsed Badges**: Visual badges with green checkmarks: `[✓ NAME: S. PAVITHRA]` `[✓ SCHOOL: AMALORPAVAM HSS]` `[✓ SECTION: 11-B]`.
- **Audio Feedback**: Synthesized Web Audio API sound FX for scan recognition & saving confirmations.

### 2. Section 2: Verification & Instant School Counter
- **Editable Auto-Filled Form**: Student Name, School Name (with dynamic datalist auto-completion), Standard/Section, Roll No.
- **Instant Aggregated School Counter**: Real-time toast celebration banner notifying:  
  `"Entry Saved! Amalorpavam HSS Total: X Students attended so far."` with confetti celebration!
- **Quick Demo ID Preset Simulator**: Test all scanner and recognition features with one click without needing a physical ID card on hand.

### 3. Section 3: Analytics Dashboard & PDF Dossier Export
- **Metric KPI Cards**: Total Students Logged, Total Distinct Schools, Most Represented School, Last Recorded Entry.
- **School-wise Breakdown Table**: Ranked institutions with real-time percentage share calculation and visual multi-segment distribution bar.
- **Dynamic Searchable Attendance Log**: Instant search filtering by name, school, class, or roll number with individual delete controls.
- **Professional PDF Dossier Generator**: Uses `jsPDF` + `jspdf-autotable` to produce formatted, multi-page attendance reports with custom headers, KPI boxes, school breakdown tables, and full student rosters.
- **CSV Data Export**: Instant spreadsheet download.

---

## 💻 How to Run Locally

### Option A: Direct Open
Simply double-click `index.html` in Chrome, Microsoft Edge, Brave, Safari, or Firefox.

### Option B: Local HTTP Server (Recommended for Mobile Testing over WiFi)
Run a simple HTTP server from this directory:
```bash
# Using Python
python -m http.server 8000

# Or using Node.js
npx serve .
```
Then open:
- On your PC: `http://localhost:8000`
- On your Phone (connected to same Wi-Fi): `http://<YOUR_PC_LOCAL_IP>:8000`
