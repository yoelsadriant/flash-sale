import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ApiProvider } from './api/ApiProvider';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { getUser } from './api/auth';
import { User } from './interfaces';

export function App() {
  const [user, setUser] = useState<User | null>(getUser);

  return (
    <ApiProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              user
                ? <Navigate to="/" replace />
                : <LoginPage onAuth={setUser} />
            }
          />
          <Route
            path="/"
            element={
              user
                ? <HomePage user={user} onSignOut={() => setUser(null)} />
                : <Navigate to="/login" replace />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ApiProvider>
  );
}
