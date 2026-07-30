import { Card } from '../components/Card';
import { useT } from '../i18n/lang-context';
import { fullGuide } from '../lib/full-guide';
import './media.css';
import './briefs.css';
import './guide.css';

export function GuidePage() {
  const { lang } = useT();
  const doc = fullGuide[lang];
  return (
    <section className="guide-page">
      <header className="page-header stage-create">
        <div>
          <div className="page-header-title-row"><h1>{doc.title}</h1></div>
          {doc.intro.map((paragraph) => <p key={paragraph} className="guide-intro">{paragraph}</p>)}
        </div>
      </header>

      <Card className="card-stack">
        <h2>{doc.rolesTitle}</h2>
        <ul className="guide-list">
          {doc.roles.map((role) => <li key={role}>{role}</li>)}
        </ul>
      </Card>

      <Card className="card-stack">
        <h2>{doc.loopTitle}</h2>
        <p className="guide-loop">{doc.loop}</p>
      </Card>

      {doc.stages.map((stage) => (
        <Card className={`card-stack guide-stage ${stage.stageClass}`} key={stage.title}>
          <div className="guide-stage-head">
            <span className="step-chip">{stage.chip}</span>
            <span className="guide-tab">{stage.tab}</span>
          </div>
          <h2>{stage.title}</h2>
          <p className="guide-what">{stage.what}</p>
          {stage.who && <p className="guide-who"><span className="facet-label">{doc.labels.who}</span> {stage.who}</p>}
          <div>
            <span className="facet-label">{doc.labels.steps}</span>
            <ol className="guide-steps">
              {stage.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          {stage.costs && (
            <div className="tag-row">
              {stage.costs.map((cost) => <span className="tag" key={cost}>{cost}</span>)}
            </div>
          )}
          {stage.states && <p className="guide-states"><span className="facet-label">{doc.labels.states}</span> {stage.states}</p>}
          {stage.tips?.map((tip) => <p className="guide-tip" key={tip}>💡 {tip}</p>)}
        </Card>
      ))}

      <Card className="card-stack">
        <h2>{doc.extrasTitle}</h2>
        {doc.extras.map((extra) => (
          <div className="guide-extra" key={extra.title}>
            <h3>{extra.title}</h3>
            {extra.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        ))}
      </Card>
    </section>
  );
}
