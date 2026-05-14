import { ApiProvider } from './api/ApiProvider';
import { HomePage } from './pages/HomePage';
import { getUser } from './api/auth';

export function App() {
  const initialUser = getUser();

  return (
    <ApiProvider>
      <HomePage initialUser={initialUser} />
    </ApiProvider>
  );
}
