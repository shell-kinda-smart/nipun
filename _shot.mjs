import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9251
const PROFILE = 'C:\\Users\\Welcome\\AppData\\Local\\Temp\\cdp-shot-' + Date.now()
const APP = 'http://localhost:5173'
const route = process.argv[2] || '/schedules'
const out = process.argv[3] || '_shot.png'
const env = readFileSync('backend/.env', 'utf8')
const password = (env.match(/^PAYLENS_SEED_PASSWORD=(.*)$/m)?.[1] || '').trim()

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,900', '--hide-scrollbars', '--no-first-run', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' })

let ws, id = 0
const pending = new Map()
const send = (method, params = {}, sessionId) => {
  const msg = { id: ++id, method, params }
  if (sessionId) msg.sessionId = sessionId
  ws.send(JSON.stringify(msg))
  return new Promise((res, rej) => pending.set(msg.id, { res, rej }))
}
for (let i = 0; i < 60; i++) {
  try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break } catch { await sleep(250) }
}
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
ws = new WebSocket(webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id)
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result)
  }
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const S = (m, p) => send(m, p, sessionId)
await S('Page.enable'); await S('Runtime.enable')
const evaluate = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.result?.value
}

await S('Page.navigate', { url: APP })
await sleep(2000)
await evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email:'sara.banerjee@paylens.co',password:${JSON.stringify(password)}})}).then(r=>r.status)`)
await S('Page.navigate', { url: APP + route })
await sleep(3000)
console.log(await evaluate(`document.body.innerText.replace(/\\s+/g,' ').slice(0, 400)`))
const shot = await S('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('wrote', out)
ws.close(); chrome.kill()
process.exit(0)
