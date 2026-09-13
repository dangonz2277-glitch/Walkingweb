import { spawn, execSync } from 'child_process';
import http from 'http';

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
      // Ignorar errores de red temporales durante inicio
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('El servidor no respondió a tiempo.');
}

async function runTests() {
  console.log(`Iniciando servidor Next.js de prueba en puerto ${PORT}...`);
  // En caso de estar en sandbox con problemas de next local, usar execSync u otro medio
  let serverProc;
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

    // 1. Acceso anónimo a la raíz
    let res = await fetchHttp(`${BASE_URL}/`);
    assert(res.status === 307 && res.headers.location?.includes('/login'), `Acceso anónimo a raíz debería ser 307 a /login, pero fue ${res.status}. Data: ${res.data.slice(0, 200)}`);

    // 2. Ruta profunda anónima
    res = await fetchHttp(`${BASE_URL}/alguna-ruta/secreta`);
    assert(res.status === 307, 'Ruta profunda no protegida.');

    // 3. Cookies inventadas/alteradas
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': 'site_session=inventado.1234' } });
    assert(res.status === 307, `Cookie falsa básica debería ser 307, fue ${res.status}`);
    
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': 'site_session=malformada_sin_punto' } });
    assert(res.status === 307, `Cookie sin punto debería ser 307, fue ${res.status}`);

    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': 'site_session=.' } });
    assert(res.status === 307, `Cookie solo con punto debería ser 307, fue ${res.status}`);

    // Payload maliciosamente alterado (firmas rotas)
    const validJson = Buffer.from(JSON.stringify({ auth: true })).toString('base64url');
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': `site_session=${validJson}.badsignature0000000000000000000000000000000000000000000000000000` } });
    assert(res.status === 307, `Firma falsa debería ser 307, fue ${res.status}`);

    // Expirado
    const expJson = Buffer.from(JSON.stringify({ auth: true, exp: 0 })).toString('base64url');
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': `site_session=${expJson}.badsignature0000000000000000000000000000000000000000000000000000` } });
    assert(res.status === 307, `Cookie expirada debería ser 307, fue ${res.status}`);

    // 4. Asset público permitido
    res = await fetchHttp(`${BASE_URL}/login`);
    assert(res.status === 200, 'Página de login debería ser 200');
    const html = res.data;
    const chunkMatches = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)];
    assert(chunkMatches.length > 0, 'La página de login debería enlazar chunks de JS');
    
    if (chunkMatches.length > 0) {
      let chunkRes = await fetchHttp(`${BASE_URL}${chunkMatches[0][1]}`);
      assert(chunkRes.status === 200, `El chunk público ${chunkMatches[0][1]} debería estar permitido sin cookie, pero devolvió ${chunkRes.status}`);
    }

    // 5. Verificación en disco de la exposición de datos
    try {
      const grepRes = execSync('grep -r "WP510B4" .next/static/chunks/ || true', { encoding: 'utf-8' });
      assert(grepRes.trim() === '', 'Los archivos JS en .next/static/chunks/ contienen datos del catálogo.');
      const grepDataRes = execSync('grep -r "A11" .next/static/chunks/ || true', { encoding: 'utf-8' });
      assert(grepDataRes.trim() === '', 'Los archivos JS en .next/static/chunks/ contienen partes secundarias del catálogo.');
    } catch(e) {
      console.error(e);
    }

    // 6. Login incorrecto
    const badLoginBody = new URLSearchParams({ password: 'bad' }).toString();
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': badLoginBody.length },
      body: badLoginBody
    });
    assert(res.status === 303 && res.headers.location === '/login?error=1', `Login incorrecto debería redirigir a /login?error=1 con 303, fue ${res.status} hacia ${res.headers.location}`);

    // 7. Login correcto y host origin
    const goodLoginBody = new URLSearchParams({ password: 'test-password' }).toString();
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': goodLoginBody.length },
      body: goodLoginBody
    });
    assert(res.status === 303, `Login correcto debería devolver 303, fue ${res.status}`);
    assert(res.headers.location === '/', `Redirección relativa a raíz, fue ${res.headers.location}`);
    
    const setCookieHeader = res.headers['set-cookie'] || [];
    const sessionCookieStr = setCookieHeader.find(c => c.startsWith('site_session='));
    assert(sessionCookieStr && sessionCookieStr.includes('HttpOnly'), 'Login correcto expide cookie HttpOnly.');
    
    const sessionCookie = sessionCookieStr ? sessionCookieStr.split(';')[0] : '';

    // 8. Acceso a datos internos con cookie
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': sessionCookie } });
    assert(res.status === 200, `El acceso autorizado falló con código ${res.status}`);
    
    // Contar el número de tarjetas en el catálogo sin depender de hidratación React
    const cardCount = [...res.data.matchAll(/class="[^"]*card[^"]*"/g)].length;
    assert(cardCount >= 42, `El catálogo autorizado debería renderizar al menos 42 tarjetas, se encontraron ${cardCount}`);
    
    // 9. Logout
    res = await fetchHttp(`${BASE_URL}/api/logout`, { 
      method: 'POST',
      headers: { 'Cookie': sessionCookie }
    });
    assert(res.status === 303 && res.headers.location === '/login', `Logout debería hacer redirect a /login, fue a ${res.headers.location}`);
    const logoutCookieStr = (res.headers['set-cookie'] || []).find(c => c.startsWith('site_session='));
    assert(logoutCookieStr && (logoutCookieStr.includes('Max-Age=0') || logoutCookieStr.includes('Expires=')), 'Logout revoca la cookie exitosamente en el navegador.');
    
    const revokedCookie = logoutCookieStr.split(';')[0];
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': revokedCookie } });
    assert(res.status === 307, `Una cookie recién expirada por logout debe devolver 307, fue ${res.status}`);

    // 10. Probar falta de secreto de sesión (simulado cerrando y reabriendo sin él)
    console.log('Cerrando servidor principal para probar secreto ausente...');
    serverProc.kill();
    await new Promise(r => setTimeout(r, 1000));
    
    console.log(`Iniciando servidor Next.js sin secreto en puerto ${PORT}...`);
    const badEnv = { ...process.env, SITE_PASSWORD: 'test-password', SITE_SESSION_SECRET: '' };
    serverProc = spawn('./node_modules/.bin/next', ['start', '-H', '127.0.0.1', '-p', PORT.toString()], {
      env: badEnv,
      stdio: 'ignore'
    });
    await waitServerReady(`${BASE_URL}/login`);
    
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': sessionCookie } });
    assert(res.status === 500, `Sin SITE_SESSION_SECRET, el proxy debería devolver 500, pero devolvió ${res.status}`);

  } catch (err) {
    failures.push(`Excepción fatal en la suite: ${err.message}`);
    console.error(`❌ ERROR: ${err.message}`);
  } finally {
    console.log('Cerrando servidor...');
    serverProc.kill();
  }
  
  if (failures.length > 0) {
    console.error(`\nSuite finalizada con ${failures.length} fallos.`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ Todos los tests pasaron exitosamente.');
    process.exitCode = 0;
  }
}

runTests();
