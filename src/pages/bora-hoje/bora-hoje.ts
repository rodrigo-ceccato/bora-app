import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { BoraagoraPage } from '../boraagora/boraagora';
import { Geolocation } from '@ionic-native/geolocation';
import { Camera, CameraOptions } from '@ionic-native/camera';

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
  
  fotoURI:string;
  fotoTirada = false;
  gotLocation = false;
  latitude;
  longitude;

  constructor(public navCtrl: NavController, public navParams: NavParams,private camera: Camera,private geolocation: Geolocation) {
  }
evento = {
  eventName : "",
  eventTime : "",
  eventAdress: "",
  }

verificarVazio(){
  if(this.evento.eventName == "" ||
  this.evento.eventTime == "" ||
  this.evento.eventAdress==""){
    return true;
  }
}


  ionViewDidLoad() {
    console.log('ionViewDidLoad BoraHojePage');
  }
  openPageBoraAgora(){
    this.navCtrl.push(BoraagoraPage);
  }
  marcarEvento(){
       if(this.verificarVazio() ==  false){
          console.log(this.evento.eventName);
          console.log(this.evento.eventTime);
          console.log(this.evento.eventAdress);
          
          this.evento = {
            eventName : "",
            eventTime : "",
            eventAdress:"",
          }
          // nome, local, tempo, pessoas , data fixa , intervalo;
  }
  else{
    alert("Por favor preencha todos os campos!");

  }
}

takeProfilePicture(){
  const options: CameraOptions = {
    quality: 100,
    destinationType: this.camera.DestinationType.DATA_URL,
    encodingType: this.camera.EncodingType.JPEG,
    mediaType: this.camera.MediaType.PICTURE,
    targetWidth: 256
  }

  this.camera.getPicture(options).then((imageData) => {
    //img is a file uri
    this.fotoURI = imageData;
    this.fotoTirada = true;

   }, (err) => {
    // Handle error
    // TODO add error handler
   });


}
 
}
