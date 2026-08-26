 import fs from 'fs';
import path from 'path';
import https from 'https';

const MODEL_DIR = path.join(process.cwd(), 'models', 'qwen2.5-1.5b');
const MODEL_FILE = path.join(MODEL_DIR, 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf');

// HuggingFace direct download URL for Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
const MODEL_URL =
  'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf';

export async function downloadModelIfNeeded(): Promise<string> {
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }

  if (fs.existsSync(MODEL_FILE)) {
    const stats = fs.statSync(MODEL_FILE);
    // Qwen2.5-1.5B Q4_K_M is ~1.0 - 1.1 GB (approx 1,100,000,000 bytes)
    if (stats.size > 900 * 1024 * 1024) {
      console.log(`✅ Model already present at ${MODEL_FILE} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      return MODEL_FILE;
    } else {
      console.warn(`Incomplete model file detected (${stats.size} bytes). Re-downloading...`);
      fs.unlinkSync(MODEL_FILE);
    }
  }

  console.log(`Downloading Qwen2.5-1.5B-Instruct Q4_K_M model from HuggingFace...`);
  console.log(`URL: ${MODEL_URL}`);
  console.log(`Destination: ${MODEL_FILE}`);

  return new Promise((resolve, reject) => {
    const downloadWithRedirects = (url: string) => {
      https
        .get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
            const redirectUrl = res.headers.location;
            if (redirectUrl) {
              console.log(`Redirecting to ${redirectUrl}...`);
              downloadWithRedirects(redirectUrl);
              return;
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Failed to download model: HTTP status ${res.statusCode}`));
            return;
          }

          const totalSize = parseInt(res.headers['content-length'] || '0', 10);
          let downloadedSize = 0;
          let lastReportedPercent = -1;

          const fileStream = fs.createWriteStream(MODEL_FILE);

          res.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (totalSize > 0) {
              const percent = Math.floor((downloadedSize / totalSize) * 100);
              if (percent % 10 === 0 && percent !== lastReportedPercent) {
                lastReportedPercent = percent;
                console.log(
                  `Download progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)} MB / ${(totalSize / 1024 / 1024).toFixed(1)} MB)`
                );
              }
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            console.log(`✅ Download complete! Saved to ${MODEL_FILE}`);
            resolve(MODEL_FILE);
          });

          fileStream.on('error', (err) => {
            fs.unlink(MODEL_FILE, () => {});
            reject(err);
          });
        })
        .on('error', (err) => {
          reject(err);
        });
    };

    downloadWithRedirects(MODEL_URL);
  });
}

if (process.argv[1]?.includes('download-model')) {
  downloadModelIfNeeded()
    .then((filePath) => {
      console.log(`Model verification successful: ${filePath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Model download failed:', err);
      process.exit(1);
    });
}
