import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../../core/auth/auth.module';
import { MeService } from './me.service';

@Module({
    imports: [PrismaModule, AuthModule], // AuthModule exports JwtDatabaseStrategy (cache invalidation)
    controllers: [MeController],
    providers: [MeService],
})
export class MeModule { }
