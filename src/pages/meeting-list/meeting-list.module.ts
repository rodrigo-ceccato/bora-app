import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MeetingListPage } from './meeting-list';

@NgModule({
  declarations: [
    MeetingListPage,
  ],
  imports: [
    IonicPageModule.forChild(MeetingListPage),
  ],
})
export class MeetingListPageModule {}
