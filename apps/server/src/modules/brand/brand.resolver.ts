import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateBrandInput, UpdateBrandInput } from './brand.inputs';
import { BrandModel } from './brand.models';
import { BrandService } from './brand.service';

@Resolver(() => BrandModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class BrandResolver {
  constructor(private readonly brandService: BrandService) {}

  @Query(() => [BrandModel])
  brands() {
    return this.brandService.findAll();
  }

  @Query(() => BrandModel)
  brand(@Args('id', { type: () => ID }) id: string) {
    return this.brandService.findById(id);
  }

  @Mutation(() => BrandModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  createBrand(@Args('input') input: CreateBrandInput) {
    return this.brandService.create(input);
  }

  @Mutation(() => BrandModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  updateBrand(@Args('input') input: UpdateBrandInput) {
    return this.brandService.update(input);
  }
}
