import { useQuery } from '@apollo/client';
import { Link, Navigate, Route, Routes } from 'react-router';
import { graphql } from './generated';
import { LoginPage } from './pages/LoginPage';
import { BrandsPage } from './pages/BrandsPage';
import { MediaPage } from './pages/MediaPage';

const MeDocument = graphql(`
  query Me { me { id email displayName role } }
`);

export function App() {
  const { data, loading, refetch } = useQuery(MeDocument, { errorPolicy: 'ignore' });

  if (loading) return <p>로딩 중…</p>;
  const me = data?.me ?? null;

  return (
    <>
      {me && (
        <nav>
          <Link to="/brands">브랜드</Link> | <Link to="/media">미디어</Link>
        </nav>
      )}
      <Routes>
        <Route path="/login" element={me ? <Navigate to="/brands" /> : <LoginPage onLogin={() => refetch()} />} />
        <Route path="/brands" element={me ? <BrandsPage /> : <Navigate to="/login" />} />
        <Route path="/media" element={me ? <MediaPage /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={me ? '/brands' : '/login'} />} />
      </Routes>
    </>
  );
}
