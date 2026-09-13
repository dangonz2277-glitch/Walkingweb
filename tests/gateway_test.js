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
  SITE_SESSION_SECRET: 'super-secret-key-that-is-at-least-32-chars-long',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  RATE_LIMIT_WINDOW: '3 seconds'
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

    // 6. Login incorrecto y Rate Limiting
    const badLoginBody = new URLSearchParams({ password: 'bad' }).toString();
    const goodLoginBody = new URLSearchParams({ password: 'test-password' }).toString();
    
    // Simular un spoofing de cabecera usando IP ficticio para prueba
    const testIp1 = '127.0.0.1'; // IP ficticia para Vercel o proxy seguro (x-real-ip)
    
    // Disparar 6 intentos concurrentes con IP1
    console.log('Probando límites de intentos concurrentes (Rate limit 5/3s)...');
    const rateLimitPromises = [];
    for (let i = 0; i < 6; i++) {
      rateLimitPromises.push(fetchHttp(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded', 
          'Content-Length': badLoginBody.length,
          'x-real-ip': testIp1
        },
        body: badLoginBody
      }));
    }
    const rateLimitResults = await Promise.all(rateLimitPromises);
    const successLogins = rateLimitResults.filter(r => r.status === 303).length;
    const rateLimitedLogins = rateLimitResults.filter(r => r.status === 429).length;
    
    assert(successLogins === 5 && rateLimitedLogins === 1, `Rate limit debe permitir 5 y bloquear 1 concurrente. Encontrados: permitidos=${successLogins}, bloqueados=${rateLimitedLogins}`);
    
    // Comprobar que incluso la contraseña correcta falla con 429 tras agotar límite
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': goodLoginBody.length, 'x-real-ip': testIp1 },
      body: goodLoginBody
    });
    assert(res.status === 429, `La contraseña correcta debe ser rechazada (429) con límite agotado. Fue ${res.status}`);

    // Probar bypass de otra persona en otra IP (debería pasar)
    const testIp2 = '10.0.0.2';
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': badLoginBody.length, 'x-real-ip': testIp2 },
      body: badLoginBody
    });
    assert(res.status === 303, `Login en nueva IP debe reiniciar el límite. Fue ${res.status}`);
    
    // Probar recuperación después de esperar la expiración de la ventana (3 segundos en el env)
    console.log('Esperando expiración de ventana (3.1s)...');
    await new Promise(r => setTimeout(r, 3100));
    const successRes = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': goodLoginBody.length, 'x-real-ip': testIp1 },
      body: goodLoginBody
    });
    assert(successRes.status === 303 && successRes.headers.location === '/', `Recuperación de la ventana fallida para IP 1. Fue ${successRes.status}`);

    // Comprobar que IP desconocida o falsificada devuelve 500 (sin IP real proveida)
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': badLoginBody.length },
      body: badLoginBody
    });
    assert(res.status === 500, `Debe rechazar solicitudes sin request.ip o x-real-ip (spoofing débil) devolviendo 500. Fue ${res.status}`);

    // Comprobar que el RPC en Supabase está bloqueado para acceso anónimo vía PostgREST
    const anonRpcRes = await fetchHttp(`${env.SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_ip: '1.2.3.4' })
    });
    assert(anonRpcRes.status === 401 || anonRpcRes.status === 403 || anonRpcRes.status === 404, `RPC check_rate_limit no debe ser accesible anónimamente. Estado: ${anonRpcRes.status}`);

    // Configurar sesión para las siguientes pruebas
    const setCookieHeader = successRes.headers['set-cookie'] || [];
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
