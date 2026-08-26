# Healthcare Discharge Instructions Generator

An intelligent healthcare application designed to process clinical discharge documentation, extract authoritative patient data, run hybrid AI clinical safety audits, and generate clear, structured, multilingual discharge instructions.

## 1. Project Overview

The **Healthcare Discharge Instructions Generator** transforms raw medical discharge summaries (PDF or plain text) into validated, user-friendly discharge instructions. It combines cloud-based Google Gemini models (`gemini-3.6-flash`) for clinical extraction and safety auditing with optional local GGUF model execution (`Qwen2.5-1.5B`) via `node-llama-cpp`.

### Key Features
- **PDF & Text Extraction**: Parses uploaded clinical PDFs using `pdf-parse` and optical character recognition (`tesseract.js` / optional PaddleOCR).
- **Hybrid AI Audit**: Cross-checks generated instructions against source clinical text for hallucinations or omitted critical care instructions.
- **Multilingual Support**: Generates instructions in English, Spanish, and other supported languages.
- **Offline / Edge Support**: Supports local GGUF quantized models (`Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`) for private, offline clinical data extraction.
- **PDF Generation**: Renders formatted patient discharge instruction PDFs directly via `jspdf` and server-side PDF generators.

---

## 2. Architecture

```
[ Client Interface (React 19 + Vite + Tailwind CSS) ]
                         │
                         ▼
[ Express API Server (server.ts / tsx watch) ]
    │                      │                      │
    ▼                      ▼                      ▼
[ Document Source ]   [ Extraction ]         [ AI Audit ]
  - pdf-parse           - Gemini API           - Hybrid Validator
  - Tesseract.js        - Node Llama C++       - Evidence Matcher
  - (Optional Python)     (Qwen2.5 GGUF)
```

---

## 3. Prerequisites

### Required Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Git**: For cloning the repository

### Optional / Recommended Prerequisites
- **Gemini API Key**: Required for online AI extraction & hybrid auditing (free tier available at [Google AI Studio](https://aistudio.google.com/)).
- **C/C++ Build Tools**: (Windows Build Tools / `build-essential` on Linux) Optional for compiling native `node-llama-cpp` bindings if running the local GGUF extraction engine.
- **Python**: v3.9+ (Optional — only required if using the PaddleOCR fallback engine).

---

## 4. Clone Repository

### Windows PowerShell
```powershell
git clone https://github.com/your-org/healthcare-discharge-instructions-generator.git
cd healthcare-discharge-instructions-generator
```

### Linux / macOS
```bash
git clone https://github.com/your-org/healthcare-discharge-instructions-generator.git
cd healthcare-discharge-instructions-generator
```

---

## 5. Dependency Installation

To ensure exact, reproducible dependency installations across machines, use `npm ci` rather than `npm install`:

### Windows PowerShell & Linux/macOS
```bash
npm ci
```

---

## 6. Python Environment Setup (Optional)

> [!NOTE]
> Python is **optional**. The system uses `tesseract.js` for OCR by default. Python is only invoked if you explicitly choose to run the optional PaddleOCR fallback.

If you wish to enable PaddleOCR support:

### Windows PowerShell
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install paddleocr paddlepaddle
```

### Linux / macOS
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install paddleocr paddlepaddle
```

---

## 7. Node.js Setup

The project uses Node.js with Vite and TypeScript (`tsx`).

- **Runtime Engine**: Express server on Node.js (`server.ts`).
- **Frontend Stack**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Framer Motion.
- **Dependency Management**: Dependencies are fully declared in `package.json` and locked in `package-lock.json`.

To verify your Node environment setup:
```bash
node -v
npm -v
```

---

## 8. Environment Configuration

1. Copy `.env.example` to create your local `.env` configuration file:

### Windows PowerShell
```powershell
Copy-Item .env.example .env
```

### Linux / macOS
```bash
cp .env.example .env
```

2. Open `.env` and configure your environment variables:

| Variable | Type | Required / Optional | Description | Default / Example |
| :--- | :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | String | **Required** for Cloud AI | Google Gemini API Key | `AIzaSy...` |
| `GEMINI_MODEL` | String | Optional | Cloud Gemini model identifier | `gemini-3.6-flash` |
| `PORT` | Number | Optional | Express server HTTP port | `3000` |
| `NODE_ENV` | String | Optional | Environment mode (`development` / `production`) | `development` |
| `APP_URL` | String | Optional | App base URL | `http://localhost:3000` |

> [!IMPORTANT]
> Never commit your real `GEMINI_API_KEY` or `.env` file to Git.

---

## 9. External Services & Model Files Setup

### Model Files (Local GGUF Model)
- **Engine**: `node-llama-cpp`
- **Model**: `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` (~1.1 GB)
- **Expected Directory**: `models/qwen2.5-1.5b/`
- **Status**: **Optional** (used for local offline clinical data extraction). If not present, the system defaults to Gemini Cloud API.

To download the local GGUF model automatically:
```bash
npm run download-model
```

---

## 10. Backend Startup

In development mode, `npm run dev` starts the Express API server with Vite middleware attached.

### Windows PowerShell & Linux/macOS
```bash
npm run dev
```

The backend server will start at `http://localhost:3000`.

---

## 11. Frontend Startup

Because Vite is integrated into the Express server during development, running `npm run dev` serves both the backend API and the React frontend on `http://localhost:3000`.

Open your browser and navigate to:
```text
http://localhost:3000
```

---

## 12. Docker Setup (Optional)

If containerization is desired:

```bash
docker build -t healthcare-discharge-generator .
docker run -p 3000:3000 --env-file .env healthcare-discharge-generator
```

---

## 13. API Endpoints

| Method | Endpoint | Description | Payload / Query |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Health check endpoint | N/A |
| `GET` | `/api/ai-status` | Checks Gemini API connectivity | N/A |
| `GET` | `/api/extraction-status` | Checks Qwen GGUF local model status | N/A |
| `POST` | `/api/extract` | Upload PDF & extract clinical structured data | Form Data (`file`) |
| `POST` | `/api/generate` | Generate patient discharge instructions | JSON (`extractedData`) |
| `POST` | `/api/audit` | Run hybrid safety audit on generated instructions | JSON (`doc`, `instructions`) |
| `POST` | `/api/generate-approved-pdf` | Download formatted discharge PDF | Form Data / JSON (`payload`) |

---

## 14. Testing

Run the full automated test suite (includes clinical extraction benchmarks, PDF parser tests, and API integration tests):

### Windows PowerShell & Linux/macOS
```bash
npm test
```

To run TypeScript type checks:
```bash
npm run lint
```

---

## 15. Production Build

To build the application for production deployment:

### Step 1: Compile Vite assets and Server Bundle
```bash
npm run build
```

This creates static frontend assets in `dist/` and the bundled Express server in `dist/server.cjs`.

### Step 2: Start Production Server
```bash
npm run start
```

---

## 16. Troubleshooting

- **`GEMINI_API_KEY` missing**: Ensure `.env` is created from `.env.example` and contains a valid API key from AI Studio.
- **Port 3000 already in use**: Change `PORT=3001` in your `.env` file.
- **Local GGUF model load error**: Run `npm run download-model` to ensure `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` is completely downloaded in `models/qwen2.5-1.5b/`.
- **Module build error**: Run `npm run clean` then `npm ci`.

---

## 17. Project Structure

```text
healthcare-discharge-instructions-generator/
├── .env.example              # Configuration template
├── .gitignore                # Git ignore patterns
├── README.md                 # Complete documentation
├── index.html                # HTML entry point
├── package.json              # Node.js dependencies and scripts
├── package-lock.json         # Locked dependency tree
├── server.ts                 # Express + Vite server entry point
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite bundler configuration
│
├── models/                   # Local GGUF models (git ignored)
│   └── qwen2.5-1.5b/
│       └── Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
│
├── server/                   # Backend Express Services & Routes
│   ├── ai/                   # Gemini AI integration
│   ├── audit/                # Hybrid clinical audit engine
│   ├── repositories/         # Storage / document repository
│   ├── routes/               # Express API router (/api/...)
│   ├── scripts/              # Helper scripts (download-model.ts)
│   ├── services/             # Extraction, PDF, and OCR services
│   └── tests/                # Test suites & benchmark scripts
│
└── src/                      # React 19 Frontend
    ├── App.tsx               # Main React Application
    ├── main.tsx              # React mounting entry point
    ├── components/           # UI components
    ├── pages/                # Page layouts & workflows
    ├── types/                # TypeScript type definitions
    └── utils/                # Frontend helper functions
```
