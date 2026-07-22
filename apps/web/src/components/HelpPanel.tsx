import { commonTerms, pageGuides, type PageGuideKey } from '../lib/page-guides';
import { useT } from '../i18n/lang-context';

export function InfoTip({ hint }: { hint: string }) {
  return <span className="info-tip" data-hint={hint} tabIndex={0} aria-label={hint}>?</span>;
}

export function HelpPanel({ page }: { page: PageGuideKey }) {
  const { lang, t } = useT();
  const guide = pageGuides[page][lang];
  const terms = guide.terms ?? commonTerms[lang];
  return (
    <details className="help-panel">
      <summary><span aria-hidden="true">📖</span> {t('guides.summary')}</summary>
      <div className="help-panel-content">
        <section><h2>{t('guides.role')}</h2><p>{guide.role}</p></section>
        <section><h2>{t('guides.steps')}</h2><ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
        <section><h2>{t('guides.buttons')}</h2><div className="table-wrap"><table><thead><tr><th>{t('guides.button')}</th><th>{t('guides.action')}</th></tr></thead><tbody>{guide.buttons.map((button) => <tr key={button.name}><td>{button.name}</td><td>{button.description}</td></tr>)}</tbody></table></div></section>
        <section><h2>{t('guides.terms')}</h2><dl>{terms.map((item) => <div key={item.term}><dt>{item.term}</dt><dd>{item.description}</dd></div>)}</dl></section>
      </div>
    </details>
  );
}
