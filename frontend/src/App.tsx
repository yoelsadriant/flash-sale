import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ApiProvider } from './api/ApiProvider';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { getUser } from './api/auth';
import { User } from '@/types';

export function App() {
  const [user, setUser] = useState<User | null>(getUser);

  return (
    <ApiProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={<HomePage user={user} onSignOut={() => setUser(null)} />}
          />
          <Route
            path="/login"
            element={
              user ? <Navigate to="/" replace /> : <LoginPage onAuth={setUser} />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ApiProvider>
  );
}
