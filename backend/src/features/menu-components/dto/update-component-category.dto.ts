import { PartialType } from '@nestjs/swagger';
import { CreateComponentCategoryDto } from './create-component-category.dto';

export class UpdateComponentCategoryDto extends PartialType(CreateComponentCategoryDto) {}
