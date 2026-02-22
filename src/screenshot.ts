import puppeteer from "puppeteer";

export async function screenshotDashboard(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15_000 });

    // Wait for D3 animations to finish
    await new Promise((r) => setTimeout(r, 1500));

    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: 90,
      fullPage: true,
    });

    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}
