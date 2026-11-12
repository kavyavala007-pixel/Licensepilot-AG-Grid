import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const appUrl = process.env.LICENSEPILOT_DEMO_URL || "http://127.0.0.1:3001";
const temp = "/tmp/licensepilot-real-screen";
const webm = path.join(temp, "screen-recording.webm");
const framesDir = path.join(temp, "frames");
const wavPath = path.join(temp, "narration-180s.wav");
const outputPath = path.join(temp, "LicensePilot-demo-180s.mp4");
const ffmpeg = path.join(os.homedir(), "Library/Caches/ms-playwright/ffmpeg-1013/ffmpeg-mac");
const fps = 25;
const totalSeconds = 180;

const narrationMd = await fs.readFile(path.join(root, "narration.md"), "utf8");
const sections = [...narrationMd.matchAll(/^## .*?\n\n([\s\S]*?)(?=\n## |$)/gm)]
  .map((m) => m[1].trim())
  .filter(Boolean);
if (sections.length !== 9) throw new Error(`Expected nine narrated scenes, found ${sections.length}.`);

const starts = [0, 15, 35, 68, 94, 126, 142, 160, 175];
const durations = [15, 20, 33, 26, 32, 16, 18, 15, 5];

function readWav(buffer) {
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const chunk = offset + 8;
    if (id === "fmt ") {
      format = {
        channels: buffer.readUInt16LE(chunk + 2),
        sampleRate: buffer.readUInt32LE(chunk + 4),
        bits: buffer.readUInt16LE(chunk + 14),
      };
    }
    if (id === "data") data = buffer.subarray(chunk, chunk + size);
    offset = chunk + size + (size % 2);
  }
  if (!format || !data) throw new Error("Could not read a synthesized WAV clip.");
  return { ...format, data };
}

await fs.rm(temp, { recursive: true, force: true });
await fs.mkdir(framesDir, { recursive: true });
const clips = [];
for (let i = 0; i < sections.length; i++) {
  const aiff = path.join(temp, `voice-${i + 1}.aiff`);
  const wav = path.join(temp, `voice-${i + 1}.wav`);
  let rate = 156;
  let clip;
  for (;;) {
    execFileSync("say", ["-v", "Samantha", "-r", String(rate), "-o", aiff, sections[i]]);
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16", aiff, wav]);
    clip = readWav(await fs.readFile(wav));
    const duration = clip.data.length / (clip.sampleRate * clip.channels * clip.bits / 8);
    if (duration <= durations[i] - 0.18 || rate >= 215) break;
    rate = Math.ceil(rate * duration / (durations[i] - 0.25));
  }
  const maxBytes = Math.floor((durations[i] - 0.04) * clip.sampleRate * clip.channels * clip.bits / 8);
  if (clip.data.length > maxBytes) throw new Error(`Narration scene ${i + 1} does not fit its time slot.`);
  clips.push({ ...clip, start: starts[i], duration: clip.data.length / (clip.sampleRate * clip.channels * clip.bits / 8) });
}
const { sampleRate, channels, bits } = clips[0];
if (bits !== 16 || clips.some((c) => c.sampleRate !== sampleRate || c.channels !== channels || c.bits !== bits)) {
  throw new Error("Narration WAV clips do not share a compatible PCM format.");
}
const blockAlign = channels * bits / 8;
const pcm = Buffer.alloc(totalSeconds * sampleRate * blockAlign);
for (const clip of clips) {
  const offset = Math.round(clip.start * sampleRate) * blockAlign;
  clip.data.copy(pcm, offset);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * blockAlign, 28);
header.writeUInt16LE(blockAlign, 32); header.writeUInt16LE(bits, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
await fs.writeFile(wavPath, Buffer.concat([header, pcm]));

// Require demo mode and the disabled integrations before resetting sample activity.
const configResponse = await fetch(`${appUrl}/api/config`);
if (!configResponse.ok) throw new Error("Could not read the local demo configuration.");
const config = await configResponse.json();
if (!config.demoMode || config.aiEnabled || config.paypalClientId) {
  throw new Error("Recording requires simulated payments and runtime AI disabled.");
}
const reset = await fetch(`${appUrl}/api/demo/reset`, { method: "POST" });
if (!reset.ok) throw new Error("Could not reset temporary demo activity.");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
  recordVideo: { dir: temp, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const origin = Date.now();
const at = async (seconds) => {
  const left = origin + seconds * 1000 - Date.now();
  if (left > 0) await page.waitForTimeout(left);
};
await page.goto(appUrl, { waitUntil: "domcontentloaded" });
await page.getByText("500", { exact: true }).first().waitFor({ timeout: 20_000 });
await page.addStyleTag({ content: `
  #lp-record-disclosure { position:fixed; z-index:2147483646; left:270px; bottom:14px; background:rgba(24,27,32,.9); color:#fff; border-radius:5px; padding:10px 14px; font:500 16px -apple-system,BlinkMacSystemFont,sans-serif; letter-spacing:.1px; pointer-events:none; }
  #lp-record-title { position:fixed; z-index:2147483646; right:30px; top:16px; background:rgba(24,27,32,.86); color:#fff; border-radius:5px; padding:9px 13px; font:600 17px -apple-system,BlinkMacSystemFont,sans-serif; pointer-events:none; }
  #lp-record-pointer { position:fixed; z-index:2147483647; width:18px; height:18px; border:3px solid #fff; background:#d6532e; border-radius:50%; box-shadow:0 1px 8px #0008; transform:translate(-50%,-50%); pointer-events:none; left:-50px; top:-50px; }
` });
await page.evaluate(() => {
  const d = document.createElement("div"); d.id = "lp-record-disclosure";
  d.textContent = "Independent prototype · fictional data · sandbox/demo only"; document.body.append(d);
  const t = document.createElement("div"); t.id = "lp-record-title"; t.textContent = "LICENSEPILOT  /  OVERVIEW"; document.body.append(t);
  const c = document.createElement("div"); c.id = "lp-record-pointer"; document.body.append(c);
  addEventListener("mousemove", (e) => { c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`; }, { passive: true });
});
const title = async (text) => page.locator("#lp-record-title").evaluate((el, value) => { el.textContent = `LICENSEPILOT  /  ${value.toUpperCase()}`; }, text);
const nav = async (label) => page.locator("aside.sidebar").getByRole("button", { name: label, exact: true }).click();
const move = async (x, y, steps = 12) => {
  const from = await page.evaluate(() => ({ x: Number.parseFloat(document.querySelector("#lp-record-pointer").style.left) || 320, y: Number.parseFloat(document.querySelector("#lp-record-pointer").style.top) || 180 }));
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (x - from.x) * i / steps, from.y + (y - from.y) * i / steps);
    await page.waitForTimeout(18);
  }
};
const architecture = `
  <section id="lp-architecture"><style>
  #lp-architecture{position:fixed;inset:0;z-index:2147483645;background:#f4f2ed;display:grid;place-items:center;color:#202329;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  #lp-architecture .card{width:1500px;padding:54px 64px;background:#fff;border:1px solid #e0ddd6;border-radius:18px;box-shadow:0 18px 60px #1b202710}
  #lp-architecture h2{font-size:44px;margin:0 0 8px} #lp-architecture p{font-size:21px;color:#717680;margin:0 0 38px}
  #lp-architecture .row{display:flex;gap:20px;align-items:center}
  #lp-architecture .row article{flex:1;border:1px solid #dfdcd4;border-radius:12px;padding:24px;min-height:108px;background:#fcfbf9}
  #lp-architecture b{font-size:23px} #lp-architecture small{display:block;margin-top:12px;color:#717680;font-size:17px}
  #lp-architecture .extras{display:flex;gap:24px;margin:32px 0 0 210px} #lp-architecture .extras article{min-height:45px}
  #lp-architecture .accent{color:#d6532e}
  </style><div class="card"><h2>How the prototype fits together</h2><p>Application architecture · integrations are optional and not production-verified</p>
  <div class="row"><article><b>React + Vite</b><small>AG Grid · AG Charts</small></article><span class="accent">→</span><article><b>Express API</b><small>Prisma · SQLite / PostgreSQL</small></article><span class="accent">→</span><article><b>Policy engine</b><small>Code-enforced renewal gates</small></article></div>
  <div class="extras"><article><b>Optional Anthropic API</b><small>Rules-only fallback when disabled</small></article><article><b>PayPal Sandbox</b><small>Local demo mode simulates payments</small></article></div></div></section>`;
const closing = `
  <section id="lp-closing"><style>
  #lp-closing{position:fixed;inset:0;z-index:2147483645;background:#f4f2ed;display:grid;place-items:center;color:#202329;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  #lp-closing .card{width:1300px;border-left:8px solid #d6532e;padding:30px 44px}
  #lp-closing h1{font-size:70px;color:#d6532e;margin:0 0 14px} #lp-closing p{font-size:28px;margin:0 0 34px;color:#555b64}
  #lp-closing .legal{background:#fff;border:1px solid #dedbd3;border-radius:10px;padding:22px;font-size:21px;line-height:1.6}
  </style><div class="card"><h1>LicensePilot</h1><p>An independent concept for clearer software-licensing operations.</p><div class="legal"><b>Fictional data · sandbox/demo only.</b><br>Not affiliated with, endorsed by, or sponsored by AG Grid or PayPal.<br>Confirm real licensing terms with AG Grid.</div></div></section>`;

await title("The opportunity");
await move(720, 380); await move(1280, 580); await move(970, 730);
await at(15); await title("Sample customer and renewal overview"); await move(1040, 310); await move(730, 720);
await at(35); await nav("Licence Advisor"); await title("Licence Advisor"); await move(1050, 480);
await at(44); await page.evaluate(() => window.scrollTo({ top: 430, behavior: "smooth" })); await move(1060, 390);
await at(53); await page.evaluate(() => window.scrollTo({ top: 900, behavior: "smooth" })); await move(770, 790);
await at(59); await page.getByRole("tab", { name: "Check an existing project" }).click();
await page.getByLabel("Project file").fill('{\n  "dependencies": {\n    "ag-grid-enterprise": "^34.0.0",\n    "ag-charts-enterprise": "^12.0.0"\n  }\n}');
await page.getByRole("button", { name: "Check project", exact: true }).click();
await at(68); await nav("Customers"); await title("AG Grid customer operations");
await page.locator(".ag-row").first().waitFor(); await move(530, 300);
await at(77); await page.getByLabel("Search customers").fill("Meridian"); await move(420, 200);
await at(85); await page.locator('.ag-cell[col-id="company"]').first().click(); await move(690, 440);
await at(89); await page.getByRole("button", { name: "Close", exact: true }).click();
await at(94); await nav("Renewals"); await title("Policy-gated renewals");
if (!(await page.locator("#dryrun").isChecked())) throw new Error("Renewal dry run is not enabled.");
await move(1140, 250);
await at(97); await page.getByRole("button", { name: "Run now" }).click();
await page.getByText("Practice run finished", { exact: false }).waitFor();
await at(106); await page.evaluate(() => window.scrollTo({ top: 850, behavior: "smooth" })); await move(1200, 800);
await at(126); await nav("AI Assistant"); await title("Optional read-only assistant");
await at(128); await page.getByRole("button", { name: "Which customers renew this month?", exact: true }).click();
await page.locator(".exchange-a").first().waitFor(); await move(1000, 540);
await at(142); await nav("Payments"); await title("Payments · simulated demo mode"); await move(1250, 390);
await at(154); await nav("Activity History"); await title("Activity history and audit trail"); await move(650, 250);
await at(160); await title("Prototype architecture"); await page.evaluate((html) => document.body.insertAdjacentHTML("beforeend", html), architecture);
await at(175); await title("Closing disclosure"); await page.evaluate((html) => { document.getElementById("lp-architecture")?.remove(); document.body.insertAdjacentHTML("beforeend", html); }, closing);
await move(1500, 900);
await at(totalSeconds);

const video = page.video();
await page.close();
await video.saveAs(webm);
await browser.close();

// Convert the real browser recording to a fixed-rate PNG sequence, then encode
// it as H.264 with a precisely timed AAC narration track using AVFoundation.
execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", webm, "-r", String(fps), path.join(framesDir, "%06d.png")]);
let frameFiles = (await fs.readdir(framesDir)).filter((name) => name.endsWith(".png")).sort();
const targetFrames = fps * totalSeconds;
if (frameFiles.length < targetFrames - fps) throw new Error(`Recording is short: expected about ${targetFrames} frames, found ${frameFiles.length}.`);
for (let index = frameFiles.length; index < targetFrames; index++) {
  const next = `${String(index + 1).padStart(6, "0")}.png`;
  await fs.copyFile(path.join(framesDir, frameFiles.at(-1)), path.join(framesDir, next));
  frameFiles.push(next);
}
execFileSync("/tmp/lp-frames-to-mp4", [framesDir, wavPath, outputPath, String(fps), String(totalSeconds)]);
await fs.copyFile(outputPath, path.join(root, "LicensePilot-demo-180s.mp4"));
console.log(`Finished: ${path.join(root, "LicensePilot-demo-180s.mp4")}`);
