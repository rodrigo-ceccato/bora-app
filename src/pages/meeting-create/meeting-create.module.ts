import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MeetingCreatePage } from './meeting-create';


@NgModule({
  declarations: [
    MeetingCreatePage,

  ],
  imports: [
    IonicPageModule.forChild(MeetingCreatePage),
  ],
})
export class MeetingCreatePageModule {
  
}
