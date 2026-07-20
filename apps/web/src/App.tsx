import { useMutation, useQuery } from '@apollo/client';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { AppShell } from './components/AppShell';
import { graphql } from './generated';
import { LoginPage } from './pages/LoginPage';
import { BrandsPage } from './pages/BrandsPage';
import { MediaPage } from './pages/MediaPage';
import { SourceAdsPage } from './pages/SourceAdsPage';
import { BriefsPage } from './pages/BriefsPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { ReviewPage } from './pages/ReviewPage';
import { PerformancePage } from './pages/PerformancePage';
import { HomePage } from './pages/HomePage';

const MeDocument = graphql(`
  query Me { me { id email displayName role } }
`);

const LogoutDocument = graphql(`
  mutation Logout { logout }
`);

export function App() {
  const { data, loading, refetch } = useQuery(MeDocument, { errorPolicy: 'ignore' });
  const [logout] = useMutation(LogoutDocument);
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    await refetch();
    navigate('/login');
  }

  if (loading) return <p>로딩 중…</p>;
  const me = data?.me ?? null;

  return (
    <>
      {me ? <AppShell user={me} onLogout={() => void onLogout()}><Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={me ? <Navigate to="/brands" /> : <LoginPage onLogin={() => refetch()} />} />
        <Route path="/brands" element={me ? <BrandsPage /> : <Navigate to="/login" />} />
        <Route path="/media" element={me ? <MediaPage /> : <Navigate to="/login" />} />
        <Route path="/ads" element={me ? <SourceAdsPage /> : <Navigate to="/login" />} />
        <Route path="/briefs" element={me ? <BriefsPage /> : <Navigate to="/login" />} />
        <Route path="/review" element={me ? <ReviewPage /> : <Navigate to="/login" />} />
        <Route path="/experiments" element={me ? <ExperimentsPage /> : <Navigate to="/login" />} />
        <Route path="/performance" element={me ? <PerformancePage /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={me ? '/brands' : '/login'} />} />
      </Routes></AppShell> : <Routes>
        <Route path="/login" element={<LoginPage onLogin={() => refetch()} />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>}
    </>
  );
}
