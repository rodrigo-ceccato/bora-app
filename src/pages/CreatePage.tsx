import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCheckbox, IonContent, IonDatetime, IonHeader, IonInput, IonItem, IonLabel, IonPage, IonSegment, IonSegmentButton, IonTextarea, IonTitle, IonToolbar, useIonRouter, useIonToast } from '@ionic/react';
import { useMemo, useState } from 'react';
import { createEvent } from '../lib/store';
import { defaultDays, normalizeLines, uid } from '../lib/schedule';
import type { BoraMode, ScheduleDay } from '../lib/types';

export default function CreatePage() {
  const router = useIonRouter();
  const [toast] = useIonToast();
  const [mode, setMode] = useState<BoraMode>('agora');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [description, setDescription] = useState('');
  const [threshold, setThreshold] = useState(3);
  const [startsAt, setStartsAt] = useState(new Date().toISOString());
  const [createdByName, setCreatedByName] = useState('');
  const [alternativesText, setAlternativesText] = useState('Hoje 20:00\nAmanhã 19:30');
  const [days, setDays] = useState<ScheduleDay[]>(defaultDays());

  const modeHelp = useMemo(() => ({
    agora: 'Confirmação rápida: vai acontecer se pelo menos X pessoas toparem agora.',
    'mais-tarde': 'Confirmação para mais tarde, com alternativas de horário/dia.',
    marcar: 'Disponibilidade por dia e horário em cards horizontais.'
  }[mode]), [mode]);

  function updateDay(dayId: string, patch: Partial<ScheduleDay>) {
    setDays((current) => current.map((day) => day.id === dayId ? { ...day, ...patch } : day));
  }

  function updateSlots(dayId: string, value: string) {
    updateDay(dayId, { slots: normalizeLines(value) });
  }

  function addDay() {
    setDays((current) => [...current, { id: uid('day'), label: 'Novo dia', date: new Date().toISOString().slice(0, 10), slots: ['18:00', '19:00'] }]);
  }

  async function submit() {
    if (!title.trim() || !place.trim()) {
      toast({ message: 'Informe nome e local do evento.', color: 'danger', duration: 2200 });
      return;
    }
    const event = await createEvent({
      mode,
      title: title.trim(),
      place: place.trim(),
      description: description.trim(),
      threshold,
      startsAt: mode === 'agora' || mode === 'mais-tarde' ? startsAt : undefined,
      alternatives: mode === 'mais-tarde' ? normalizeLines(alternativesText) : [],
      days: mode === 'marcar' ? days : [],
      createdByName: createdByName.trim() || undefined
    });
    router.push(`/e/${event.slug}?admin=${event.adminToken}`, 'forward');
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
          <IonTitle>Criar Bora</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding form-page">
        <IonCard>
          <IonCardContent>
            <IonSegment value={mode} onIonChange={(event) => setMode(event.detail.value as BoraMode)}>
              <IonSegmentButton value="agora">Agora</IonSegmentButton>
              <IonSegmentButton value="mais-tarde">Mais tarde</IonSegmentButton>
              <IonSegmentButton value="marcar">Marcar</IonSegmentButton>
            </IonSegment>
            <p className="muted">{modeHelp}</p>

            <IonItem><IonLabel position="stacked">Nome do evento</IonLabel><IonInput value={title} onIonInput={(e) => setTitle(e.detail.value || '')} placeholder="Bar, cinema, jogo em casa..." /></IonItem>
            <IonItem><IonLabel position="stacked">Local</IonLabel><IonInput value={place} onIonInput={(e) => setPlace(e.detail.value || '')} placeholder="Nome/endereço/link" /></IonItem>
            <IonItem><IonLabel position="stacked">Seu nome (opcional)</IonLabel><IonInput value={createdByName} onIonInput={(e) => setCreatedByName(e.detail.value || '')} /></IonItem>
            <IonItem><IonLabel position="stacked">Descrição</IonLabel><IonTextarea value={description} onIonInput={(e) => setDescription(e.detail.value || '')} placeholder="Detalhes rápidos do rolê" /></IonItem>
            <IonItem><IonLabel position="stacked">Acontece se tiver pelo menos</IonLabel><IonInput type="number" min={1} value={threshold} onIonInput={(e) => setThreshold(Number(e.detail.value || 1))} /></IonItem>

            {(mode === 'agora' || mode === 'mais-tarde') && (
              <IonItem><IonLabel position="stacked">Quando</IonLabel><IonDatetime value={startsAt} onIonChange={(e) => setStartsAt(String(e.detail.value))} /></IonItem>
            )}

            {mode === 'mais-tarde' && (
              <IonItem><IonLabel position="stacked">Alternativas, uma por linha</IonLabel><IonTextarea value={alternativesText} onIonInput={(e) => setAlternativesText(e.detail.value || '')} /></IonItem>
            )}

            {mode === 'marcar' && (
              <div className="day-editor">
                <h2>Dias e horários</h2>
                {days.map((day) => (
                  <IonCard key={day.id}>
                    <IonCardContent>
                      <IonItem><IonLabel position="stacked">Rótulo do dia</IonLabel><IonInput value={day.label} onIonInput={(e) => updateDay(day.id, { label: e.detail.value || '' })} /></IonItem>
                      <IonItem><IonLabel position="stacked">Data</IonLabel><IonInput type="date" value={day.date} onIonInput={(e) => updateDay(day.id, { date: e.detail.value || '' })} /></IonItem>
                      <IonItem><IonLabel position="stacked">Horários, um por linha</IonLabel><IonTextarea value={day.slots.join('\n')} onIonInput={(e) => updateSlots(day.id, e.detail.value || '')} /></IonItem>
                    </IonCardContent>
                  </IonCard>
                ))}
                <IonButton fill="outline" onClick={addDay}>Adicionar dia</IonButton>
              </div>
            )}

            <IonItem lines="none"><IonCheckbox checked /> <IonLabel className="ion-margin-start">Convidados não precisam de conta, só informar o nome.</IonLabel></IonItem>
            <IonButton expand="block" size="large" onClick={submit}>Criar link do Bora</IonButton>
          </IonCardContent>
        </IonCard>
      </IonContent>
    </IonPage>
  );
}
