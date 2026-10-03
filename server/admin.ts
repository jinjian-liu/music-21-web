import "dotenv/config";
import { query } from "./repository";
import { pool } from "./db";
const email = process.argv[2]?.trim().toLowerCase();
try {
  if (!email || !email.includes("@"))
    throw new Error("用法：npm run admin:create -- 已注册的邮箱");
  const rows = await query(
    "UPDATE users SET role='admin' WHERE email=$1 RETURNING id",
    [email],
  );
  if (!rows.length) throw new Error("账号不存在，请先通过页面注册");
  console.log("管理员角色已设置");
} finally {
  await pool.end();
}
