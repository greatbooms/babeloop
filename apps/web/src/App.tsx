import { useMutation, useQuery } from '@apollo/client';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router';
import { graphql } from './generated';
import { LoginPage } from './pages/LoginPage';
import { BrandsPage } from './pages/BrandsPage';
import { MediaPage } from './pages/MediaPage';
import { SourceAdsPage } from './pages/SourceAdsPage';
import { BriefsPage } from './pages/BriefsPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { ReviewPage } from './pages/ReviewPage';

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
      {me && (
        <nav>
          <Link to="/brands">브랜드</Link> | <Link to="/media">미디어</Link> | <Link to="/ads">광고</Link> |{' '}
          <Link to="/briefs">브리프</Link>
          {' | '}<Link to="/review">검토</Link> | <Link to="/experiments">실험</Link>{' '}
          <button onClick={() => void onLogout()}>로그아웃</button>
        </nav>
      )}
      <Routes>
        <Route path="/login" element={me ? <Navigate to="/brands" /> : <LoginPage onLogin={() => refetch()} />} />
        <Route path="/brands" element={me ? <BrandsPage /> : <Navigate to="/login" />} />
        <Route path="/media" element={me ? <MediaPage /> : <Navigate to="/login" />} />
        <Route path="/ads" element={me ? <SourceAdsPage /> : <Navigate to="/login" />} />
        <Route path="/briefs" element={me ? <BriefsPage /> : <Navigate to="/login" />} />
        <Route path="/review" element={me ? <ReviewPage /> : <Navigate to="/login" />} />
        <Route path="/experiments" element={me ? <ExperimentsPage /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={me ? '/brands' : '/login'} />} />
      </Routes>
    </>
  );
}
