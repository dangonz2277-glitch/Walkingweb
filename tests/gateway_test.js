import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Utilizaremos la función del código original para poder crear cookies válidas para el test.
import crypto from 'crypto';

// Re-implementar la firma de sesión para crear la cookie caducada
async function signSessionTest(payload, secretStr) {
  const encoder = new TextEncoder();
  const key = await crypto.webcrypto.subtle.importKey(
    'raw', encoder.encode(secretStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const payloadStr = JSON.stringify(payload); 
  const data = encoder.encode(payloadStr);
  const signature = await crypto.webcrypto.subtle.sign('HMAC', key, data);
  
  const payloadB64 = btoa(String.fromCharCode(...new Uint8Array(data))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${payloadB64}.${signatureHex}`;
}

const PORT = 3105;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const env = { 
  ...process.env, 
  SITE_PASSWORD: 'test-password', 
  SITE_SESSION_SECRET: 'super-secret-key-that-is-at-least-32-chars-long' 
};

function fetchHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        data
      }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function waitServerReady(url, maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetchHttp(url);
      if (res.status === 200 || res.status === 307 || res.status === 500) return true;
    } catch {
      // Ignorar errores de red temporales
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`El servidor no respondió a tiempo en ${url}`);
}

// Búsqueda exhaustiva de cadenas en los chunks públicos
function searchInChunks(dir, stringsToFind) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchInChunks(fullPath, stringsToFind);
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const str of stringsToFind) {
        if (content.includes(str)) {
          throw new Error(`Se encontró el dato prohibido "${str}" en el chunk público ${fullPath}`);
        }
      }
    }
  }
}

async function runTests() {
  console.log(`Iniciando servidor Next.js de prueba en puerto ${PORT}...`);
  
  let serverProc, missingSecretProc;
  try {
    serverProc = spawn('./node_modules/.bin/next', ['start', '-H', '127.0.0.1', '-p', PORT.toString()], {
      env,
      stdio: 'ignore'
    });
  } catch(e) {
    console.error("Fallo al iniciar next:", e);
    process.exit(1);
  }

  let failures = [];
  function assert(condition, message) {
    if (!condition) {
      failures.push(message);
      console.error(`❌ FALLO: ${message}`);
    } else {
      console.log(`✅ ${message}`);
    }
  }

  try {
    await waitServerReady(`${BASE_URL}/login`);
    console.log('Servidor listo. Ejecutando pruebas...');

    // 1. Acceso anónimo
    let res = await fetchHttp(`${BASE_URL}/`);
    assert(res.status === 307 && res.headers.location?.includes('/login'), 'Acceso anónimo redirige a /login');

    // 2. Ruta profunda
    res = await fetchHttp(`${BASE_URL}/alguna-ruta/secreta`);
    assert(res.status === 307, 'Ruta profunda anónima redirigida a login.');

    // 3. Cookies malformadas
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': 'site_session=inventado.1234' } });
    assert(res.status === 307, 'Cookie falsa rechazada (307).');

    // Cookie caducada firmada válidamente
    const expiredPayload = { auth: true, exp: Date.now() - 10000 };
    const expiredCookie = await signSessionTest(expiredPayload, env.SITE_SESSION_SECRET);
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': `site_session=${expiredCookie}` } });
    assert(res.status === 307, 'Cookie firmada válidamente pero expirada rechazada (307).');

    // 4. Chunk públicos
    res = await fetchHttp(`${BASE_URL}/login`);
    const chunkMatches = [...res.data.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)];
    if (chunkMatches.length > 0) {
      let chunkRes = await fetchHttp(`${BASE_URL}${chunkMatches[0][1]}`);
      assert(chunkRes.status === 200, 'Chunk de la app es público sin sesión');
    }

    // 5. Verificación de chunks libres de catálogo
    try {
      searchInChunks(path.join(process.cwd(), '.next', 'static', 'chunks'), ['WP510B4', '"WalkingPad"']);
      assert(true, 'Los chunks JS no exponen datos privados del catálogo.');
    } catch (e) {
      assert(false, e.message);
    }

    // 6. Login incorrecto
    const badLoginBody = new URLSearchParams({ password: 'bad' }).toString();
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': badLoginBody.length },
      body: badLoginBody
    });
    assert(res.status === 303 && res.headers.location === '/login?error=1', 'Login incorrecto redirige a /login?error=1');

    // 6.5. Login y host
    const goodLoginBody = new URLSearchParams({ password: 'test-password' }).toString();
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': goodLoginBody.length },
      body: goodLoginBody
    });
    assert(res.headers.location === '/', 'Login redirige con Location relativa a raíz');
    const setCookieHeader = res.headers['set-cookie'] || [];
    const sessionCookieStr = setCookieHeader.find(c => c.startsWith('site_session='));
    const sessionCookie = sessionCookieStr ? sessionCookieStr.split(';')[0] : '';

    // 7. Acceso autorizado
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': sessionCookie } });
    assert(res.status === 200, 'Acceso autorizado correcto');
    
    // Contar exactamente los 42 productos base (evitando "Problemas generales")
    const productTitles = [...res.data.matchAll(/class="card-title"/g)].length;
    assert(productTitles === 42, `El catálogo debe renderizar 42 modelos. Encontrados: ${productTitles}`);
    
    // Ignorar comentarios de hidratación de React y comprobar el string final
    const rawData = res.data.replace(/<!-- -->/g, '');
    assert(rawData.includes('42 productos'), 'El span contabilizador final marca 42 productos.');

    // 8. Logout borra cookie cliente pero es JWT
    res = await fetchHttp(`${BASE_URL}/api/logout`, { method: 'POST', headers: { 'Cookie': sessionCookie } });
    const logoutCookieStr = (res.headers['set-cookie'] || []).find(c => c.startsWith('site_session='));
    assert(logoutCookieStr && (logoutCookieStr.includes('Max-Age=0') || logoutCookieStr.includes('Expires=')), 'Logout borra la cookie del navegador.');

    // Demostrar JWT sin estado: la cookie capturada aún sirve
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': sessionCookie } });
    assert(res.status === 200, 'Comprobación de sesión sin estado: copia de cookie no se anula (requiere rotación de secreto).');

    // 9. Secreto ausente
    console.log('Levantando servidor alternativo sin secreto en puerto 3106...');
    const PORT_BAD = 3106;
    const badEnv = { ...process.env, SITE_PASSWORD: 'test-password', SITE_SESSION_SECRET: '' };
    missingSecretProc = spawn('./node_modules/.bin/next', ['start', '-H', '127.0.0.1', '-p', PORT_BAD.toString()], {
      env: badEnv,
      stdio: 'ignore'
    });
    await waitServerReady(`http://127.0.0.1:${PORT_BAD}/login`);
    
    res = await fetchHttp(`http://127.0.0.1:${PORT_BAD}/`, { headers: { 'Cookie': sessionCookie } });
    assert(res.status === 500, `Servidor sin SITE_SESSION_SECRET rechaza en 500 (fue ${res.status}).`);

  } catch (err) {
    failures.push(`Excepción fatal: ${err.message}`);
    console.error(`❌ ERROR: ${err.message}`);
  } finally {
    console.log('Limpiando procesos...');
    if (serverProc) serverProc.kill();
    if (missingSecretProc) missingSecretProc.kill();
  }
  
  if (failures.length > 0) {
    console.error(`\nFallaron ${failures.length} pruebas.`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ Tests de pasarela completados con éxito.');
    process.exitCode = 0;
  }
}

runTests();
