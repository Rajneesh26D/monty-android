const reply = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const versionPattern = /^\d+\.\d+\.\d+$/;
const allowedApi = /^\/api\/(state|process|extract|health|pdfs\/[A-Za-z0-9_-]{1,100}|files\/[A-Za-z0-9_-]{1,100})$/;
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#173e38"><title>Monty for Android</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f3e8;color:#173e38;font-family:system-ui,sans-serif;line-height:1.6}main{max-width:760px;margin:0 auto;padding:56px 24px}header{display:flex;align-items:center;gap:12px;font-weight:750;font-size:22px}.mark{display:grid;place-items:center;background:#173e38;color:#f5f3e8;width:48px;height:48px;border-radius:14px}h1{font-size:clamp(36px,7vw,58px);line-height:1.1;letter-spacing:-2px;margin:60px 0 22px;max-width:620px}p{color:#52665c}.intro{font-size:20px;max-width:580px}.downloads{background:#fffdf7;border:1px solid #dadfce;border-radius:22px;padding:26px;margin:32px 0}a.button{display:block;text-decoration:none;background:#173e38;color:#fff;border-radius:12px;padding:15px 20px;text-align:center;font-weight:650;margin:12px 0}.button.alt{color:#173e38;background:#e7ebdf}h2{font-size:22px;margin:0 0 12px}li{padding:5px 0}a{color:#173e38}footer{font-size:14px;margin-top:40px;border-top:1px solid #dadfce;padding-top:20px}.small{font-size:14px}.steps{padding-left:24px}button{font:inherit}</style></head><body><main><header><span class="mark">M</span> Monty</header><h1>Your study library.<br>On your phone.</h1><p class="intro">English and Maths, notes and PDFs, practice and quizzes. Pick up where you left off on the web.</p><section class="downloads"><h2>Get Monty for Android</h2><p id="version">Checking the latest version…</p><div id="downloads"></div><p class="small">Choose ARM64 for a modern 64-bit Android phone. Universal works across supported Android devices.</p></section><h2>Install and connect</h2><ol class="steps"><li>Download the APK on your phone and open the download.</li><li>Allow your browser to install Monty when Android asks.</li><li>In your <a href="https://vocabmaster-study.fuzzygenet512.chatgpt.site" target="_blank" rel="noreferrer">Monty web app</a>, open Settings → Connect Android.</li><li>Enter that one-time code in Monty on your phone. Your library will sync automatically.</li></ol><p>No USB cable or laptop script is needed. Future app updates are available in Settings → Updates.</p><footer><a href="https://github.com/Rajneesh26D/monty-android">Source and GitHub releases</a> · Your study library stays private. A connection code is required to sync.</footer></main><script>
fetch('/updates/latest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(v=>{document.querySelector('#version').textContent='Version '+v.versionName+' · Android 7 and newer, including Android 16';for(const [abi,title] of [['arm64-v8a','Download for Android · ARM64'],['universal','Download universal APK']]){const p=v.packages[abi];if(!p)continue;const u=new URL(p.url);if(u.origin!==location.origin||!u.pathname.startsWith('/downloads/'))continue;const a=document.createElement('a');a.className='button'+(abi==='universal'?' alt':'');a.href=u.href;a.textContent=title+' · '+(p.size/1048576).toFixed(1)+' MB';document.querySelector('#downloads').append(a)}}).catch(()=>{document.querySelector('#version').textContent='The Android release is being prepared. Please check again shortly.'});
</script></body></html>`;

function cors(response, origin) {
  const headers = new Headers(response.headers);
  if (origin === 'https://localhost') headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Expose-Headers', 'ETag, Retry-After, Content-Type');
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, origin = request.headers.get('Origin');
    try {
      if (request.method === 'OPTIONS') {
        if (origin !== 'https://localhost') return reply({ error: 'Origin not allowed' }, 403);
        return new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, If-None-Match', 'Access-Control-Max-Age': '600', 'Vary': 'Origin',
        } });
      }
      if (path === '/' && ['GET', 'HEAD'].includes(request.method)) return new Response(request.method === 'HEAD' ? null : page, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" },
      });
      if (path.startsWith('/admin/')) {
        if (!env.MONTY_UPLOAD_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.MONTY_UPLOAD_TOKEN) return reply({ error: 'Not authorized' }, 401);
        const upload = path.match(/^\/admin\/releases\/(\d+\.\d+\.\d+)\/(Monty-[\d.]+-(?:arm64-v8a|universal)\.apk|update\.json|SHA256SUMS\.txt)$/);
        if (upload && request.method === 'PUT') {
          const [, version, file] = upload;
          if (await env.BUCKET.head('releases/' + version + '/published')) return reply({ error: 'Published releases are immutable. Increase the version.' }, 409);
          const size = Number(request.headers.get('Content-Length'));
          if (!size || size > 300 * 1048576 || (file === 'update.json' && size > 131072)) return reply({ error: 'Invalid upload size' }, 413);
          await env.BUCKET.put('releases/' + version + '/' + file, request.body, { httpMetadata: { contentType: file.endsWith('.apk') ? 'application/vnd.android.package-archive' : file.endsWith('.json') ? 'application/json' : 'text/plain' } });
          return reply({ ok: true });
        }
        if (path === '/admin/publish' && request.method === 'POST') {
          const input = await request.json(), version = input.version;
          if (typeof version !== 'string' || !versionPattern.test(version)) return reply({ error: 'Invalid version' }, 400);
          const metadata = await env.BUCKET.get('releases/' + version + '/update.json');
          if (!metadata) return reply({ error: 'Upload metadata first' }, 409);
          const manifest = await metadata.json();
          if (manifest.applicationId !== 'com.monty.study' || manifest.versionName !== version || !Number.isInteger(manifest.versionCode) || manifest.versionCode <= 0) return reply({ error: 'Invalid manifest' }, 400);
          const latest = await env.BUCKET.get('releases/latest.json');
          if (latest) {
            const previous = await latest.json();
            if (previous.versionCode >= manifest.versionCode) return reply({ error: 'A new release must increase versionCode.' }, 409);
          }
          for (const abi of ['universal', 'arm64-v8a']) {
            const asset = manifest.packages?.[abi];
            if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256)) return reply({ error: 'Invalid APK metadata' }, 400);
            const name = 'Monty-' + version + '-' + abi + '.apk';
            if (asset.url !== url.origin + '/downloads/' + version + '/' + name) return reply({ error: 'Invalid APK URL' }, 400);
            const file = await env.BUCKET.head('releases/' + version + '/' + name);
            if (!file || file.size !== asset.size) return reply({ error: 'An APK is missing or incomplete.' }, 409);
          }
          if (!await env.BUCKET.head('releases/' + version + '/SHA256SUMS.txt')) return reply({ error: 'Checksums are missing' }, 409);
          await env.BUCKET.put('releases/' + version + '/published', 'true');
          await env.BUCKET.put('releases/latest.json', JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json' } });
          return reply({ ok: true, version });
        }
        return reply({ error: 'Not found' }, 404);
      }
      if (path === '/updates/latest.json' && ['GET', 'HEAD'].includes(request.method)) {
        const object = await env.BUCKET.get('releases/latest.json');
        if (!object) return reply({ error: 'No release published yet' }, 404);
        return new Response(request.method === 'HEAD' ? null : object.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      const download = path.match(/^\/downloads\/(\d+\.\d+\.\d+)\/(Monty-[\d.]+-(?:arm64-v8a|universal)\.apk|SHA256SUMS\.txt)$/);
      if (download && ['GET', 'HEAD'].includes(request.method)) {
        const [, version, name] = download;
        if (!await env.BUCKET.head('releases/' + version + '/published')) return reply({ error: 'Release not published' }, 404);
        const object = request.method === 'HEAD' ? await env.BUCKET.head('releases/' + version + '/' + name) : await env.BUCKET.get('releases/' + version + '/' + name);
        if (!object) return reply({ error: 'File not found' }, 404);
        return new Response(request.method === 'HEAD' ? null : object.body, { headers: { 'Content-Type': name.endsWith('.apk') ? 'application/vnd.android.package-archive' : 'text/plain',
          'Content-Length': String(object.size), 'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'public,max-age=31536000,immutable', 'X-Content-Type-Options': 'nosniff' } });
      }
      const pairing = path === '/pair' && request.method === 'POST';
      if (!pairing && !allowedApi.test(path)) return reply({ error: 'Not found' }, 404);
      if (origin && origin !== 'https://localhost') return reply({ error: 'Origin not allowed' }, 403);
      if (!env.MONTY_UPSTREAM_ORIGIN || !env.MONTY_UPSTREAM_TOKEN) return cors(reply({ error: 'Sync is being set up. Please retry shortly.' }, 503), origin);
      const authorization = request.headers.get('Authorization') || '';
      if (!pairing && !/^Bearer [a-f0-9]{64}$/.test(authorization)) return cors(reply({ error: 'Connect this phone from Monty web Settings first.' }, 401), origin);
      const headers = new Headers({ 'OAI-Sites-Authorization': 'Bearer ' + env.MONTY_UPSTREAM_TOKEN });
      if (!pairing) headers.set('X-Monty-Device-Token', authorization.slice(7));
      for (const name of ['Content-Type', 'If-Match', 'If-None-Match']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
      const upstreamPath = pairing ? '/api/mobile/pair' : path + url.search;
      const upstream = await fetch(env.MONTY_UPSTREAM_ORIGIN + upstreamPath, { method: request.method, headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
      if (upstream.status >= 300 && upstream.status <= 399) return cors(reply({ error: 'The private backend needs reconnection. Your local data is safe.' }, 503), origin);
      const responseHeaders = new Headers();
      for (const name of ['Content-Type', 'ETag', 'Retry-After', 'X-Content-Type-Options']) if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
      responseHeaders.set('Cache-Control', 'no-store');
      return cors(new Response(upstream.body, { status: upstream.status, headers: responseHeaders }), origin);
    } catch {
      return cors(reply({ error: 'Sync is temporarily unavailable. Your device copy is safe; please retry.' }, 503), origin);
    }
  },
};
