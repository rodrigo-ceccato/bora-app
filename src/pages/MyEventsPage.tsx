import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  useIonAlert,
  useIonRouter,
  useIonToast,
  useIonViewWillEnter,
} from "@ionic/react";
import {
  chevronForwardOutline,
  downloadOutline,
  notificationsOutline,
  optionsOutline,
  personOutline,
  phonePortraitOutline,
  timeOutline,
  trashOutline,
} from "ionicons/icons";
import { useEffect, useState } from "react";
import { calendarDetails } from "../lib/calendar";
import {
  defaultPushReminderPreferences,
  detachDevicePushSubscription,
  disablePushReminders,
  enablePushReminders,
  pushReminderPreferences,
  pushReminderState,
  savePushReminderPreferences,
  type PushReminderPreferences,
  type PushReminderState,
} from "../lib/push";
import {
  clearDeviceAuthentication,
  getParticipantName,
  listAdminEvents,
  listMyEvents,
  refreshParticipantProfile,
  saveSessionPreference,
  saveParticipantName,
  type MyEvents,
} from "../lib/store";
import type { BoraEvent, EventSummary, VoteResponse } from "../lib/types";

type EventListItem = { event: BoraEvent; confirmed: number; ownResponse?: VoteResponse };
type EventGroups = { created: EventListItem[]; joined: EventListItem[] };
type ExpandedSections = {
  upcoming: boolean;
  created: boolean;
  joined: boolean;
};
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const expansionStorageKey = "bora_my_events_expanded";
const preferenceOptions: Array<{
  key: keyof PushReminderPreferences;
  label: string;
  description: string;
}> = [
  {
    key: "votes",
    label: "Novos votos nos meus Boras",
    description: "Quando alguém responder a um evento que você criou.",
  },
  {
    key: "changes",
    label: "Alterações em um Bora",
    description: "Quando o organizador mudar local, data ou horário.",
  },
  {
    key: "confirmed",
    label: "Data ou horário definidos",
    description: "Quando o organizador escolher a opção final.",
  },
  {
    key: "threshold",
    label: "Mínimo de confirmações atingido",
    description: "Quando o número necessário de pessoas confirmar.",
  },
  {
    key: "messages",
    label: "Novos recados",
    description: "Quando alguém deixar um recado em um Bora de que você participa.",
  },
  {
    key: "upcoming",
    label: "Lembrete antes de começar",
    description: "Receba um aviso antes do horário marcado.",
  },
];

function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function installationInstructions() {
  const isAppleDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isAppleDevice
    ? "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”."
    : "Abra o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.";
}

function initialExpansion(): ExpandedSections {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(expansionStorageKey) || "{}",
    ) as Partial<ExpandedSections>;
    return {
      upcoming: saved.upcoming !== false,
      created: Boolean(saved.created),
      joined: Boolean(saved.joined),
    };
  } catch {
    return { upcoming: true, created: false, joined: false };
  }
}
function modeLabel(event: BoraEvent) {
  return event.mode === "agora"
    ? "Bora agora"
    : event.mode === "mais-tarde"
      ? "Bora essa semana"
      : "Bora marcar";
}
function eventStatus(event: BoraEvent) {
  return event.decidedOption
    ? "Definido"
    : event.votingClosed
      ? "Encerrado"
      : "Recebendo respostas";
}
function eventDateParts(event: BoraEvent) {
  const details = calendarDetails(event);
  if (details)
    return [
      details.startsAt.toLocaleDateString("pt-BR", { dateStyle: "medium" }),
      details.startsAt.toLocaleTimeString("pt-BR", { timeStyle: "short" }),
    ];
  if (event.mode === "marcar" && event.days[0])
    return [event.days[0].label, event.days[0].slots.join(", ")];
  return ["Data a combinar", ""];
}
function eventTime(event: BoraEvent) {
  return calendarDetails(event)?.startsAt.getTime();
}
function sortEvents(items: EventListItem[]) {
  const now = Date.now();
  return [...items].sort((a, b) => {
    const aTime = eventTime(a.event) ?? Number.POSITIVE_INFINITY;
    const bTime = eventTime(b.event) ?? Number.POSITIVE_INFINITY;
    return aTime >= now === bTime >= now
      ? aTime - bTime
      : aTime >= now
        ? -1
        : 1;
  });
}

export default function MyEventsPage() {
  const [toast] = useIonToast();
  const router = useIonRouter();
  const [presentAlert] = useIonAlert();
  const [events, setEvents] = useState<EventGroups>({
    created: [],
    joined: [],
  });
  const [loading, setLoading] = useState(true);
  const [reminderState, setReminderState] =
    useState<PushReminderState>("unsupported");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferences, setPreferences] = useState<PushReminderPreferences>(
    defaultPushReminderPreferences,
  );
  const [expanded, setExpanded] = useState<ExpandedSections>(initialExpansion);
  const [participantName, setParticipantName] = useState(getParticipantName);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isRunningStandalone);
  const remindersEnabled = reminderState === "subscribed";
  const remindersUnavailable =
    reminderState === "unsupported" || reminderState === "permission-denied";

  useEffect(() => {
    void pushReminderState()
      .then(async (state) => {
        setReminderState(state);
        if (state === "subscribed")
          setPreferences(
            await pushReminderPreferences().catch(
              () => defaultPushReminderPreferences,
            ),
          );
      })
      .catch(() => setReminderState("unsupported"));
  }, []);
  useEffect(() => {
    const saveInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", saveInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", saveInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);
  useEffect(() => {
    const update = () => setParticipantName(getParticipantName());
    window.addEventListener("bora:participant-name-updated", update);
    return () =>
      window.removeEventListener("bora:participant-name-updated", update);
  }, []);
  useEffect(() => {
    // Expansion state is a convenience only; storage denial/quota must not
    // replace the page with a global error screen.
    saveSessionPreference(expansionStorageKey, JSON.stringify(expanded));
  }, [expanded]);
  useIonViewWillEnter(() => {
    let active = true;
    setParticipantName(getParticipantName());
    void refreshParticipantProfile();
    setLoading(true);
    void listMyEvents()
      .then((result: MyEvents) => {
        const summarize = (event: EventSummary): EventListItem => ({
          event,
          confirmed: event.confirmedCount ?? 0,
          ownResponse: event.participantResponse,
        });
        const created = result.created.map(summarize);
        const joined = result.joined.map(summarize);
        if (active)
          setEvents({
            created: sortEvents(created),
            joined: sortEvents(joined),
          });
      })
      .catch((error) => {
        if (active)
          toast({
            message:
              error instanceof Error
                ? error.message
                : "Não foi possível carregar seus Boras.",
            color: "danger",
            duration: 2800,
          });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  });

  const adminTokens = new Map(
    listAdminEvents().map((event) => [event.slug, event.adminToken]),
  );
  const active = (items: EventListItem[]) =>
    items.filter(({ event }) => {
      const time = eventTime(event);
      return time === undefined || time >= Date.now();
    });
  const upcoming = [...events.created, ...events.joined]
    .filter(({ event }, index, all) => {
      const time = eventTime(event);
      return (
        time !== undefined &&
        time >= Date.now() &&
        all.findIndex((item) => item.event.id === event.id) === index
      );
    })
    .sort((a, b) => eventTime(a.event)! - eventTime(b.event)!);
  const activePreferenceCount = preferenceOptions.filter(
    ({ key }) => preferences[key],
  ).length;

  async function changeReminders(enabled: boolean) {
    if (reminderBusy || remindersUnavailable) return;
    setReminderBusy(true);
    try {
      const state = enabled
        ? await enablePushReminders()
        : await disablePushReminders();
      setReminderState(state);
      if (state === "subscribed")
        setPreferences(await pushReminderPreferences());
      toast({
        message: enabled
          ? "Lembretes ativados neste aparelho."
          : "Lembretes desativados neste aparelho.",
        color: "success",
        duration: 2600,
      });
    } catch (error) {
      setReminderState(
        await pushReminderState().catch((): PushReminderState => "unsupported"),
      );
      toast({
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar os lembretes.",
        color: "danger",
        duration: 3500,
      });
    } finally {
      setReminderBusy(false);
    }
  }
  async function changePreference(
    key: keyof PushReminderPreferences,
    checked: boolean,
  ) {
    const previous = preferences;
    const next = { ...preferences, [key]: checked };
    setPreferences(next);
    try {
      await savePushReminderPreferences(next);
      toast({
        message: "Alterações salvas automaticamente.",
        color: "success",
        duration: 1600,
      });
    } catch (error) {
      setPreferences(previous);
      toast({
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar os lembretes.",
        color: "danger",
        duration: 3000,
      });
    }
  }
  async function addToHomeScreen() {
    if (!installPrompt) {
      presentAlert({
        header: "Adicionar à tela inicial",
        message: installationInstructions(),
        buttons: ["Entendi"],
      });
      return;
    }
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (outcome === "accepted") setInstalled(true);
  }
  function editSavedName() {
    presentAlert({
      header: "Seu nome",
      inputs: [
        {
          name: "name",
          type: "text",
          value: participantName,
          placeholder: "Como você quer aparecer?",
        },
      ],
      buttons: [
        { text: "Cancelar", role: "cancel" },
        {
          text: "Salvar",
          handler: (data) => {
            const saved = saveParticipantName(String(data.name || ""));
            if (!saved) {
              toast({ message: "Informe seu nome.", color: "danger", duration: 2400 });
              return false;
            }
            setParticipantName(getParticipantName());
          },
        },
      ],
    });
  }
  function removeDeviceAccess() {
    if (reminderBusy) return;
    presentAlert({
      header: "Remover acesso deste aparelho?",
      message:
        "Este aparelho deixará de mostrar seus Boras e perderá os acessos de organizador salvos. Os eventos não serão excluídos e outros dispositivos continuarão funcionando.",
      buttons: [
        { text: "Cancelar", role: "cancel" },
        {
          text: "Remover acesso",
          role: "destructive",
          handler: () => {
            void (async () => {
              setReminderBusy(true);
              let cleanup: Awaited<ReturnType<typeof detachDevicePushSubscription>> = "failed";
              try {
                cleanup = await detachDevicePushSubscription();
              } catch {
                cleanup = "failed";
              }
              const localCleanup = clearDeviceAuthentication();
              setReminderBusy(false);
              const remindersComplete = cleanup === "none" || cleanup === "removed";
              const complete = remindersComplete && localCleanup.complete;
              toast({
                message: complete
                  ? "O acesso foi removido deste aparelho."
                  : localCleanup.complete
                    ? "O acesso local foi removido. A limpeza dos lembretes ficou incompleta; bloqueie as notificações deste site se este aparelho não for mais seu."
                    : "Não foi possível confirmar a remoção de todos os dados locais. Feche os dados deste site no navegador antes de entregar este aparelho.",
                color: complete ? "success" : "warning",
                duration: complete ? 2600 : 5000,
              });
              router.push("/home", "root");
            })();
          },
        },
      ],
    });
  }
  function cards(items: EventListItem[], label: string | ((item: EventListItem) => string)) {
    return items.map((item) => {
      const { event, confirmed } = item;
      const [date, time] = eventDateParts(event);
      const token = adminTokens.get(event.slug);
      return (
        <button
          type="button"
          key={event.id}
          className="my-event-card"
          onClick={() =>
            router.push(
              `/e/${event.slug}${token ? `?admin=${token}` : ""}`,
              "forward",
            )
          }
        >
          <span className="my-event-heading">
            <span className="event-mode-tag">{modeLabel(event)}</span>
            <span
              className={`event-status-tag ${event.votingClosed ? "closed" : ""}`}
            >
              {eventStatus(event)}
            </span>
            <strong>{event.title}</strong>
          </span>
          <span className="my-event-metadata">
            <span>{date}</span>
            {time && <span>{time}</span>}
            <span>{event.place}</span>
          </span>
          <span className="my-event-card-bottom">
            <span>{typeof label === "function" ? label(item) : label}</span>
            <span>
              {confirmed} de {event.threshold} confirmaram
            </span>
          </span>
          <span className="my-event-chevron" aria-hidden="true">
            ›
          </span>
        </button>
      );
    });
  }
  function disclosure(
    title: string,
    items: EventListItem[],
    label: string,
    empty: string,
    key: keyof ExpandedSections,
  ) {
    const id = `my-events-${key}`;
    if (!items.length)
      return (
        <section className="my-events-section disclosure-section">
          <h2 className="my-events-static-heading">{title}</h2>
          <div id={id} className="my-events-empty">
            <p>{empty}</p>
            {key === "created" && (
              <IonButton fill="clear" routerLink="/create?mode=agora">
                Criar um Bora
              </IonButton>
            )}
          </div>
        </section>
      );
    const open = expanded[key];
    const hasWaitingForDate =
      key === "created" &&
      items.some(
        ({ event, confirmed }) =>
          event.mode !== "agora" &&
          !event.decidedOption &&
          !event.votingClosed &&
          confirmed > 0,
      );
    return (
      <section className="my-events-section disclosure-section">
        <button
          type="button"
          className="my-events-disclosure"
          aria-expanded={open}
          aria-controls={id}
          onClick={() =>
            setExpanded((current) => ({ ...current, [key]: !current[key] }))
          }
        >
          <span>{title}</span>
          <span className="disclosure-meta">
            <b>{items.length}</b>
            {hasWaitingForDate && (
              <em aria-label="Há Boras aguardando escolha de data">!</em>
            )}
            <span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
          </span>
        </button>
        <div id={id} hidden={!open}>
          {hasWaitingForDate && (
            <p className="created-pending-notice">
              Você tem Boras aguardando a escolha de uma data.
            </p>
          )}
          {cards(items, label)}
        </div>
      </section>
    );
  }

  const masterDescription =
    reminderState === "permission-denied"
      ? "Notificações bloqueadas nas configurações deste navegador."
      : reminderState === "unsupported"
        ? "Lembretes não estão disponíveis neste navegador."
        : "Receba avisos sobre seus Boras neste aparelho.";
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/home" text="Voltar" />
          </IonButtons>
          <IonTitle>Meus Boras</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding form-page">
        <main className="my-events-container">
          <section className="my-events-intro">
            <span className="section-eyebrow">Sua agenda</span>
            <h1>Meus Boras</h1>
            <p>Eventos que você criou ou em que está participando.</p>
          </section>
          {loading ? (
            <div className="center">
              <IonSpinner />
              <p>Carregando...</p>
            </div>
          ) : (
            <>
              {upcoming.length ? (
                <section className="my-events-section">
                  <button
                    type="button"
                    className="my-events-disclosure"
                    aria-expanded={expanded.upcoming}
                    aria-controls="my-events-upcoming"
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        upcoming: !current.upcoming,
                      }))
                    }
                  >
                    <span>Próximos Boras</span>
                    <span className="disclosure-meta">
                      <b>{upcoming.length}</b>
                      <span aria-hidden="true">
                        {expanded.upcoming ? "⌃" : "⌄"}
                      </span>
                    </span>
                  </button>
                  <div id="my-events-upcoming" hidden={!expanded.upcoming}>
                    {cards(upcoming, ({ event, ownResponse }) => {
                      if (events.created.some((item) => item.event.id === event.id)) return "Organizador";
                      if (ownResponse === "accept") return "Você confirmou";
                      if (ownResponse === "maybe") return "Você respondeu talvez";
                      if (ownResponse === "decline") return "Você não pode participar";
                      return "Participação registrada";
                    })}
                  </div>
                </section>
              ) : (
                <section className="my-events-section">
                  <h2 className="my-events-static-heading">Próximos Boras</h2>
                  <div className="my-events-empty">
                    <p>
                      Quando um Bora tiver data e horário definidos, ele
                      aparecerá aqui.
                    </p>
                  </div>
                </section>
              )}
              {disclosure(
                "Criados por mim",
                active(events.created),
                "Organizador",
                "Você ainda não criou nenhum Bora.",
                "created",
              )}
              {disclosure(
                "Participo",
                active(events.joined),
                "Convidado",
                "Os Boras em que você responder aparecerão aqui. Abra um link de convite para participar.",
                "joined",
              )}
            </>
          )}
          <section className="device-access-actions">
            <h2>Neste aparelho</h2>
            {!installed && (
              <button
                type="button"
                className="device-setting-row"
                onClick={() => void addToHomeScreen()}
              >
                <span className="device-setting-icon">
                  <IonIcon icon={downloadOutline} aria-hidden="true" />
                </span>
                <span className="device-access-copy">
                  <strong>Adicionar Bora à tela inicial</strong>
                  <small>
                    Abra o Bora como um app, com acesso mais rápido neste aparelho.
                  </small>
                </span>
                <IonIcon
                  className="device-setting-chevron"
                  icon={chevronForwardOutline}
                  aria-hidden="true"
                />
              </button>
            )}
            <div className="device-setting-row reminder-setting-row">
              <span className="device-setting-icon">
                <IonIcon icon={notificationsOutline} aria-hidden="true" />
              </span>
              <span className="device-access-copy">
                <strong>Lembretes</strong>
                <small>{masterDescription}</small>
              </span>
              {reminderBusy ? (
                <IonSpinner
                  className="reminder-spinner"
                  name="crescent"
                  aria-label="Atualizando lembretes"
                />
              ) : (
                <IonToggle
                  checked={remindersEnabled}
                  disabled={remindersUnavailable}
                  aria-label="Ativar lembretes neste aparelho"
                  onIonChange={(event) =>
                    void changeReminders(event.detail.checked)
                  }
                />
              )}
            </div>
            {remindersEnabled && (
              <button
                type="button"
                className="device-setting-row"
                onClick={() => setPreferencesOpen(true)}
              >
                <span className="device-setting-icon">
                  <IonIcon icon={optionsOutline} aria-hidden="true" />
                </span>
                <span className="device-access-copy">
                  <strong>Quais avisos receber</strong>
                  <small>
                    {activePreferenceCount} tipos de aviso ativo
                    {activePreferenceCount === 1 ? "" : "s"}
                  </small>
                </span>
                <IonIcon
                  className="device-setting-chevron"
                  icon={chevronForwardOutline}
                  aria-hidden="true"
                />
              </button>
            )}
            <button
              type="button"
              className="device-setting-row"
              onClick={() => router.push("/past-events", "forward")}
            >
              <span className="device-setting-icon">
                <IonIcon icon={timeOutline} aria-hidden="true" />
              </span>
              <span className="device-access-copy">
                <strong>Boras passados</strong>
                <small>Veja encontros que já aconteceram.</small>
              </span>
              <IonIcon
                className="device-setting-chevron"
                icon={chevronForwardOutline}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="device-setting-row"
              onClick={editSavedName}
            >
              <span className="device-setting-icon">
                <IonIcon icon={personOutline} aria-hidden="true" />
              </span>
              <span className="device-access-copy">
                <strong>Seu nome</strong>
                <small>
                  {participantName || "Adicionar ou corrigir seu nome."}
                </small>
              </span>
              <IonIcon
                className="device-setting-chevron"
                icon={chevronForwardOutline}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="device-setting-row"
              onClick={() => router.push("/recover", "forward")}
            >
              <span className="device-setting-icon">
                <IonIcon icon={phonePortraitOutline} aria-hidden="true" />
              </span>
              <span className="device-access-copy">
                <strong>Usar em outro dispositivo</strong>
                <small>
                  Crie um link para acessar seus Boras em outro aparelho.
                </small>
              </span>
              <IonIcon
                className="device-setting-chevron"
                icon={chevronForwardOutline}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="device-setting-row destructive-device-action"
              disabled={reminderBusy}
              onClick={removeDeviceAccess}
            >
              <span className="device-setting-icon">
                <IonIcon icon={trashOutline} aria-hidden="true" />
              </span>
              <span className="device-access-copy">
                <strong>Remover acesso deste aparelho</strong>
                <small>
                  Remove deste aparelho o nome, os Boras e os acessos de
                  organizador salvos.
                </small>
              </span>
            </button>
          </section>
        </main>
      </IonContent>
      <IonModal
        isOpen={preferencesOpen}
        onDidDismiss={() => setPreferencesOpen(false)}
        className="reminder-preferences-modal"
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Quais avisos receber</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setPreferencesOpen(false)}>
                Fechar
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <section className="reminder-preferences">
            <p>Estas preferências valem apenas neste aparelho.</p>
            {preferenceOptions.map(({ key, label, description }) => (
              <div className="notification-preference" key={key}>
                <div className="notification-preference-copy">
                  <strong>{label}</strong>
                  <p>{description}</p>
                </div>
                <IonToggle
                  checked={preferences[key]}
                  aria-label={label}
                  onIonChange={(event) =>
                    void changePreference(key, event.detail.checked)
                  }
                />
              </div>
            ))}
          </section>
        </IonContent>
      </IonModal>
    </IonPage>
  );
}
