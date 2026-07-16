import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface UpsertEmbeddingInput {
  sourceAdId: string;
  model: string;
  dimension: number;
  vector: number[];
}

export interface SimilarResult {
  sourceAdId: string;
  similarity: number;
}

@Injectable()
export class VectorSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  async upsertEmbedding(input: UpsertEmbeddingInput): Promise<void> {
    if (input.vector.length !== input.dimension) {
      throw new Error(`임베딩 차원 불일치: expected ${input.dimension}, got ${input.vector.length}`);
    }
    const vec = this.toVectorLiteral(input.vector);
    await this.prisma.$executeRaw`
      INSERT INTO creative_embeddings (id, "sourceAdId", model, dimension, embedding, "createdAt")
      VALUES (${randomUUID()}, ${input.sourceAdId}, ${input.model}, ${input.dimension}, ${vec}::vector, now())
      ON CONFLICT ("sourceAdId", model)
      DO UPDATE SET embedding = EXCLUDED.embedding, dimension = EXCLUDED.dimension`;
  }

  async searchSimilar(params: {
    vector: number[];
    model: string;
    limit: number;
    excludeSourceAdId?: string;
  }): Promise<SimilarResult[]> {
    const vec = this.toVectorLiteral(params.vector);
    const exclude = params.excludeSourceAdId ?? '';
    const rows = await this.prisma.$queryRaw<{ sourceAdId: string; similarity: number }[]>`
      SELECT "sourceAdId", 1 - (embedding <=> ${vec}::vector) AS similarity
      FROM creative_embeddings
      WHERE model = ${params.model} AND "sourceAdId" <> ${exclude}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${params.limit}`;
    return rows.map((r) => ({ sourceAdId: r.sourceAdId, similarity: Number(r.similarity) }));
  }

  async getEmbeddingVector(sourceAdId: string, model: string): Promise<number[] | null> {
    const rows = await this.prisma.$queryRaw<{ v: string }[]>`
      SELECT embedding::text AS v FROM creative_embeddings
      WHERE "sourceAdId" = ${sourceAdId} AND model = ${model} LIMIT 1`;
    if (rows.length === 0) return null;
    return JSON.parse(rows[0].v) as number[];
  }
}
