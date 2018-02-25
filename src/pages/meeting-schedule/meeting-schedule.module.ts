import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MeetingSchedulePage } from './meeting-schedule';

@NgModule({
  declarations: [
    MeetingSchedulePage,
  ],
  imports: [
    IonicPageModule.forChild(MeetingSchedulePage),
  ],
})
export class MeetingSchedulePageModule {}
