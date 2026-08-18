export function upcomingActivityCopy(startsAt: string, now = new Date()) {
  const start = new Date(startsAt);
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDifference = Math.round((startDay - today) / 86_400_000);
  let dayLabel: string;
  if (dayDifference === 0) dayLabel = 'Hoje';
  else if (dayDifference === 1) dayLabel = 'Amanhã';
  else {
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(start).replace('-feira', '');
    dayLabel = weekday.charAt(0).toLocaleUpperCase('pt-BR') + weekday.slice(1);
  }

  const remainingMinutes = Math.ceil((start.getTime() - now.getTime()) / 60_000);
  let secondaryMessage: string | undefined;
  if (remainingMinutes > 0 && remainingMinutes < 60) secondaryMessage = `Começa em ${remainingMinutes} ${remainingMinutes === 1 ? 'minuto' : 'minutos'}.`;
  else if (remainingMinutes >= 60 && remainingMinutes <= 24 * 60) {
    const hours = Math.ceil(remainingMinutes / 60);
    secondaryMessage = `Começa em ${hours} ${hours === 1 ? 'hora' : 'horas'}.`;
  }
  return { primaryMessage: `${dayLabel} às ${time}`, secondaryMessage };
}
