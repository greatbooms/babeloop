import { commonTerms, pageGuides, type PageGuideKey } from '../lib/page-guides';

export function InfoTip({ hint }: { hint: string }) {
  return <span className="info-tip" data-hint={hint} tabIndex={0} aria-label={hint}>?</span>;
}

export function HelpPanel({ page }: { page: PageGuideKey }) {
  const guide = pageGuides[page];
  const terms = guide.terms ?? commonTerms;
  return (
    <details className="help-panel">
      <summary><span aria-hidden="true">📖</span> 이 화면 자세한 사용법</summary>
      <div className="help-panel-content">
        <section><h2>이 화면의 역할</h2><p>{guide.role}</p></section>
        <section><h2>사용 순서</h2><ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
        <section><h2>버튼별 설명</h2><div className="table-wrap"><table><thead><tr><th>버튼</th><th>하는 일</th></tr></thead><tbody>{guide.buttons.map((button) => <tr key={button.name}><td>{button.name}</td><td>{button.description}</td></tr>)}</tbody></table></div></section>
        <section><h2>용어 설명</h2><dl>{terms.map((item) => <div key={item.term}><dt>{item.term}</dt><dd>{item.description}</dd></div>)}</dl></section>
      </div>
    </details>
  );
}
