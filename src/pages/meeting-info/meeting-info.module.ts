import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MeetingInfoPage } from './meeting-info';

@NgModule({
  declarations: [
    MeetingInfoPage,
  ],
  imports: [
    IonicPageModule.forChild(MeetingInfoPage),
  ],
})
export class MeetingInfoPageModule {}
