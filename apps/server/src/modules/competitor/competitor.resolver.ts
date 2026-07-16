import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCompetitorInput } from './competitor.inputs';
import { CompetitorModel } from './competitor.model';
import { CompetitorService } from './competitor.service';

@Resolver(() => CompetitorModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class CompetitorResolver {
  constructor(private readonly competitorService: CompetitorService) {}

  @Query(() => [CompetitorModel])
  competitors() {
    return this.competitorService.findAll();
  }

  @Mutation(() => CompetitorModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  createCompetitor(@Args('input') input: CreateCompetitorInput) {
    return this.competitorService.create(input);
  }
}
