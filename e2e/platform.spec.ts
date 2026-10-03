import { test, expect } from "@playwright/test";
import MidiPackage from "@tonejs/midi";
function file() {
  const midi = new MidiPackage.Midi();
  const track = midi.addTrack();
  track.name = "Melody";
  for (let i = 0; i < 8; i++)
    track.addNote({ midi: 60 + (i % 5), time: i, duration: 0.8 });
  return {
    name: "我的练习.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from(midi.toArray()),
  };
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "SERVICE_UNAVAILABLE" }),
    }),
  );
});
test("local import persists across tabs, renaming and deletion work without server", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "留一点时间，给音乐。" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "导入曲目", exact: true })
    .first()
    .click();
  await page.locator("input[type=file]").setInputFiles(file());
  await expect(
    page.getByRole("heading", { name: "我的练习", exact: true }),
  ).toBeVisible();
  const path = new URL(page.url()).pathname;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "我的练习", exact: true }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.route("**/api/**", (r) =>
    r.fulfill({
      status: 503,
      body: '{"error":"SERVICE_UNAVAILABLE"}',
      contentType: "application/json",
    }),
  );
  await second.goto(path);
  await expect(
    second.getByRole("heading", { name: "我的练习", exact: true }),
  ).toBeVisible();
  await second.close();
  await page.getByRole("link", { name: "我的曲库" }).click();
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  await page.getByLabel("曲名", { exact: true }).fill("新的旋律");
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新的旋律" })).toBeVisible();
  await page.getByRole("button", { name: "保存到云端", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("云端暂时无法连接");
  await expect(page.getByRole("heading", { name: "新的旋律" })).toBeVisible();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "曲库还很安静" }),
  ).toBeVisible();
});
test("practice pauses exclude idle time and ending twice does not duplicate records", async ({
  page,
}) => {
  await page.goto("/midi/demo");
  await expect(page.getByRole("heading", { name: "小星星" })).toBeVisible();
  await page.getByRole("button", { name: "伴奏跟练", exact: true }).click();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  await expect(page.locator(".workspace-feedback")).toContainText(
    "已保存在本机",
  );
  const sessions = await page.evaluate(async () => {
    return new Promise<any[]>((resolve, reject) => {
      const r = indexedDB.open("xianzhi-platform", 1);
      r.onsuccess = () => {
        const q = r.result
          .transaction("sessions")
          .objectStore("sessions")
          .getAll();
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      };
    });
  });
  expect(sessions).toHaveLength(1);
  expect(sessions[0].activeMs).toBeGreaterThan(900);
  expect(sessions[0].activeMs).toBeLessThan(2200);
  await page.getByRole("link", { name: "练习记录", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "小星星 · MIDI 工作台示例",
      exact: true,
    }),
  ).toBeVisible();
});
test("listening alone produces no practice records and settings accept keyboard input", async ({
  page,
}) => {
  await page.goto("/midi/demo");
  await page.getByRole("button", { name: "开始播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.goto("/practice");
  await expect(
    page.getByRole("heading", { name: "第一份记录，等你开始" }),
  ).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("邮箱", { exact: true }).fill("test@example.com");
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue(
    "test@example.com",
  );
});
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 820, 1180],
  ["phone", 390, 844],
] as const) {
  test("responsive surfaces " + name, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const path of [
      "/",
      "/library",
      "/gallery",
      "/practice",
      "/tools",
      "/settings",
      "/midi/demo",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, path + " overflows").toBe(false);
      if (path === "/")
        await page.screenshot({
          path: "test-results/" + name + "-overview.png",
          fullPage: true,
        });
      if (path === "/midi/demo") {
        if (width <= 850) {
          await page.getByRole("button", { name: "音轨与唱名设置" }).click();
          await expect(page.locator(".track-panel")).toBeVisible();
        }
        await page.screenshot({
          path: "test-results/" + name + "-workspace.png",
          fullPage: true,
        });
      }
    }
  });
}
test("tools are usable and gallery shows unavailable state", async ({
  page,
}) => {
  await page.goto("/tools");
  await page.getByRole("button", { name: "节拍器", exact: true }).click();
  await page.getByRole("button", { name: "开始节拍" }).click();
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await page.getByRole("button", { name: "调音与检测", exact: true }).click();
  await expect(page.getByRole("button", { name: "检测并开始" })).toBeVisible();
  await page.goto("/gallery");
  await expect(page.getByRole("status")).toContainText("云端暂时无法连接");
});

test("keyboard notes still work after using transport controls", async ({
  page,
}) => {
  await page.goto("/midi/demo");
  await page.getByRole("button", { name: "伴奏跟练", exact: true }).click();
  await page.keyboard.down("t");
  await expect(
    page.getByRole("button", { name: "C4，键盘 T", exact: true }),
  ).toHaveClass(/pressed/);
  await page.keyboard.up("t");
  await expect(
    page.getByRole("button", { name: "C4，键盘 T", exact: true }),
  ).not.toHaveClass(/pressed/);
});
