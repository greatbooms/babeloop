import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { MarketModel } from './market.model';
import { MarketService } from './market.service';

@Resolver(() => MarketModel)
@UseGuards(GqlAuthGuard)
export class MarketResolver {
  constructor(private readonly marketService: MarketService) {}

  @Query(() => [MarketModel])
  markets() {
    return this.marketService.findAll();
  }
}
