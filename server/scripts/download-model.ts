import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MODEL_SHA256 = '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e';
export const MODEL_REVISION = '91cad51170dc346986eccefdc2dd33a9da36ead9';
const MODEL_FILE = path.resolve('models/qwen2.5-1.5b/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf');
const MODEL_URL = `https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/${MODEL_REVISION}/qwen2.5-1.5b-instruct-q4_k_m.gguf`;
export async function sha256File(filename: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
export async function downloadModelIfNeeded(): Promise<string> {
  fs.mkdirSync(path.dirname(MODEL_FILE), { recursive: true });
  if (fs.existsSync(MODEL_FILE) && await sha256File(MODEL_FILE) === MODEL_SHA256) return MODEL_FILE;
  const temporary = MODEL_FILE + '.' + randomUUID() + '.part';
  try {
    const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error('Model download failed with HTTP ' + response.status);
    const hash = createHash('sha256');
    await pipeline(Readable.fromWeb(response.body as any), new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); } }), fs.createWriteStream(temporary, { flags: 'wx' }));
    if (hash.digest('hex') !== MODEL_SHA256) throw new Error('Model checksum mismatch; existing model was preserved.');
    fs.renameSync(temporary, MODEL_FILE);
    return MODEL_FILE;
  } finally { fs.rmSync(temporary, { force: true }); }
}
if (process.argv[1]?.endsWith('download-model.ts')) {
  downloadModelIfNeeded().then(() => console.log('Pinned model SHA-256 verified.')).catch(error => { console.error(error.message); process.exitCode = 1; });
}
