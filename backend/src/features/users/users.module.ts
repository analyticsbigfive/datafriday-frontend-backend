import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AuthModule } from '../../core/auth/auth.module';
import { UserAccessService } from './services/user-access.service';
import { UserInvitationService } from './services/user-invitation.service';
import { UserSupportService } from './services/user-support.service';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [
    UserSupportService,
    UsersService,
    UserInvitationService,
    UserAccessService,
  ],
  exports: [
    UserSupportService,
    UsersService,
    UserInvitationService,
    UserAccessService,
  ],
})
export class UsersModule {}
