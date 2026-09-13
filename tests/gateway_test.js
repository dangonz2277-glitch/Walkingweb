import { spawn } from 'child_process';
import http from 'http';

const PORT = 3105;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const env = { 
  ...process.env, 
  SITE_PASSWORD: 'test-password', 
  SITE_SESSION_SECRET: 'super-secret-key-that-is-at-least-32-chars-long' 
};

// Utilidad para fetch usando HTTP nativo sin dependencias extras
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

async function waitServerReady(url, maxRetries = 40) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetchHttp(url);
      if (res.status === 200 || res.status === 307) return true;
      console.log('Intento', i, 'estado:', res.status);
    } catch (e) {
      console.log('Intento', i, 'error:', e.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('El servidor no respondió a tiempo.');
}

async function runTests() {
  console.log(`Iniciando servidor Next.js de prueba en puerto ${PORT}...`);
  const serverProc = spawn('./node_modules/.bin/next', ['start', '-H', '127.0.0.1', '-p', PORT.toString()], {
    env,
    stdio: 'inherit'
  });

  let exitCode = 0;

  try {
    await waitServerReady(`${BASE_URL}/login`);
    console.log('Servidor listo. Ejecutando pruebas...');

    // 1. Acceso anónimo a la raíz
    let res = await fetchHttp(`${BASE_URL}/`);
    if (res.status !== 307 || !res.headers.location.includes('/login')) {
      throw new Error(`Acceso anónimo a raíz debería ser 307 a /login, pero fue ${res.status}`);
    }
    console.log('✅ Anónimo redirigido a login.');

    // 2. Ruta profunda anónima
    res = await fetchHttp(`${BASE_URL}/alguna-ruta/secreta`);
    if (res.status !== 307) throw new Error('Ruta profunda no protegida.');
    console.log('✅ Ruta profunda protegida.');

    // 3. Cookie inventada
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': 'site_session=inventado.1234' } });
    if (res.status !== 307) throw new Error('Cookie inventada no fue rechazada.');
    console.log('✅ Cookie falsa rechazada.');

    // 4. Asset público permitido
    res = await fetchHttp(`${BASE_URL}/favicon.ico`);
    // Dependiendo de si existe el favicon devolverá 200 o 404, pero no 307
    if (res.status === 307) throw new Error('Assets públicos (favicon) están siendo bloqueados.');
    console.log('✅ Assets públicos permitidos.');

    // 5. Login incorrecto
    const badLoginBody = new URLSearchParams({ password: 'bad' }).toString();
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': badLoginBody.length },
      body: badLoginBody
    });
    if (res.status !== 303 || !res.headers.location.includes('/login?error=1')) {
      throw new Error('Login incorrecto no redirigió correctamente.');
    }
    console.log('✅ Login incorrecto rechazado.');

    // 6. Login correcto
    const goodLoginBody = new URLSearchParams({ password: 'test-password' }).toString();
    res = await fetchHttp(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': goodLoginBody.length },
      body: goodLoginBody
    });
    if (res.status !== 303 || !res.headers.location.endsWith('/')) {
      throw new Error('Login correcto falló en redirección.');
    }
    
    const setCookieHeader = res.headers['set-cookie'] || [];
    const sessionCookieStr = setCookieHeader.find(c => c.startsWith('site_session='));
    if (!sessionCookieStr || !sessionCookieStr.includes('HttpOnly')) {
      throw new Error('Cookie no generada o falta flag HttpOnly.');
    }
    const sessionCookie = sessionCookieStr.split(';')[0];
    console.log('✅ Login correcto expide cookie HttpOnly.');

    // 7. Acceso a datos internos con cookie
    res = await fetchHttp(`${BASE_URL}/`, { headers: { 'Cookie': sessionCookie } });
    if (res.status !== 200) throw new Error(`El acceso autorizado falló con código ${res.status}`);
    console.log('✅ Acceso raíz autorizado con cookie válida.');
    
    // Validar payload
    if (!res.data.includes('WalkingPad')) throw new Error('HTML no contiene el título esperado.');
    
    // 8. Logout
    res = await fetchHttp(`${BASE_URL}/api/logout`, { method: 'POST' });
    const logoutCookieStr = (res.headers['set-cookie'] || []).find(c => c.startsWith('site_session='));
    if (!logoutCookieStr || !logoutCookieStr.includes('Max-Age=0') && !logoutCookieStr.includes('Expires=')) {
      throw new Error('Logout no expira la cookie.');
    }
    console.log('✅ Logout revoca la cookie exitosamente.');
    
    // 9. Comprobar que los datos no son parte de /_next/static (debería ser 404 porque catalog-data no existe como ruta pública)
    // No hay manera de saber dinámicamente un hash de chunk, pero aseguramos que /data/products.json no es accesible
    res = await fetchHttp(`${BASE_URL}/data/products.json`);
    if (res.status !== 307) {
      throw new Error(`Ruta directa de datos no está protegida (Código: ${res.status}).`);
    }
    console.log('✅ Ruta directa de datos protegida (Server-side).');

  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    exitCode = 1;
  } finally {
    console.log('Cerrando servidor...');
    serverProc.kill();
  }
  
  process.exitCode = exitCode;
}

runTests();
