import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.screenshot({ path: "homepage.png", fullPage: true });
  console.log("Screenshot saved");
  await browser.close();
})();
