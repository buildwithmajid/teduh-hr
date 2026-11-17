import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseEnv } from 'util';

// Jest memberi tiap test salinan process.env sendiri, sehingga process.loadEnvFile()
// tidak terlihat dari test. Isi .env diparse lalu disalin ke process.env sandbox.
const file = join(__dirname, '..', '.env');
if (existsSync(file)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
