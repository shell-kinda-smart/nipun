// Browser integration check: sign in, walk every route, collect console
// errors and failed requests. Run with: node _check.mjs
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9250
const PROFILE = 'C:\\Users\\Welcome\\AppData\\Local\\Temp\\cdp-check-' + Date.now()
const APP = process.env.APP_URL || 'http://localhost:5173'
const env = readFileSync('backend/.env', 'utf8')
const password = (env.match(/^PAYLENS_SEED_PASSWORD=(.*)$/m)?.[1] || '').trim()

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,900', '--hide-scrollbars', '--no-first-run', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' })

let ws, id = 0
const pending = new Map()
const problems = []

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
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    problems.push('console: ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
  } else if (m.method === 'Runtime.exceptionThrown') {
    problems.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? ''))
  } else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    problems.push(`http ${m.params.response.status} ${m.params.response.url}`)
  }
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const S = (m, p) => send(m, p, sessionId)
await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable')
const evaluate = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.result?.value
}

await S('Page.navigate', { url: APP })
await sleep(2500)
const login = await evaluate(`(async () => {
  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ email: 'sara.banerjee@paylens.co', password: ${JSON.stringify(password)} }),
  });
  return r.status;
})()`)
console.log('login:', login)

const routes = [
  '/', '/employees', '/payroll', '/payroll/runs', '/payroll/payments', '/payroll/approvals',
  '/employees/holds', '/analytics', '/reports', '/anomalies', '/audit', '/tax', '/documents',
  '/me/payslips', '/me/tax', '/me/profile', '/me/termination', '/me/settlement',
  '/settings/profile', '/settings/sessions', '/settings/security', '/settings/billing',
  '/settings/notifications', '/notifications', '/schedules', '/jobs', '/terminations', '/settlements',
]

let failures = 0
for (const route of routes) {
  problems.length = 0
  await S('Page.navigate', { url: APP + route })
  await sleep(1800)
  const info = await evaluate(`JSON.stringify({
    h1: document.querySelector('h1')?.textContent ?? null,
    broken: document.body.innerText.includes('Something went wrong'),
    loading: document.body.innerText.trim() === 'Loading…',
  })`)
  const parsed = JSON.parse(info)
  const bad = problems.length > 0 || parsed.broken || parsed.loading
  if (bad) failures++
  console.log(
    `${route.padEnd(24)} ${bad ? 'FAIL' : 'ok  '} ${String(parsed.h1).slice(0, 34)}` +
    (problems.length ? ' :: ' + problems[0].slice(0, 120) : ''),
  )
}
const shot = await S('Page.captureScreenshot', { format: 'png' })
writeFileSync('_check-dashboard.png', Buffer.from(shot.data, 'base64'))
console.log(failures === 0 ? 'ALL ROUTES OK' : `${failures} route(s) with problems`)
ws.close(); chrome.kill()
process.exit(0)
