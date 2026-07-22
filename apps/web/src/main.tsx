import { ApolloProvider } from '@apollo/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { apolloClient } from './apollo';
import { LangProvider } from './i18n/lang-context';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './styles/tokens.css';
import './styles/base.css';
import './components/components.css';
import './pages/pages.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <LangProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LangProvider>
    </ApolloProvider>
  </StrictMode>,
);
