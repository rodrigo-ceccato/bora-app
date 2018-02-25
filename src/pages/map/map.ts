import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-map',
  templateUrl: 'map.html',
})
export class MapPage {
  lat: number = 51.678418;
  lng: number = 7.809007;

  pinVector = [
    { lat: 51.67822,
      lng: 7.809001
    },
    { lat: 51.678415,
      lng: 7.809015
    },
    { lat: 51.678452,
      lng: 7.809001
    },
  ];

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MapPage');
  }

}
