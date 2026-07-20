import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateBrandInput, UpdateBrandInput } from './brand.inputs';
import { BrandFeatureModel, BrandGuidelineModel, BrandModel } from './brand.models';
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

  @Mutation(() => BrandFeatureModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  addBrandFeature(
    @Args('brandId', { type: () => ID }) brandId: string,
    @Args('name') name: string,
    @Args('description') description: string,
  ) {
    return this.brandService.addFeature(brandId, name, description);
  }

  @Mutation(() => Boolean)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  deleteBrandFeature(@Args('id', { type: () => ID }) id: string) {
    return this.brandService.deleteFeature(id);
  }

  @Mutation(() => BrandGuidelineModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  addBrandGuideline(
    @Args('brandId', { type: () => ID }) brandId: string,
    @Args('title') title: string,
    @Args('content') content: string,
  ) {
    return this.brandService.addGuideline(brandId, title, content);
  }

  @Mutation(() => Boolean)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  deleteBrandGuideline(@Args('id', { type: () => ID }) id: string) {
    return this.brandService.deleteGuideline(id);
  }
}
