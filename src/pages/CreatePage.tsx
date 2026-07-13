import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCheckbox, IonContent, IonDatetime, IonHeader, IonInput, IonItem, IonLabel, IonModal, IonNote, IonPage, IonTextarea, IonTitle, IonToolbar, useIonRouter, useIonToast, useIonViewWillEnter } from '@ionic/react';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createEvent } from '../lib/store';
import { defaultDays, uid } from '../lib/schedule';
import type { BoraMode, ScheduleDay } from '../lib/types';

const modeDetails: Record<BoraMode, { title: string; description: string }> = {
  agora: { title: 'Bora Agora', description: 'Defina um horário e veja se a galera topa sair agora.' },
  'mais-tarde': { title: 'Bora Mais Tarde', description: 'Escolha o horário principal e ofereça alternativas no mesmo dia.' },
  marcar: { title: 'Bora Marcar', description: 'Adicione dias e horários para a galera informar disponibilidade.' }
};

const scheduleTimes = Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);

export default function CreatePage() {
  const router = useIonRouter();
  const location = useLocation();
  const [toast] = useIonToast();
  const requestedMode = new URLSearchParams(location.search).get('mode');
  const mode: BoraMode = requestedMode === 'mais-tarde' || requestedMode === 'marcar' ? requestedMode : 'agora';
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [description, setDescription] = useState('');
  const [threshold, setThreshold] = useState('3');
  const [startsAt, setStartsAt] = useState(new Date().toISOString());
  const [createdByName, setCreatedByName] = useState('');
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [isAlternativeModalOpen, setIsAlternativeModalOpen] = useState(false);
  const [days, setDays] = useState<ScheduleDay[]>(defaultDays());
  const [submitted, setSubmitted] = useState(false);

  useIonViewWillEnter(() => {
    if (mode === 'agora') setStartsAt(new Date().toISOString());
  }, [mode]);

  const thresholdNumber = Number(threshold);
  const scheduleValid = days.length > 0 && days.every((day) => day.label.trim() && day.date && day.slots.length > 0);
  const primaryTime = useMemo(() => new Date(startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), [startsAt]);
  const availableOffsets = useMemo(() => [1, 2, 3, 4].filter((hours) => {
    const start = new Date(startsAt);
    const alternative = new Date(start.getTime() + hours * 60 * 60 * 1000);
    return start.toDateString() === alternative.toDateString();
  }), [startsAt]);

  function updateDay(dayId: string, patch: Partial<ScheduleDay>) {
    setDays((current) => current.map((day) => day.id === dayId ? { ...day, ...patch } : day));
  }

  function toggleSlot(dayId: string, slot: string, checked: boolean) {
    const day = days.find((item) => item.id === dayId);
    if (!day) return;
    updateDay(dayId, { slots: checked ? [...day.slots, slot] : day.slots.filter((item) => item !== slot) });
  }

  function addDay() {
    setDays((current) => [...current, { id: uid('day'), label: 'Novo dia', date: new Date().toISOString().slice(0, 10), slots: ['18:00', '19:00'] }]);
  }

  function removeDay(dayId: string) {
    setDays((current) => current.filter((day) => day.id !== dayId));
  }

  function addAlternative(hoursFromStart: number) {
    const alternativeTime = new Date(new Date(startsAt).getTime() + hoursFromStart * 60 * 60 * 1000)
      .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setAlternatives((current) => current.includes(alternativeTime) ? current : [...current, alternativeTime]);
    setIsAlternativeModalOpen(false);
  }

  async function submit() {
    setSubmitted(true);
    const hasRequiredFields = title.trim() && place.trim() && createdByName.trim();
    const hasValidThreshold = Number.isInteger(thresholdNumber) && thresholdNumber >= 1;
    if (!hasRequiredFields || !hasValidThreshold || (mode === 'marcar' && !scheduleValid)) {
      toast({ message: 'Revise os campos indicados antes de criar o Bora.', color: 'danger', duration: 2500 });
      return;
    }

    const event = await createEvent({
      mode,
      title: title.trim(),
      place: place.trim(),
      description: description.trim(),
      threshold: thresholdNumber,
      startsAt: mode === 'agora' || mode === 'mais-tarde' ? startsAt : undefined,
      alternatives: mode === 'mais-tarde' ? alternatives : [],
      days: mode === 'marcar' ? days : [],
      createdByName: createdByName.trim()
    });
    router.push(`/e/${event.slug}?admin=${event.adminToken}&created=1`, 'forward');
  }

  const detail = modeDetails[mode];

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
          <IonTitle>{detail.title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding form-page">
        <section className="create-intro">
          <h1>{detail.title}</h1>
          <p>{detail.description}</p>
        </section>
        <IonCard>
          <IonCardContent>
            <IonItem className={submitted && !title.trim() ? 'ion-invalid' : ''}>
              <IonLabel position="stacked">Nome do evento *</IonLabel>
              <IonInput value={title} onIonInput={(event) => setTitle(event.detail.value || '')} placeholder="Bar, cinema, jogo em casa..." aria-invalid={submitted && !title.trim()} />
            </IonItem>
            {submitted && !title.trim() && <IonNote className="field-error" color="danger">Informe o nome do evento.</IonNote>}

            <IonItem className={submitted && !place.trim() ? 'ion-invalid' : ''}>
              <IonLabel position="stacked">Local *</IonLabel>
              <IonInput value={place} onIonInput={(event) => setPlace(event.detail.value || '')} placeholder="Nome, endereço ou link" aria-invalid={submitted && !place.trim()} />
            </IonItem>
            {submitted && !place.trim() && <IonNote className="field-error" color="danger">Informe onde será o evento.</IonNote>}

            <IonItem className={submitted && !createdByName.trim() ? 'ion-invalid' : ''}>
              <IonLabel position="stacked">Seu nome *</IonLabel>
              <IonInput value={createdByName} onIonInput={(event) => setCreatedByName(event.detail.value || '')} placeholder="Ex: Ana" aria-invalid={submitted && !createdByName.trim()} required />
            </IonItem>
            {submitted && !createdByName.trim() && <IonNote className="field-error" color="danger">Seu nome é necessário.</IonNote>}

            <IonItem>
              <IonLabel position="stacked">Descrição <span className="optional-label">(opcional)</span></IonLabel>
              <IonTextarea value={description} onIonInput={(event) => setDescription(event.detail.value || '')} placeholder="Detalhes rápidos do rolê" />
            </IonItem>

            <IonItem className={submitted && (!Number.isInteger(thresholdNumber) || thresholdNumber < 1) ? 'ion-invalid' : ''}>
              <IonLabel position="stacked">Mínimo de confirmações *</IonLabel>
              <IonInput type="number" inputMode="numeric" min={1} value={threshold} onIonInput={(event) => setThreshold(event.detail.value || '')} aria-invalid={submitted && (!Number.isInteger(thresholdNumber) || thresholdNumber < 1)} />
            </IonItem>
            {submitted && (!Number.isInteger(thresholdNumber) || thresholdNumber < 1) && <IonNote className="field-error" color="danger">Use um número inteiro maior ou igual a 1.</IonNote>}

            {mode === 'agora' && (
              <IonItem>
                <IonLabel position="stacked">Horário</IonLabel>
                <IonDatetime presentation="time" value={startsAt} onIonChange={(event) => setStartsAt(String(event.detail.value))} />
              </IonItem>
            )}

            {mode === 'mais-tarde' && (
              <>
                <IonItem>
                  <IonLabel position="stacked">Dia e horário principal</IonLabel>
                  <IonDatetime value={startsAt} onIonChange={(event) => setStartsAt(String(event.detail.value))} />
                </IonItem>
                <section className="alternative-picker" aria-labelledby="alternative-title">
                  <h2 id="alternative-title">Outros horários no mesmo dia</h2>
                  <p className="muted">Horário principal: <strong>{primaryTime}</strong></p>
                  {alternatives.length > 0 && (
                    <div className="alternative-list" aria-label="Horários alternativos">
                      {alternatives.map((alternative) => (
                        <span className="alternative-chip" key={alternative}>
                          {alternative}
                          <IonButton fill="clear" size="small" aria-label={`Remover horário ${alternative}`} onClick={() => setAlternatives((current) => current.filter((item) => item !== alternative))}>×</IonButton>
                        </span>
                      ))}
                    </div>
                  )}
                  <IonButton fill="outline" disabled={availableOffsets.length === 0} onClick={() => setIsAlternativeModalOpen(true)}>+ Adicionar horário</IonButton>
                </section>
              </>
            )}

            {mode === 'marcar' && (
              <section className="day-editor" aria-labelledby="schedule-title">
                <h2 id="schedule-title">Dias e horários</h2>
                {days.map((day) => (
                  <IonCard key={day.id}>
                    <IonCardContent>
                      <IonItem>
                        <IonLabel position="stacked">Rótulo do dia *</IonLabel>
                        <IonInput value={day.label} onIonInput={(event) => updateDay(day.id, { label: event.detail.value || '' })} />
                      </IonItem>
                      <IonItem>
                        <IonLabel position="stacked">Data *</IonLabel>
                        <IonInput type="date" value={day.date} onIonInput={(event) => updateDay(day.id, { date: event.detail.value || '' })} />
                      </IonItem>
                      <div className="schedule-time-picker">
                        <IonLabel>Horários *</IonLabel>
                        <div className="schedule-time-grid">
                          {scheduleTimes.map((slot) => (
                            <IonCheckbox key={slot} checked={day.slots.includes(slot)} onIonChange={(event) => toggleSlot(day.id, slot, event.detail.checked)}>{slot}</IonCheckbox>
                          ))}
                        </div>
                      </div>
                      <IonButton color="danger" fill="clear" size="small" onClick={() => removeDay(day.id)}>Remover dia</IonButton>
                    </IonCardContent>
                  </IonCard>
                ))}
                {submitted && !scheduleValid && <IonNote className="field-error" color="danger">Cada dia precisa ter rótulo, data e pelo menos um horário.</IonNote>}
                <IonButton fill="outline" onClick={addDay}>+ Adicionar dia</IonButton>
              </section>
            )}

            <IonNote className="guest-note">Convidados não precisam criar conta, mas devem informar o nome para votar.</IonNote>
            <IonButton expand="block" size="large" onClick={submit}>Criar link do Bora</IonButton>
          </IonCardContent>
        </IonCard>

        <IonModal isOpen={isAlternativeModalOpen} onDidDismiss={() => setIsAlternativeModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>Adicionar horário</IonTitle>
              <IonButtons slot="end"><IonButton onClick={() => setIsAlternativeModalOpen(false)}>Fechar</IonButton></IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <p className="muted">Horário principal: {primaryTime}. Escolha uma alternativa no mesmo dia.</p>
            <div className="alternative-time-options">
              {availableOffsets.map((hours) => (
                <IonButton key={hours} expand="block" fill="outline" onClick={() => addAlternative(hours)}>+{hours}h</IonButton>
              ))}
            </div>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
}
