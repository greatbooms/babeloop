import { useMutation, useQuery } from '@apollo/client';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { AppShell } from './components/AppShell';
import { graphql } from './generated';
import { LoginPage } from './pages/LoginPage';
import { BrandsPage } from './pages/BrandsPage';
import { BrandDetailPage } from './pages/BrandDetailPage';
import { MediaPage } from './pages/MediaPage';
import { MediaDetailPage } from './pages/MediaDetailPage';
import { SourceAdsPage } from './pages/SourceAdsPage';
import { SourceAdDetailPage } from './pages/SourceAdDetailPage';
import { BriefsPage } from './pages/BriefsPage';
import { BriefDetailPage } from './pages/BriefDetailPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { ExperimentDetailPage } from './pages/ExperimentDetailPage';
import { ReviewPage } from './pages/ReviewPage';
import { ReviewDetailPage } from './pages/ReviewDetailPage';
import { GuidePage } from './pages/GuidePage';
import { PerformancePage } from './pages/PerformancePage';
import { HomePage } from './pages/HomePage';
import { useT } from './i18n/lang-context';

const MeDocument = graphql(`
  query Me { me { id email displayName role } }
`);

const LogoutDocument = graphql(`
  mutation Logout { logout }
`);

export function App() {
  const { t } = useT();
  const { data, loading, refetch } = useQuery(MeDocument, { errorPolicy: 'ignore' });
  const [logout] = useMutation(LogoutDocument);
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    await refetch();
    navigate('/login');
  }

  if (loading) return <p>{t('common.loading')}</p>;
  const me = data?.me ?? null;

  return (
    <>
      {me ? <AppShell user={me} onLogout={() => void onLogout()}><Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={me ? <Navigate to="/brands" /> : <LoginPage onLogin={() => refetch()} />} />
        <Route path="/brands" element={me ? <BrandsPage /> : <Navigate to="/login" />} />
        <Route path="/brands/:id" element={me ? <BrandDetailPage /> : <Navigate to="/login" />} />
        <Route path="/media" element={me ? <MediaPage /> : <Navigate to="/login" />} />
        <Route path="/media/:id" element={me ? <MediaDetailPage /> : <Navigate to="/login" />} />
        <Route path="/ads" element={me ? <SourceAdsPage /> : <Navigate to="/login" />} />
        <Route path="/ads/:id" element={me ? <SourceAdDetailPage /> : <Navigate to="/login" />} />
        <Route path="/briefs" element={me ? <BriefsPage /> : <Navigate to="/login" />} />
        <Route path="/briefs/:id" element={me ? <BriefDetailPage /> : <Navigate to="/login" />} />
        <Route path="/review" element={me ? <ReviewPage /> : <Navigate to="/login" />} />
        <Route path="/review/:id" element={me ? <ReviewDetailPage /> : <Navigate to="/login" />} />
        <Route path="/experiments" element={me ? <ExperimentsPage /> : <Navigate to="/login" />} />
        <Route path="/experiments/:id" element={me ? <ExperimentDetailPage /> : <Navigate to="/login" />} />
        <Route path="/performance" element={me ? <PerformancePage /> : <Navigate to="/login" />} />
        <Route path="/guide" element={me ? <GuidePage /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={me ? '/brands' : '/login'} />} />
      </Routes></AppShell> : <Routes>
        <Route path="/login" element={<LoginPage onLogin={() => refetch()} />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>}
    </>
  );
}
