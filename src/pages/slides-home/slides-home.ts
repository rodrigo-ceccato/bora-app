import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { TabsPage } from '../tabs/tabs';

/**
 * Generated class for the SlidesHomePage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-slides-home',
  templateUrl: 'slides-home.html',
})
export class SlidesHomePage {

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad SlidesHomePage');
  }
  slides = [
    {
      title: "Bem-vido ao Bora!",
      description: "O <b>Bora app</b> é um app que facilita a organização de evnetos entre amigos!",
      image: "assets/img/ica-slidebox-img-1.png",
    },
    {
      title: "Facil e simples de usar!",
      description: "<b>Bora app</b> é simples o suficiente igual gritar para os seus amigos pra sair!",
      image: "assets/img/ica-slidebox-img-2.png",
    }
   
  ];
  skip(){
    this.navCtrl.push(TabsPage);
  }
}



