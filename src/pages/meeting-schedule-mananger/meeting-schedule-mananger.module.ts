import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MeetingScheduleManangerPage } from './meeting-schedule-mananger';

@NgModule({
  declarations: [
    MeetingScheduleManangerPage,
  ],
  imports: [
    IonicPageModule.forChild(MeetingScheduleManangerPage),
  ],
})
export class MeetingScheduleManangerPageModule {}
