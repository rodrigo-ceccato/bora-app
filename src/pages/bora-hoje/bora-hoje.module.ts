import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { BoraHojePage } from './bora-hoje';

@NgModule({
  declarations: [
    BoraHojePage,
  ],
  imports: [
    IonicPageModule.forChild(BoraHojePage),
  ],
})
export class BoraHojePageModule {}
