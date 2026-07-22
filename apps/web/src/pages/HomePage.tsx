import { Link } from 'react-router';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel } from '../components/HelpPanel';
import { useT } from '../i18n/lang-context';
import './home.css';

const loopSteps = [
  { number: '01', tone: 'collect', key: 'collect', to: '/ads' },
  { number: '02', tone: 'collect', key: 'analyze', to: '/ads' },
  { number: '03', tone: 'create', key: 'create', to: '/briefs' },
  { number: '04', tone: 'review', key: 'review', to: '/review' },
  { number: '05', tone: 'export', key: 'export', to: '/experiments' },
  { number: '06', tone: 'performance', key: 'performance', to: '/performance' },
] as const;

export function HomePage() {
  const { t } = useT();
  return (
    <section className="stage-collect">
      <PageHeader title={t('home.title')} description={t('home.description')} />
      <HelpPanel page="home" />
      <ol className="loop-grid">
        {loopSteps.map((step) => (
          <li key={step.number}>
            <Card className={`loop-card stage-${step.tone}`}>
              <span className="loop-number">{step.number}</span>
              <h2>{t(`home.steps.${step.key}.title`)}</h2>
              <p>{t(`home.steps.${step.key}.description`)}</p>
              <Link to={step.to}>{t('home.goToTab', { tab: t(`home.steps.${step.key}.tab`) })}</Link>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
