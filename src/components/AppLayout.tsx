import { NavLink, Outlet, Link } from "react-router-dom";
import { Icon } from "./ui";
import { useAccount } from "../features/account/context";
const links = [
  ["/", "home", "概览"],
  ["/library", "library", "我的曲库"],
  ["/gallery", "discover", "发现曲目"],
  ["/practice", "history", "练习记录"],
  ["/tools", "tools", "练习工具"],
];
export function AppLayout() {
  const { user } = useAccount();
  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Icon name="music" />
          </span>
          <span>
            弦知<small>让练习，自然发生</small>
          </span>
        </Link>
        <nav aria-label="主导航">
          {links.map(([path, icon, label]) => (
            <NavLink end={path === "/"} key={path} to={path}>
              <Icon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <i />
            本地优先 · 自在练习
          </div>
          {user?.role === "admin" && <Link to="/admin/reviews">内容管理</Link>}
          <Link to="/settings" className="account-link">
            <span className="avatar">
              {user?.displayName.slice(0, 1) || <Icon name="user" />}
            </span>
            <span>
              {user?.displayName || "访客"}
              <small>{user ? "账号与偏好" : "登录以保存到云端"}</small>
            </span>
            <span>›</span>
          </Link>
        </div>
      </aside>
      <main className="platform-main">
        <Outlet />
      </main>
    </div>
  );
}
