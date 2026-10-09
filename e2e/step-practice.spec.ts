import { test, expect, type Page } from "@playwright/test";
import MidiPackage from "@tonejs/midi";
test.use({ hasTouch: true });

async function openStep(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"SERVICE_UNAVAILABLE"}',
    }),
  );
  const midi = new MidiPackage.Midi();
  const melody = midi.addTrack();
  melody.name = "Melody";
  for (const [pitch, time] of [
    [60, 0],
    [60, 1],
    [61, 2],
    [61, 2],
    [64, 2],
    [30, 8],
    [67, 9],
  ]) {
    melody.addNote({ midi: pitch, time, duration: 0.5 });
  }
  midi.addTrack().addNote({ midi: 65, time: 0, duration: 10 }).name =
    "Reference";
  await page.goto("/");
  await page
    .getByRole("button", { name: "导入曲目", exact: true })
    .first()
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "逐音验收.mid",
      mimeType: "audio/midi",
      buffer: Buffer.from(midi.toArray()),
    });
  await page.getByRole("button", { name: "逐音跟练", exact: true }).click();
  await expect(page.locator(".step-heading")).toContainText("第 1 / 5 组");
}

async function sessions(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const open = indexedDB.open("xianzhi-platform", 1);
        open.onsuccess = () => {
          const db = open.result;
          const query = db
            .transaction("sessions")
            .objectStore("sessions")
            .getAll();
          query.onsuccess = () => {
            resolve(query.result);
            db.close();
          };
          query.onerror = () => reject(query.error);
        };
      }),
  );
}

test("step waits for exact fresh presses, retains chords across pauses, skips range gaps and saves once", async ({
  page,
}) => {
  let sampleRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/samples/")) sampleRequests += 1;
  });
  await openStep(page);
  await expect(page.getByRole("combobox", { name: "速度" })).toHaveCount(0);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.waitForTimeout(500);
  expect(sampleRequests).toBe(0);
  await expect(page.locator(".step-heading")).toContainText("第 1 / 5 组");
  await page.keyboard.press("g");
  await expect(page.locator(".step-heading")).toContainText("第 1 / 5 组");
  await page.keyboard.down("t");
  await expect(page.locator(".step-heading")).toContainText("第 2 / 5 组");
  await page.keyboard.down("t");
  await expect(page.locator(".step-heading")).toContainText("第 2 / 5 组");
  await page.keyboard.up("t");
  // Keep sustain held while releasing and re-pressing a repeated note.
  await page.locator("h1").click();
  await page.keyboard.down("Space");
  await page.keyboard.press("t");
  await expect(page.locator(".step-heading")).toContainText("第 3 / 5 组");
  await page.keyboard.press("Shift+t");
  await expect(page.locator(".step-actions")).toContainText("已完成 1 / 2 音");
  await page.keyboard.press("g");
  await expect(page.locator(".step-actions")).toContainText("已完成 1 / 2 音");
  await page.screenshot({ path: "test-results/step-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.keyboard.up("Space");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "隐藏辅助提示" }).click();
  await expect(page.locator(".step-notes")).toHaveCount(0);
  await expect(page.locator(".piano-key.guided")).toHaveCount(0);
  await expect(page.locator(".jianpu-token.current")).toHaveCount(1);
  await expect(page.locator(".step-hit")).toHaveCount(1);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.keyboard.press("u");
  await expect(page.locator(".step-range-warning")).toBeVisible();
  await page.getByRole("button", { name: "跳过当前组" }).click();
  await expect(page.locator(".step-heading")).toContainText("第 5 / 5 组");
  await page.keyboard.press("o");
  await expect(page.locator(".step-result")).toContainText(
    "弹对 4 组 · 跳过 1 组",
  );
  await expect(page.locator(".workspace-feedback")).toContainText(
    "已保存在本机",
  );
  await page.keyboard.press("o");
  const saved = await sessions(page);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    mode: "step",
    matched: null,
    attempted: null,
  });
  await page.reload();
  await expect(page.locator(".step-heading")).toContainText("第 1 / 5 组");
  await expect(
    page.getByRole("button", { name: "显示辅助提示" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "练习记录", exact: true }).click();
  await expect(page.locator(".library-list")).toContainText("逐音跟练");
});

test("rapid input, seeking, background pause, loops and mode changes preserve boundaries", async ({
  page,
}) => {
  await openStep(page);
  await page.getByRole("checkbox", { name: "循环", exact: true }).check();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.keyboard.type("tt", { delay: 0 });
  await expect(page.locator(".step-heading")).toContainText("第 3 / 5 组");
  await page.keyboard.press("Shift+t");
  await page.keyboard.press("u");
  await page.getByRole("button", { name: "跳过当前组" }).click();
  await page.keyboard.press("o");
  await expect(page.locator(".step-heading")).toContainText("第 1 / 5 组");
  await expect(page.locator(".step-result")).toContainText("已开始下一轮");
  expect(await sessions(page)).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "开始练习", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("t");
  await expect(page.locator(".step-heading")).toContainText("第 1 / 5 组");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // A seek starts a fresh round at or after that position and stays paused.
  await page.getByRole("slider", { name: "播放进度", exact: true }).fill("1.5");
  await expect(page.locator(".step-heading")).toContainText("第 3 / 5 组");
  await expect(page.locator(".step-actions")).toContainText("已完成 0 / 2 音");
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.getByRole("button", { name: "伴奏跟练", exact: true }).click();
  await expect(page.locator(".step-panel")).toHaveCount(0);
  expect(await sessions(page)).toHaveLength(1);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "逐音跟练", exact: true }).click();
  expect((await sessions(page)).map((session) => session.mode).sort()).toEqual([
    "practice",
    "step",
  ]);
});

test("touch piano, target visibility and track switching work on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStep(page);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  // Chromium touch emulation exercises pointer capture and release on the on-screen keys.
  const c4 = page.getByRole("button", { name: "C4，键盘 T", exact: true });
  await c4.tap();
  await c4.tap();
  await expect(page.locator(".step-heading")).toContainText("第 3 / 5 组");
  await page.getByRole("button", { name: "C♯4，键盘 ⇧T", exact: true }).tap();
  await page.getByRole("button", { name: "E4，键盘 U", exact: true }).tap();
  await expect(page.locator(".step-range-warning")).toBeVisible();
  await page.getByRole("button", { name: "音轨与唱名设置" }).click();
  const target = page.locator(".track-row").filter({ hasText: "Melody" });
  await expect(target.getByRole("checkbox")).toBeDisabled();
  await page
    .locator(".track-row")
    .filter({ hasText: "Reference" })
    .getByRole("button", { name: "S", exact: true })
    .click();
  await expect(
    page.locator(".score-track-name").filter({ hasText: "Melody" }),
  ).toBeVisible();
  await page
    .locator(".track-row")
    .filter({ hasText: "Reference" })
    .getByRole("button", { name: "练", exact: true })
    .click();
  await expect(page.locator(".step-heading")).toContainText("第 1 / 1 组");
  expect(await sessions(page)).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/step-phone.png",
    fullPage: true,
  });
});

test("step timing excludes pauses, seeking before starting is honored, reduced motion settles immediately", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStep(page);
  await page.getByRole("slider", { name: "播放进度", exact: true }).fill("1.5");
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.locator(".step-heading")).toContainText("第 3 / 5 组");
  const began = Date.now();
  await page.waitForTimeout(300);
  await page.keyboard.press("Shift+t");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.keyboard.press("u");
  await expect(page.locator(".step-heading")).toContainText("第 4 / 5 组");
  const offset = await page.evaluate(() => {
    const target = document
      .querySelector(".jianpu-token.current")!
      .getBoundingClientRect();
    const score = document
      .querySelector(".score-viewport")!
      .getBoundingClientRect();
    return Math.abs(target.x + target.width / 2 - (score.x + score.width / 2));
  });
  expect(offset).toBeLessThan(2);
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  await expect(page.locator(".workspace-feedback")).toContainText(
    "已保存在本机",
  );
  const saved = await sessions(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].activeMs).toBeGreaterThan(250);
  expect(saved[0].activeMs).toBeLessThan(Date.now() - began - 850);
  await page.getByRole("link", { name: "练习记录", exact: true }).click();
  expect(await sessions(page)).toHaveLength(1);
});
