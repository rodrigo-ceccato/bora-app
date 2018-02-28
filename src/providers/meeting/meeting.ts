import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { API_ENDPOINT } from '../../models/consts';

/*
  Generated class for the MeetingProvider provider.

  See https://angular.io/guide/dependency-injection for more info on providers
  and Angular DI.
*/
@Injectable()
export class MeetingProvider {

  constructor(public http: HttpClient) {
    console.log('Hello MeetingProvider Provider');
  }


  addEvent (event) {
    this.http.post(API_ENDPOINT + '/events', event).subscribe((data) => {

      console.log(event , 'adicionado');
    });
  }

}
