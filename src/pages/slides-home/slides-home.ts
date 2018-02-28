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
      image: "assets/imgs/Welcomeimg.png",
    },
    {
      title: "Facil e simples de usar!",
      description: "<b>Bora app</b> é simples como gritar para os seus amigos para sair!",
      image: "assets/imgs/easy.png",
    } ,
    {
      title: "Bora Hoje",
      description: "<b>Bora Hoje</b> é quando o tédio bate e a necessidade vira urgencia pra hoje!",
      image: "assets/imgs/today.png",
    } , 
    {title: "Bora Marcar",
    description: "<b>Bora Marcar</b> Auxilia na escolha de datas e organiza as pessoas para um evento!",
    image: "assets/imgs/calendar.png",
  }
   
  ];
  skip(){
    this.navCtrl.push(TabsPage);
  }
}



