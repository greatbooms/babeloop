import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { CreativeStatus } from '../../../generated/prisma';

export enum PerformanceCoverage {
  FULL = 'FULL',
  PARTIAL = 'PARTIAL',
  MISSING = 'MISSING',
}

registerEnumType(PerformanceCoverage, { name: 'PerformanceCoverage' });

@ObjectType()
export class PerformanceImportResultModel {
  @Field(() => ID) id: string;
  @Field(() => Int) importedRows: number;
  @Field(() => Int) updatedRows: number;
  @Field(() => Int) errorRows: number;
  @Field(() => [String]) errors: string[];
  @Field(() => [String]) unmatchedTrackingCodes: string[];
  @Field() duplicateFile: boolean;
}

@ObjectType()
export class PerformanceImportModel {
  @Field(() => ID) id: string;
  @Field() filename: string;
  @Field() fileHash: string;
  @Field(() => Int) importedRows: number;
  @Field(() => Int) updatedRows: number;
  @Field(() => Int) errorRows: number;
  @Field(() => [String]) errors: string[];
  @Field(() => [String]) unmatchedTrackingCodes: string[];
  @Field(() => ID, { nullable: true }) createdById: string | null;
  @Field() createdAt: Date;
}

@ObjectType()
export class VariantPerformanceModel {
  @Field(() => ID) experimentVariantId: string;
  @Field(() => ID) creativeId: string;
  @Field() variantCode: string;
  @Field() trackingCode: string;
  @Field(() => String, { nullable: true }) hookType: string | null;
  @Field() koreanTextSummary: string;
  @Field(() => CreativeStatus) status: CreativeStatus;
  @Field(() => Int, { nullable: true }) impressions: number | null;
  @Field(() => Int, { nullable: true }) clicks: number | null;
  @Field(() => Int, { nullable: true }) installs: number | null;
  @Field(() => Int, { nullable: true }) signups: number | null;
  @Field(() => Int, { nullable: true }) firstMessages: number | null;
  @Field(() => Float, { nullable: true }) cost: number | null;
  @Field() currency: string;
  @Field(() => Float, { nullable: true }) ctr: number | null;
  @Field(() => Float, { nullable: true }) cpi: number | null;
  @Field(() => Float, { nullable: true }) costPerSignup: number | null;
  @Field(() => Float, { nullable: true }) installToSignupRate: number | null;
  @Field(() => Float, { nullable: true }) signupToFirstMessageRate: number | null;
  @Field(() => PerformanceCoverage) signupsCoverage: PerformanceCoverage;
  @Field(() => PerformanceCoverage) firstMessagesCoverage: PerformanceCoverage;
}
