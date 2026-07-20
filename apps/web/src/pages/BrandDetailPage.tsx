import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { graphql } from '../generated';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';

const BrandDocument = graphql(`
  query Brand($id: ID!) {
    brand(id: $id) { id name serviceUrl description features { id name description } guidelines { id title content } }
  }
`);

const UpdateBrandDocument = graphql(`mutation UpdateBrand($input: UpdateBrandInput!) { updateBrand(input: $input) { id name serviceUrl description } }`);
const AddBrandFeatureDocument = graphql(`mutation AddBrandFeature($brandId: ID!, $name: String!, $description: String!) { addBrandFeature(brandId: $brandId, name: $name, description: $description) { id } }`);
const DeleteBrandFeatureDocument = graphql(`mutation DeleteBrandFeature($id: ID!) { deleteBrandFeature(id: $id) }`);
const AddBrandGuidelineDocument = graphql(`mutation AddBrandGuideline($brandId: ID!, $title: String!, $content: String!) { addBrandGuideline(brandId: $brandId, title: $title, content: $content) { id } }`);
const DeleteBrandGuidelineDocument = graphql(`mutation DeleteBrandGuideline($id: ID!) { deleteBrandGuideline(id: $id) }`);

export function BrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useQuery(BrandDocument, { variables: { id: id! }, skip: !id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [serviceUrl, setServiceUrl] = useState('');
  const [description, setDescription] = useState('');
  const [featureName, setFeatureName] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [guidelineTitle, setGuidelineTitle] = useState('');
  const [guidelineContent, setGuidelineContent] = useState('');
  const [updateBrand] = useMutation(UpdateBrandDocument);
  const [addFeature] = useMutation(AddBrandFeatureDocument);
  const [deleteFeature] = useMutation(DeleteBrandFeatureDocument);
  const [addGuideline] = useMutation(AddBrandGuidelineDocument);
  const [deleteGuideline] = useMutation(DeleteBrandGuidelineDocument);

  const brand = data?.brand;
  if (!brand) return <section><p className="muted">브랜드를 불러오는 중…</p></section>;

  function startEdit() {
    setName(brand!.name);
    setServiceUrl(brand!.serviceUrl ?? '');
    setDescription(brand!.description ?? '');
    setEditing(true);
  }

  async function saveBasics() {
    await updateBrand({ variables: { input: { id: brand!.id, name, serviceUrl: serviceUrl || null, description } } });
    await refetch();
    setEditing(false);
  }

  return (
    <section className="stage-prep brand-detail">
      <Link className="back-link" to="/brands">← 브랜드 목록</Link>

      <header className="page-header">
        <div>
          <div className="page-header-title-row">
            <h1>{brand.name}</h1>
            <span className="step-chip">브리프 재료</span>
          </div>
          {brand.serviceUrl && <p><a href={brand.serviceUrl} target="_blank" rel="noreferrer">{brand.serviceUrl}</a></p>}
        </div>
        <div className="page-header-actions">
          {!editing && <Button variant="primary" onClick={startEdit}>수정</Button>}
          {editing && (
            <div className="inline-actions">
              <Button variant="primary" onClick={() => void saveBasics()}>저장</Button>
              <Button onClick={() => setEditing(false)}>취소</Button>
            </div>
          )}
        </div>
      </header>

      {!editing ? (
        <>
          <Card className="card-stack">
            <h2>소개</h2>
            <p className="brand-description">{brand.description || <span className="muted">아직 소개가 없습니다. 「수정」을 눌러 채워주세요.</span>}</p>
          </Card>
          <Card className="card-stack">
            <h2>주요 기능 ({brand.features.length})</h2>
            {brand.features.length === 0 && <p className="muted">등록된 기능이 없습니다.</p>}
            <dl className="brand-dl">
              {brand.features.map((feature) => (
                <div key={feature.id}><dt>{feature.name}</dt><dd>{feature.description}</dd></div>
              ))}
            </dl>
          </Card>
          <Card className="card-stack">
            <h2>가이드라인 ({brand.guidelines.length})</h2>
            {brand.guidelines.length === 0 && <p className="muted">등록된 가이드라인이 없습니다.</p>}
            <dl className="brand-dl">
              {brand.guidelines.map((guideline) => (
                <div key={guideline.id}><dt>{guideline.title}</dt><dd>{guideline.content}</dd></div>
              ))}
            </dl>
          </Card>
        </>
      ) : (
        <>
          <Card className="card-stack">
            <h2>기본 정보</h2>
            <FormField label="브랜드명" htmlFor="edit-brand-name"><input id="edit-brand-name" value={name} onChange={(event) => setName(event.target.value)} /></FormField>
            <FormField label="서비스 URL" htmlFor="edit-brand-url"><input id="edit-brand-url" type="url" value={serviceUrl} onChange={(event) => setServiceUrl(event.target.value)} /></FormField>
            <FormField label="소개" htmlFor="edit-brand-description"><textarea id="edit-brand-description" value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
          </Card>
          <Card className="card-stack">
            <h2>주요 기능</h2>
            <ul className="compact-list">
              {brand.features.map((feature) => (
                <li key={feature.id}>
                  <span><strong>{feature.name}</strong> — {feature.description}</span>
                  <Button size="sm" onClick={() => void deleteFeature({ variables: { id: feature.id } }).then(() => refetch())}>삭제</Button>
                </li>
              ))}
            </ul>
            <FormField label="기능 이름" htmlFor="new-feature-name"><input id="new-feature-name" value={featureName} onChange={(event) => setFeatureName(event.target.value)} /></FormField>
            <FormField label="기능 설명" htmlFor="new-feature-description"><input id="new-feature-description" value={featureDescription} onChange={(event) => setFeatureDescription(event.target.value)} /></FormField>
            <Button size="sm" disabled={!featureName || !featureDescription} onClick={() => void addFeature({ variables: { brandId: brand.id, name: featureName, description: featureDescription } }).then(() => { setFeatureName(''); setFeatureDescription(''); return refetch(); })}>기능 추가</Button>
          </Card>
          <Card className="card-stack">
            <h2>가이드라인</h2>
            <ul className="compact-list">
              {brand.guidelines.map((guideline) => (
                <li key={guideline.id}>
                  <span><strong>{guideline.title}</strong> — {guideline.content}</span>
                  <Button size="sm" onClick={() => void deleteGuideline({ variables: { id: guideline.id } }).then(() => refetch())}>삭제</Button>
                </li>
              ))}
            </ul>
            <FormField label="가이드라인 제목" htmlFor="new-guideline-title"><input id="new-guideline-title" value={guidelineTitle} onChange={(event) => setGuidelineTitle(event.target.value)} /></FormField>
            <FormField label="가이드라인 내용" htmlFor="new-guideline-content"><textarea id="new-guideline-content" value={guidelineContent} onChange={(event) => setGuidelineContent(event.target.value)} /></FormField>
            <Button size="sm" disabled={!guidelineTitle || !guidelineContent} onClick={() => void addGuideline({ variables: { brandId: brand.id, title: guidelineTitle, content: guidelineContent } }).then(() => { setGuidelineTitle(''); setGuidelineContent(''); return refetch(); })}>가이드라인 추가</Button>
          </Card>
        </>
      )}
    </section>
  );
}
