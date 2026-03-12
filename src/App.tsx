import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/app-shell/AppShell";
import { routes } from "./app/router";

function App() {
  return (
    <AppShell>
      <Routes>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
