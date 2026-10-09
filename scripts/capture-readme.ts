import { chromium, expect } from "@playwright/test";
import MidiPackage from "@tonejs/midi";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createDemoSong } from "../src/midi/demo-song";

// Capture the real application in an isolated browser; never use personal library data.
const baseURL = process.env.SCREENSHOT_BASE_URL || "http://127.0.0.1:5173";
const output = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    reducedMotion: "reduce",
  });
  // The screenshots deliberately exercise local features without an account/backend.
  await context.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"SERVICE_UNAVAILABLE"}',
    }),
  );
  const page = await context.newPage();
  const demo = createDemoSong();
  for (const [title, trackCount, bpm] of [
    ["小星星 · 主旋律", 1, 120],
    ["小星星 · 慢速练习", 2, 80],
    ["小星星 · 分轨练习", 3, 120],
  ] as const) {
    const midi = new MidiPackage.Midi();
    midi.header.setTempo(bpm);
    for (const [index, source] of demo.tracks.slice(0, trackCount).entries()) {
      const track = midi.addTrack();
      track.name = ["Melody", "Bass", "Drums"][index];
      track.channel = source.channel;
      track.instrument.number = source.program;
      for (const note of source.notes)
        track.addNote({
          midi: note.midi,
          ticks: note.startTick,
          durationTicks: note.endTick - note.startTick,
          velocity: note.velocity,
        });
    }
    await page.goto(baseURL + "/library");
    await page
      .getByRole("button", { name: "导入曲目", exact: true })
      .first()
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: title + ".mid",
      mimeType: "audio/midi",
      buffer: Buffer.from(midi.toArray()),
    });
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  async function capture(name: string) {
    await page.locator("h1").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: output + name + ".png",
      fullPage: name !== "overview",
      animations: "disabled",
    });
    console.log("Captured " + name);
  }
  await page.goto(baseURL + "/midi/demo");
  await expect(
    page.getByRole("heading", { name: demo.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "逐音跟练", exact: true }).click();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.keyboard.type("tt");
  await expect(page.locator(".step-heading")).toContainText("第 3 / 14 组");
  await capture("step-practice");
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  await expect(page.locator(".workspace-feedback")).toContainText(
    "已保存在本机",
  );

  await page.goto(baseURL + "/");
  await expect(page.locator("a.piece-card")).toHaveCount(3);
  await capture("overview");
  await page.goto(baseURL + "/library");
  await expect(
    page.getByRole("heading", { name: "小星星 · 分轨练习", exact: true }),
  ).toBeVisible();
  await capture("library");
  await page.goto(baseURL + "/tools");
  await page.getByRole("button", { name: "节拍器", exact: true }).click();
  await expect(page.getByRole("button", { name: "开始节拍" })).toBeVisible();
  await capture("metronome");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL + "/");
  await expect(page.locator("a.piece-card")).toHaveCount(3);
  await capture("mobile-overview");
  await page.goto(baseURL + "/midi/demo");
  await expect(page.locator(".step-heading")).toContainText("第 1 / 14 组");
  await page.getByRole("button", { name: "收起钢琴键盘" }).click();
  await capture("mobile-practice");
  await context.close();
} finally {
  await browser.close();
}
