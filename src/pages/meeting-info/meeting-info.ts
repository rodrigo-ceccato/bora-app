import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

/**
 * Generated class for the MeetingInfoPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-meeting-info',
  templateUrl: 'meeting-info.html',
})
export class MeetingInfoPage {

  constructor(public navCtrl: NavController, public navParams: NavParams) {
    this.navParams.get('parameter');
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MeetingInfoPage');
  }

}
