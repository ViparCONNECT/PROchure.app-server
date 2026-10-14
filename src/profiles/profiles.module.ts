import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { ProfileDataService } from './profile-data.service';

@Module({
  providers: [ProfilesService, ProfileDataService],
  controllers: [ProfilesController],
  exports: [ProfileDataService],
})
export class ProfilesModule {}
