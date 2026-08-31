'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, Camera, Check, ChevronRight, ClipboardCheck, ExternalLink, FileText, LocateFixed, MapPin, ShieldCheck, Waves } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

type PhotoSlot = 'overview' | 'outfall' | 'infrastructure';

const photoSlots: Array<{ id: PhotoSlot; title: string; hint: string }> = [
  { id: 'overview', title: 'Общий вид', hint: 'Дорога и место целиком' },
  { id: 'outfall', title: 'Точка слива', hint: 'Откуда выходит жидкость' },
  { id: 'infrastructure', title: 'Коммуникация', hint: 'Труба, колодец или забор' },
];

const sourceOptions = ['Труба', 'Колодец', 'Отверстие в заборе', 'Неясно'];
const destinationOptions = ['На грунт', 'В придорожную канаву', 'В ливневую канализацию', 'На соседний участок', 'В ручей / водоём'];
const signOptions = ['Резкий запах', 'Мутная или окрашенная вода', 'Пена', 'Повторяется регулярно'];
const settingOptions = ['У дороги / обочины', 'У забора участка', 'На земле общего пользования', 'В канаве'];
const flowOptions = ['Слив идёт сейчас', 'Свежие мокрые следы', 'Постоянно мокро', 'Запах без видимого потока'];

const sourceDescriptions: Record<string, string> = {
  'Труба': 'из трубы',
  'Колодец': 'через колодец',
  'Отверстие в заборе': 'через отверстие в заборе',
  'Неясно': 'из неустановленного источника',
};

type Draft = {
  address: string;
  coordinates: string;
  source: string;
  destinations: string[];
  settings: string[];
  flowState: string;
  signs: string[];
  nearWell: boolean;
  outsideParcel: boolean;
};

type SubmissionRecord = {
  recipient: keyof typeof recipientRules;
  trackingId: string;
  address: string;
  sentAt: string;
  checkAt: string;
};

function loadDraft(): Draft {
  const defaults: Draft = {
    address: '', coordinates: '', source: 'Труба', destinations: ['В придорожную канаву', 'В ручей / водоём'],
    settings: ['У дороги / обочины'], flowState: 'Слив идёт сейчас',
    signs: ['Резкий запах', 'Повторяется регулярно'], nearWell: true, outsideParcel: true,
  };
  try {
    const saved = localStorage.getItem('eco-fix-draft-v1');
    if (!saved) return defaults;
    const parsed = JSON.parse(saved) as Partial<Draft> & { destination?: string; setting?: string };
    const destinations = Array.isArray(parsed.destinations)
      ? parsed.destinations
      : parsed.destination
        ? [parsed.destination]
        : defaults.destinations;
    const settings = Array.isArray(parsed.settings)
      ? parsed.settings
      : parsed.setting
        ? [parsed.setting]
        : defaults.settings;
    return { ...defaults, ...parsed, destinations, settings };
  } catch {
    return defaults;
  }
}

function futureDate(days: number) {
  const result = new Date();
  result.setDate(result.getDate() + days);
  return result;
}

function loadSubmissions(): SubmissionRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem('eco-fix-submissions-v1') || '[]') as SubmissionRecord[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function isSubmissionDue(checkAt: string) {
  return new Date(checkAt).getTime() <= new Date().getTime();
}

const recipientRules = {
  administration: {
    shortName: 'Администрация',
    name: 'Администрация Одинцовского городского округа',
    category: 'Благоустройство → незаконный сброс / самовольная коммуникация',
    portal: 'https://dobrodel.mosreg.ru/',
    request: 'проверить законность размещения коммуникации за границами участка, установить владельца и принять меры к демонтажу и восстановлению территории',
  },
  minecology: {
    shortName: 'Минэкологии',
    name: 'Министерство экологии и природопользования Московской области',
    category: 'Загрязнение почвы → сброс сточных вод',
    portal: 'https://mep.mosreg.ru/feedback',
    request: 'провести выездное обследование, отбор проб жидкости и грунта, установить источник загрязнения и рассчитать вред окружающей среде',
  },
  rospotrebnadzor: {
    shortName: 'Роспотребнадзор',
    name: 'Управление Роспотребнадзора по Московской области',
    category: 'Санитарное состояние территории → угроза водоснабжению',
    portal: 'https://petition.rospotrebnadzor.ru/petition/',
    request: 'оценить санитарно-эпидемиологическую угрозу, включая возможное загрязнение грунтовых вод, колодцев и скважин',
  },
  rosprirodnadzor: {
    shortName: 'Росприроднадзор',
    name: 'Межрегиональное управление Росприроднадзора по Московской и Смоленской областям',
    category: 'Водное законодательство → сброс сточных вод',
    portal: 'https://rpn.gov.ru/petition/',
    request: 'проверить попадание стоков в поверхностный водный объект и наличие оснований для федерального экологического надзора',
  },
} as const;

export function ReportForm() {
  const [initialDraft] = useState(loadDraft);
  const [address, setAddress] = useState(initialDraft.address);
  const [coordinates, setCoordinates] = useState(initialDraft.coordinates);
  const [source, setSource] = useState(initialDraft.source);
  const [destinations, setDestinations] = useState<string[]>(initialDraft.destinations);
  const [settings, setSettings] = useState<string[]>(initialDraft.settings);
  const [flowState, setFlowState] = useState(initialDraft.flowState);
  const [signs, setSigns] = useState<string[]>(initialDraft.signs);
  const [nearWell, setNearWell] = useState(initialDraft.nearWell);
  const [outsideParcel, setOutsideParcel] = useState(initialDraft.outsideParcel);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [locating, setLocating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>(loadSubmissions);

  const photoCount = Object.keys(photos).length;
  const progress = Math.round((((address ? 1 : 0) + (coordinates ? 1 : 0) + photoCount + 4) / 9) * 100);

  const recipients = useMemo(() => {
    const list: Array<keyof typeof recipientRules> = ['administration', 'minecology'];
    if (nearWell || signs.includes('Резкий запах')) list.push('rospotrebnadzor');
    if (destinations.some((value) => ['В придорожную канаву', 'В ливневую канализацию', 'В ручей / водоём'].includes(value))) list.push('rosprirodnadzor');
    return list;
  }, [destinations, nearWell, signs]);

  const standardizedDescription = useMemo(() => {
    const details = [
      `Адрес: ${address || 'не указан'}`,
      `Координаты: ${coordinates || 'не указаны'}`,
      `Обнаружены признаки сброса сточных вод ${sourceDescriptions[source] || 'из неустановленного источника'}`,
      `Места выпуска: ${settings.map((value) => value.toLowerCase()).join(', ') || 'не определены'}`,
      `Маршрут стоков: ${destinations.map((value) => value.toLowerCase()).join(' → ') || 'не определён'}`,
      flowState,
      signs.length ? `Признаки: ${signs.join(', ').toLowerCase()}` : 'Явные внешние признаки не выбраны',
      nearWell ? 'Рядом расположена частная застройка, имеются колодцы и скважины, в том числе колодцы на улице' : '',
      outsideParcel ? 'Коммуникация предположительно находится за границами частного участка' : '',
    ].filter(Boolean);
    return `${details.join('. ')}.`;
  }, [address, coordinates, destinations, flowState, nearWell, outsideParcel, settings, signs, source]);

  useEffect(() => {
    localStorage.setItem('eco-fix-draft-v1', JSON.stringify({ address, coordinates, source, destinations, settings, flowState, signs, nearWell, outsideParcel }));
  }, [address, coordinates, destinations, flowState, nearWell, outsideParcel, settings, signs, source]);

  function toggleDestination(value: string) {
    setDestinations((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function toggleSetting(value: string) {
    setSettings((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function toggleSign(value: string) {
    setSigns((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const lat = coords.latitude.toFixed(7);
        const lon = coords.longitude.toFixed(7);
        setCoordinates(`${lat}, ${lon}`);
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ru`);
          if (response.ok) {
            const data = await response.json() as { display_name?: string };
            if (data.display_name) setAddress(data.display_name);
          }
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  function onPhoto(slot: PhotoSlot, file?: File) {
    if (!file) return;
    setPhotos((current) => ({ ...current, [slot]: URL.createObjectURL(file) }));
  }

  function complaintFor(recipient: (typeof recipientRules)[keyof typeof recipientRules]) {
    return `Кому: ${recipient.name}\n\nЗАЯВЛЕНИЕ\nо признаках незаконного сброса неочищенных сточных вод\n\n${standardizedDescription}\n\nТочный владелец, источник стоков и правовые основания размещения коммуникации заявителю неизвестны и подлежат установлению уполномоченным органом.\n\nПРОШУ:\n1. Зарегистрировать заявление как содержащее сведения о причинении вреда или угрозе причинения вреда охраняемым законом ценностям.\n2. ${recipient.request.charAt(0).toUpperCase()}${recipient.request.slice(1)}.\n3. Установить источник сточных вод, трассу коммуникации и эксплуатирующее ее лицо.\n4. Принять меры к прекращению сброса, устранению последствий, демонтажу незаконной коммуникации и восстановлению территории за счет виновного лица при наличии оснований.\n5. Сообщить регистрационный номер, результаты обследования и конкретные принятые меры.\n6. При отсутствии компетенции направить материалы по подведомственности и уведомить заявителя.\n\nПриложения: три фотографии — общий вид, точка слива и инженерная коммуникация.`;
  }

  function openSubmission(key: keyof typeof recipientRules) {
    const recipient = recipientRules[key];
    void navigator.clipboard.writeText(complaintFor(recipient));
    window.open(recipient.portal, '_blank', 'noopener,noreferrer');
  }

  function saveTracking(key: keyof typeof recipientRules, value: string) {
    setTracking((current) => ({ ...current, [key]: value }));
    if (!value.trim()) return;
    const sentAt = new Date();
    const record: SubmissionRecord = { recipient: key, trackingId: value.trim(), address, sentAt: sentAt.toISOString(), checkAt: futureDate(30).toISOString() };
    setSubmissions((current) => {
      const records = [...current.filter((item) => !(item.recipient === key && item.trackingId === record.trackingId)), record];
      localStorage.setItem('eco-fix-submissions-v1', JSON.stringify(records));
      return records;
    });
  }

  function downloadReminder(key: keyof typeof recipientRules) {
    const checkAt = futureDate(30);
    const stamp = checkAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const title = `Проверить обращение: ${recipientRules[key].shortName}`;
    const description = `Регистрационный номер: ${tracking[key] || 'не указан'}\\n${address}`;
    const calendar = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:${stamp}\r\nDTEND:${stamp}\r\nSUMMARY:${title}\r\nDESCRIPTION:${description}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
    link.download = `proverit-${key}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (generated) {
    return (
      <main className="min-h-dvh bg-background pb-10 text-foreground">
        <header className="sticky top-0 z-20 border-b border-border bg-background/94 backdrop-blur-xl">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => setGenerated(false)} aria-label="Назад"><ArrowLeft /></Button>
            <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Пакет готов</p><h1 className="truncate font-bold">{address}</h1></div>
            <Badge className="bg-emerald-700">{recipients.length} адресата</Badge>
          </div>
        </header>
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-5">
          <section className="rounded-2xl bg-emerald-950 p-5 text-emerald-50">
            <div className="flex items-center gap-2 font-bold"><ClipboardCheck className="size-5 text-emerald-300" />Данные проверены</div>
            <p className="mt-2 text-sm leading-6 text-emerald-50/80">Текст для каждого ведомства уже скопируется при нажатии «Открыть и подать». После перехода войдите через ЕСИА, вставьте текст и приложите три фотографии.</p>
          </section>
          {recipients.map((key, index) => {
            const recipient = recipientRules[key];
            return (
              <section key={key} className="surface-card">
                <div className="flex gap-3"><span className="step-number">{index + 1}</span><div className="min-w-0 flex-1"><h2 className="font-bold">{recipient.shortName}</h2><p className="mt-0.5 text-xs text-muted-foreground">{recipient.category}</p></div></div>
                <details className="mt-4 rounded-xl bg-stone-50 p-3 text-sm"><summary className="cursor-pointer font-semibold"><FileText className="mr-1.5 inline size-4" />Посмотреть текст</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-5 text-stone-700">{complaintFor(recipient)}</pre></details>
                <Button onClick={() => openSubmission(key)} className="mt-3 h-12 w-full rounded-xl bg-emerald-700 text-base hover:bg-emerald-800">Открыть и подать <ExternalLink className="size-4" /></Button>
                <div className="mt-3 rounded-xl border border-border bg-stone-50 p-3">
                  <label className="field-label" htmlFor={`tracking-${key}`}>Номер после отправки</label>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <Input id={`tracking-${key}`} value={tracking[key] || ''} onChange={(event) => setTracking((current) => ({ ...current, [key]: event.target.value }))} placeholder="Например, P001-…" className="h-11 bg-white" />
                    <Button variant="outline" className="h-11" onClick={() => saveTracking(key, tracking[key] || '')}>Сохранить</Button>
                  </div>
                  <Button variant="ghost" className="mt-2 w-full text-emerald-800" disabled={!tracking[key]} onClick={() => downloadReminder(key)}><CalendarClock />Напомнить через 30 дней</Button>
                </div>
              </section>
            );
          })}
          <p className="px-2 text-center text-xs leading-5 text-muted-foreground">Финальную отправку подтверждаете вы на каждом государственном портале. Приложение не хранит пароль ЕСИА.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Waves className="size-5" /></span>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Экофиксация</p><h1 className="text-base font-bold tracking-tight">Новый сброс</h1></div>
          </div>
          <Badge variant="secondary" className="h-7 bg-emerald-100 px-2.5 text-emerald-900">Черновик</Badge>
        </div>
        <Progress value={progress} className="gap-0 [&_[data-slot=progress-track]]:rounded-none [&_[data-slot=progress-track]]:bg-stone-200 [&_[data-slot=progress-indicator]]:bg-emerald-600" />
      </header>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        {submissions.length > 0 && (
          <section className="surface-card">
            <div className="section-heading"><span className="step-number"><CalendarClock className="size-4" /></span><div><h2>Контроль обращений</h2><p>Регистрационные номера хранятся на этом телефоне</p></div></div>
            <div className="space-y-2">
              {submissions.slice().reverse().slice(0, 4).map((record) => {
                const due = isSubmissionDue(record.checkAt);
                return (
                  <div key={`${record.recipient}-${record.trackingId}`} className="flex items-center gap-3 rounded-xl border border-border bg-stone-50 p-3">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{recipientRules[record.recipient].shortName} · № {record.trackingId}</p><p className="text-xs text-muted-foreground">{due ? 'Срок проверки наступил' : `Проверить ${new Date(record.checkAt).toLocaleDateString('ru-RU')}`}</p></div>
                    <Badge variant={due ? 'destructive' : 'secondary'}>{due ? 'Проверить' : 'Ожидаем'}</Badge>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <section className="surface-card">
          <div className="section-heading"><span className="step-number">1</span><div><h2>Место</h2><p>Адрес можно поправить вручную</p></div></div>
          <div className="space-y-3">
            <label className="field-label" htmlFor="address">Адрес</label>
            <div className="relative"><MapPin className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input id="address" value={address} onChange={(event) => setAddress(event.target.value)} className="h-12 rounded-xl pl-10" /></div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input aria-label="Координаты" value={coordinates} onChange={(event) => setCoordinates(event.target.value)} className="h-11 rounded-xl font-mono text-xs" />
              <Button type="button" variant="outline" onClick={locate} className="h-11 rounded-xl px-3"><LocateFixed className={locating ? 'animate-pulse' : ''} />Моё место</Button>
            </div>
          </div>
        </section>

        <section className="surface-card">
          <div className="section-heading"><span className="step-number">2</span><div><h2>Три фотографии</h2><p>Камера откроется сразу</p></div></div>
          <div className="grid grid-cols-3 gap-2.5">
            {photoSlots.map((slot, index) => (
              <label key={slot.id} className="photo-slot">
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => onPhoto(slot.id, event.target.files?.[0])} />
                {photos[slot.id] ? <><img src={photos[slot.id]} alt={slot.title} /><span className="photo-check"><Check /></span></> : <div className="grid aspect-[4/5] place-items-center bg-stone-100"><Camera className="size-6 text-stone-500" /></div>}
                <strong>{index + 1}. {slot.title}</strong><small>{slot.hint}</small>
              </label>
            ))}
          </div>
        </section>

        <section className="surface-card">
          <div className="section-heading"><span className="step-number">3</span><div><h2>Что происходит</h2><p>Выберите наблюдаемые признаки</p></div></div>
          <ChoiceGroup label="Источник" options={sourceOptions} value={source} onChange={setSource} />
          <MultiChoiceGroup label="Где находится выпуск — можно несколько" options={settingOptions} values={settings} onToggle={toggleSetting} ordered={false} />
          <MultiChoiceGroup label="Маршрут стоков — можно несколько" options={destinationOptions} values={destinations} onToggle={toggleDestination} />
          <ChoiceGroup label="Состояние сейчас" options={flowOptions} value={flowState} onChange={setFlowState} />
          <div className="mt-5">
            <p className="field-label mb-2">Признаки</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {signOptions.map((option) => <CheckRow key={option} checked={signs.includes(option)} onChange={() => toggleSign(option)} label={option} />)}
              <CheckRow checked={nearWell} onChange={() => setNearWell(!nearWell)} label="Рядом колодцы / скважины" />
              <CheckRow checked={outsideParcel} onChange={() => setOutsideParcel(!outsideParcel)} label="За границей участка" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-900/15 bg-emerald-950 p-5 text-emerald-50 shadow-[0_18px_60px_-30px_rgba(6,78,59,.75)]">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-emerald-300" />Стандартизированное описание</div>
          <p className="mt-3 text-sm leading-6 text-emerald-50/85">{standardizedDescription}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">{recipients.map((key) => <Badge key={key} className="bg-white/10 text-emerald-50">{recipientRules[key].shortName}</Badge>)}</div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/94 p-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1 pl-1"><p className="text-xs text-muted-foreground">Готово фото</p><p className="font-bold">{photoCount} из 3</p></div>
          <Button onClick={() => setGenerated(true)} className="h-12 rounded-xl bg-emerald-700 px-5 text-base hover:bg-emerald-800" disabled={photoCount !== 3 || !address}>Создать {recipients.length} жалобы <ChevronRight className="size-5" /></Button>
        </div>
      </div>
    </main>
  );
}

function ChoiceGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="mt-5 first:mt-0"><p className="field-label mb-2">{label}</p><div className="flex flex-wrap gap-2">{options.map((option) => <button key={option} type="button" onClick={() => onChange(option)} className={value === option ? 'choice-chip choice-chip-active' : 'choice-chip'}>{value === option && <Check className="size-3.5" />}{option}</button>)}</div></div>;
}

function MultiChoiceGroup({ label, options, values, onToggle, ordered = true }: { label: string; options: string[]; values: string[]; onToggle: (value: string) => void; ordered?: boolean }) {
  return (
    <div className="mt-5">
      <p className="field-label mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option);
          const order = selected ? values.indexOf(option) + 1 : null;
          return <button key={option} type="button" onClick={() => onToggle(option)} className={selected ? 'choice-chip choice-chip-active' : 'choice-chip'}>{selected && (ordered ? <span className="grid size-4 place-items-center rounded-full bg-white/20 text-[10px]">{order}</span> : <Check className="size-3.5" />)}{option}</button>;
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{ordered ? 'Номера показывают порядок движения воды. ' : ''}Повторное нажатие убирает вариант.</p>
    </div>
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm font-medium"><Checkbox checked={checked} onCheckedChange={onChange} />{label}</label>;
}
