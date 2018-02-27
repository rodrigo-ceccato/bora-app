import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { BoraagoraPage } from '../boraagora/boraagora';

/**
 * Generated class for the BoraHojePage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-bora-hoje',
  templateUrl: 'bora-hoje.html',
})
export class BoraHojePage {

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad BorahojePage');
  }
  openPageBoraAgora(){
    this.navCtrl.push(BoraagoraPage);
  }
}


