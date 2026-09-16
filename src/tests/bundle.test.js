import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

let envLocalContent = '';
if (fs.existsSync('.env.local')) {
  envLocalContent = fs.readFileSync('.env.local', 'utf8');
}

// Extraer sin imprimir y remover comillas (simples o dobles)
function extractKey(envStr, keyName) {
  const regex = new RegExp(`^${keyName}=(.*)$`, 'm');
  const match = envStr.match(regex);
  if (match) {
    let val = match[1].trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    return val;
  }
  return null;
}

const localSrk = extractKey(envLocalContent, 'SUPABASE_SERVICE_ROLE_KEY');
if (localSrk && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = localSrk;
}

const localSk = extractKey(envLocalContent, 'SUPABASE_SECRET_KEY');
if (localSk && !process.env.SUPABASE_SECRET_KEY) {
  process.env.SUPABASE_SECRET_KEY = localSk;
}

function findInDir(dir, filter, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filename = path.join(dir, file);
    const stat = fs.lstatSync(filename);
    if (stat.isDirectory()) {
      findInDir(filename, filter, fileList);
    } else if (filter.test(filename)) {
      fileList.push(filename);
    }
  }
  return fileList;
}

describe('Bundle check', () => {
  it('does not leak SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY values in client chunks', () => {
    const nextStaticDir = path.join(process.cwd(), '.next', 'static');
    if (!fs.existsSync(nextStaticDir)) {
      expect.fail('No .next/static directory found. Please run "npm run build" before tests.');
    }

    const jsFiles = findInDir(nextStaticDir, /\.js$/);
    if (jsFiles.length === 0) {
      expect.fail('No JS chunks found in .next/static. Build might be corrupted.');
    }
    
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(content).not.toContain('SUPABASE_SECRET_KEY');
      
      if (serviceRoleKey && serviceRoleKey.length > 10) {
        if (content.includes(serviceRoleKey)) {
          expect.fail(`Client chunk ${path.basename(file)} leaked the ACTUAL VALUE of the service role key!`);
        }
      }
      if (secretKey && secretKey.length > 10) {
        if (content.includes(secretKey)) {
          expect.fail(`Client chunk ${path.basename(file)} leaked the ACTUAL VALUE of the secret key!`);
        }
      }
    }
  });
});
