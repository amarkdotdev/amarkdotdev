import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const url =
  process.env.GRAFANA_DASHBOARD_URL ||
  "http://127.0.0.1:3000/d/oss-contrib/oss-contributions?orgId=1&kiosk&theme=dark";
const output = process.env.GRAFANA_SCREENSHOT_PATH || "assets/oss-contrib-grafana.png";

await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 980 }, deviceScaleFactor: 1.5 });
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.screenshot({ path: output, fullPage: true });
await browser.close();
