import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
const envLocal = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const matchSrk = envLocal.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m);
if (matchSrk && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = matchSrk[1];
}
const matchSk = envLocal.match(/^SUPABASE_SECRET_KEY=(.*)$/m);
if (matchSk && !process.env.SUPABASE_SECRET_KEY) {
  process.env.SUPABASE_SECRET_KEY = matchSk[1];
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
        const containsValue = content.includes(serviceRoleKey);
        if (containsValue) {
          expect.fail(`Client chunk ${path.basename(file)} leaked the ACTUAL VALUE of the service role key!`);
        }
      }
      if (secretKey && secretKey.length > 10) {
        const containsValue = content.includes(secretKey);
        if (containsValue) {
          expect.fail(`Client chunk ${path.basename(file)} leaked the ACTUAL VALUE of the secret key!`);
        }
      }
    }
  });
});
