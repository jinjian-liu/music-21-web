import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  Link,
} from "react-router-dom";
import { App } from "./App";
import { AppLayout } from "./components/AppLayout";
import { AccountProvider } from "./features/account/context";
import { GalleryPage } from "./pages/GalleryPage";
import { LibraryPage } from "./pages/LibraryPage";
import { PracticePage } from "./pages/PracticePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ToolsPage } from "./pages/ToolsPage";
import { MidiWorkspace } from "./pages/MidiWorkspace";
import { AdminReviewsPage } from "./pages/AdminReviewsPage";
import "./instruments.css";
import "./styles.css";
function Workspace() {
  const location = useLocation();
  return <MidiWorkspace key={location.pathname} />;
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AccountProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<App />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="gallery" element={<GalleryPage />} />
            <Route path="practice" element={<PracticePage />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin/reviews" element={<AdminReviewsPage />} />
            <Route
              path="*"
              element={
                <>
                  <h1>这个页面没有找到</h1>
                  <Link to="/">返回概览</Link>
                </>
              }
            />
          </Route>
          <Route path="/midi/:pieceId" element={<Workspace />} />
          <Route path="/pieces/:pieceId" element={<Workspace />} />
          <Route path="/admin/preview/:pieceId" element={<Workspace />} />
        </Routes>
      </AccountProvider>
    </BrowserRouter>
  </StrictMode>,
);
