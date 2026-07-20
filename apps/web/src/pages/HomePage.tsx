import { Link } from 'react-router';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import './home.css';

const loopSteps = [
  { number: '01', title: '수집', tab: '광고', to: '/ads', description: 'CSV 임포트와 수동 등록으로 경쟁 광고를 한곳에 모읍니다.' },
  { number: '02', title: '분석', tab: '광고', to: '/ads', description: '미디어 텍스트를 추출하고 광고의 훅과 패턴을 분석합니다.' },
  { number: '03', title: '생성', tab: '브리프', to: '/briefs', description: '경쟁 광고를 근거로 브리프와 문구 변형, zh-TW 초안을 만듭니다.' },
  { number: '04', title: '검토', tab: '검토', to: '/review', description: '정책 검사와 검수를 거쳐 집행할 문구를 승인합니다.' },
  { number: '05', title: '내보내기', tab: '실험', to: '/experiments', description: '승인 문구를 실험에 배정하고 추적코드 패키지를 받습니다.' },
  { number: '06', title: '성과', tab: '성과', to: '/performance', description: '집행 성과를 연결해 퍼널을 보고 다음 브리프로 되먹입니다.' },
] as const;

export function HomePage() {
  return (
    <section>
      <PageHeader title="BabeLoop — 경쟁 광고를 배우고, 우리 광고를 만들고, 성과로 되먹입니다." description="수집부터 성과 환류까지, 여섯 단계가 하나의 반복 가능한 광고 운영 루프를 이룹니다." />
      <ol className="loop-grid">
        {loopSteps.map((step) => (
          <li key={step.number}>
            <Card className="loop-card">
              <span className="loop-number">{step.number}</span>
              <h2>{step.title}</h2>
              <p>{step.description}</p>
              <Link to={step.to}>{step.tab} 탭으로 이동</Link>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
