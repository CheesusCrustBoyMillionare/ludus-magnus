// Launches dist/LudusMagnus.exe, asks the page inside it whether the game booted, then closes it.
// usage (from the project folder): node tools/check-exe.js
const { spawn, execSync } = require('child_process');
const path = require('path');
const exe = path.join(__dirname, '..', 'dist', 'LudusMagnus.exe');
const PORT = 9333;
const child = spawn(exe, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, detached: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(500);
    try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(p => p.type === 'page'); } catch (e) { /* not up yet */ }
  }
  let ok = false, report = 'the exe never opened a page';
  if (page) {
    await sleep(3000);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    const expr = `(() => { try { return JSON.stringify({ href: location.href, day: G.day, slot, tabs: document.querySelectorAll('#tabs button').length, yard: (() => { const y = document.querySelector('#yard'); return !!y && y.getContext('2d').getImageData(300, 300, 1, 1).data[3] > 0; })(),
      portrait: (() => { const c = document.querySelector('[data-portrait]'); return !!c && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some(v => v !== 0); })() }); }
      catch (e) { return JSON.stringify({ href: location.href, error: String(e), body: document.body ? document.body.innerText.slice(0, 160) : '' }); } })()`;
    report = await new Promise(res => {
      ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result.result.value); });
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr } }));
    });
    ws.close();
    const r = JSON.parse(report);
    ok = !r.error && r.tabs > 0 && r.portrait && r.yard;
  }
  try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" }); } catch (e) { /* already gone */ }
  console.log(ok ? 'EXE OK' : 'EXE BROKEN', report);
  process.exit(ok ? 0 : 1);
})();
