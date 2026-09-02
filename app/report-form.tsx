'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, Camera, Check, ChevronRight, ClipboardCheck, Download, ExternalLink, FileText, Images, LoaderCircle, LocateFixed, MapPin, ShieldCheck, Waves } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

type PhotoSlot = 'overview' | 'outfall' | 'infrastructure';

type CapturedPhoto = {
  url: string;
  capturedAt: string;
  coordinates: string;
};

type PreparedFile = {
  name: string;
  label: string;
  url: string;
  size: number;
};

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
  outsideParcel: boolean;
};

type SubmissionRecord = {
  id?: string;
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
    signs: ['Резкий запах', 'Повторяется регулярно'], outsideParcel: true,
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

function canvasBlob(canvas: HTMLCanvasElement, quality = 0.78) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось подготовить изображение')), 'image/jpeg', quality));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось прочитать фотографию'));
    image.src = url;
  });
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function makeWatermarkedPhoto(photo: CapturedPhoto, label: string, fallbackCoordinates: string, maxSide = 1500, quality = 0.76) {
  const image = await loadImage(photo.url);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const stripHeight = Math.max(130, Math.round(height * 0.12));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas недоступен');
  context.drawImage(image, 0, 0, width, height);
  context.fillStyle = 'rgba(0, 0, 0, 0.72)';
  context.fillRect(0, height - stripHeight, width, stripHeight);
  const padding = Math.max(24, Math.round(width * 0.025));
  const titleSize = Math.max(24, Math.round(width * 0.028));
  const detailSize = Math.max(20, Math.round(width * 0.022));
  context.fillStyle = '#fff';
  context.font = `700 ${titleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  context.fillText(label, padding, height - stripHeight + padding + titleSize);
  context.fillStyle = '#e5e7eb';
  context.font = `500 ${detailSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  const capturedAt = new Date(photo.capturedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
  const details = `${capturedAt} · Координаты: ${photo.coordinates || fallbackCoordinates || 'не указаны'}`;
  context.fillText(details, padding, height - padding, width - padding * 2);
  return canvasBlob(canvas, quality);
}

async function makeStatementImage(text: string) {
  const width = 1400;
  const padding = 90;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas недоступен');
  context.font = '32px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  const lines = wrapCanvasText(context, text, width - padding * 2);
  const lineHeight = 47;
  canvas.width = width;
  canvas.height = Math.max(1800, padding * 2 + lines.length * lineHeight + 90);
  const renderContext = canvas.getContext('2d');
  if (!renderContext) throw new Error('Canvas недоступен');
  renderContext.fillStyle = '#fff';
  renderContext.fillRect(0, 0, canvas.width, canvas.height);
  renderContext.fillStyle = '#111827';
  renderContext.font = '32px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  lines.forEach((line, index) => renderContext.fillText(line, padding, padding + (index + 1) * lineHeight));
  return canvasBlob(canvas, 0.84);
}

function downloadPreparedFile(file: PreparedFile) {
  const link = document.createElement('a');
  link.href = file.url;
  link.download = file.name;
  link.click();
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

const recipientRules = {
  administration: {
    shortName: 'Администрация',
    name: 'Администрация Одинцовского городского округа',
    category: 'Благоустройство → незаконный сброс / самовольная коммуникация',
    portal: 'https://dobrodel.mosreg.ru/',
    request: 'проверить законность размещения коммуникации за границами участка, установить владельца и принять меры к демонтажу и восстановлению территории',
    shortRequest: 'Прошу обследовать место, установить источник и владельца, прекратить сброс, демонтировать незаконный выпуск и восстановить территорию.',
  },
  minecology: {
    shortName: 'Минэкологии',
    name: 'Министерство экологии и природопользования Московской области',
    category: 'Загрязнение почвы → сброс сточных вод',
    portal: 'https://mep.mosreg.ru/feedback',
    request: 'провести выездное обследование, отбор проб жидкости и грунта, установить источник загрязнения и рассчитать вред окружающей среде',
    shortRequest: 'Прошу провести обследование, отобрать пробы, установить источник загрязнения, прекратить сброс и принять меры к виновному лицу.',
  },
  rospotrebnadzor: {
    shortName: 'Роспотребнадзор',
    name: 'Управление Роспотребнадзора по Московской области',
    category: 'Санитарное состояние территории → угроза водоснабжению',
    portal: 'https://petition.rospotrebnadzor.ru/petition/',
    request: 'оценить санитарно-эпидемиологическую угрозу, включая возможное загрязнение грунтовых вод, колодцев и скважин',
    shortRequest: 'Прошу оценить санитарную угрозу, проверить риск загрязнения грунтовых вод, колодцев и скважин и принять меры.',
  },
  rosprirodnadzor: {
    shortName: 'Росприроднадзор',
    name: 'Межрегиональное управление Росприроднадзора по Московской и Смоленской областям',
    category: 'Водное законодательство → сброс сточных вод',
    portal: 'https://rpn.gov.ru/petition/',
    request: 'проверить попадание стоков в поверхностный водный объект и наличие оснований для федерального экологического надзора',
    shortRequest: 'Прошу проверить попадание стоков в водный объект, установить источник, прекратить сброс и принять надзорные меры.',
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
  const [outsideParcel, setOutsideParcel] = useState(initialDraft.outsideParcel);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, CapturedPhoto>>>({});
  const [locating, setLocating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [preparedPhotos, setPreparedPhotos] = useState<PreparedFile[]>([]);
  const [photoPrepareError, setPhotoPrepareError] = useState('');
  const [preparingStatementFor, setPreparingStatementFor] = useState<keyof typeof recipientRules | null>(null);
  const [preparedStatements, setPreparedStatements] = useState<Partial<Record<keyof typeof recipientRules, PreparedFile>>>({});
  const [statementErrors, setStatementErrors] = useState<Partial<Record<keyof typeof recipientRules, string>>>({});
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [lateTracking, setLateTracking] = useState<Record<string, string>>({});
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>(loadSubmissions);

  const photoCount = Object.keys(photos).length;
  const progress = Math.round((((address ? 1 : 0) + (coordinates ? 1 : 0) + photoCount + 4) / 9) * 100);

  const recipients = useMemo(() => {
    const list: Array<keyof typeof recipientRules> = ['administration', 'minecology'];
    list.push('rospotrebnadzor');
    if (destinations.some((value) => ['В придорожную канаву', 'В ливневую канализацию', 'В ручей / водоём'].includes(value))) list.push('rosprirodnadzor');
    return list;
  }, [destinations]);

  const standardizedDescription = useMemo(() => {
    const details = [
      `Предположительно, источник сброса расположен по адресу: ${address || 'адрес не указан'}`,
      `Координаты: ${coordinates || 'не указаны'}`,
      `Обнаружены признаки сброса сточных вод ${sourceDescriptions[source] || 'из неустановленного источника'}`,
      `Места выпуска: ${settings.map((value) => value.toLowerCase()).join(', ') || 'не определены'}`,
      `Маршрут стоков: ${destinations.map((value) => value.toLowerCase()).join(' → ') || 'не определён'}`,
      flowState,
      signs.length ? `Признаки: ${signs.join(', ').toLowerCase()}` : 'Явные внешние признаки не выбраны',
      'Рядом расположена частная застройка, имеются колодцы и скважины, в том числе колодцы на улице',
      outsideParcel ? 'Источник сброса предположительно связан с участком по указанному адресу, а выпуск выведен за границы этого участка' : '',
    ].filter(Boolean);
    return `${details.join('. ')}.`;
  }, [address, coordinates, destinations, flowState, outsideParcel, settings, signs, source]);

  function shortComplaintFor(key: keyof typeof recipientRules) {
    const safeAddress = (address || 'не указан').slice(0, 120);
    const intro = `Предполагаемый источник сброса: ${safeAddress}. Зафиксированы признаки сброса сточных вод ${sourceDescriptions[source] || 'из неустановленного источника'}.`;
    const request = ` ${recipientRules[key].shortRequest} Подробное заявление приложено изображением.`;
    const optional = [
      coordinates ? ` Координаты: ${coordinates}.` : '',
      settings.length ? ` Места выпуска: ${settings.map((value) => value.toLowerCase()).join(', ')}.` : '',
      destinations.length ? ` Маршрут: ${destinations.map((value) => value.toLowerCase()).join(' → ')}.` : '',
      ` Состояние: ${flowState.toLowerCase()}.`,
      signs.length ? ` Признаки: ${signs.map((value) => value.toLowerCase()).join(', ')}.` : '',
    ].filter(Boolean);
    let result = intro;
    for (const part of optional) if (`${result}${part}${request}`.length <= 500) result += part;
    return `${result}${request}`;
  }

  useEffect(() => {
    localStorage.setItem('eco-fix-draft-v1', JSON.stringify({ address, coordinates, source, destinations, settings, flowState, signs, outsideParcel }));
  }, [address, coordinates, destinations, flowState, outsideParcel, settings, signs, source]);

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
    setPhotos((current) => {
      if (current[slot]) URL.revokeObjectURL(current[slot].url);
      return { ...current, [slot]: { url: URL.createObjectURL(file), capturedAt: new Date(file.lastModified || Date.now()).toISOString(), coordinates } };
    });
    preparedPhotos.forEach((item) => URL.revokeObjectURL(item.url));
    Object.values(preparedStatements).forEach((item) => item && URL.revokeObjectURL(item.url));
    setPreparedPhotos([]);
    setPreparedStatements({});
  }

  function complaintFor(recipient: (typeof recipientRules)[keyof typeof recipientRules]) {
    return `Кому: ${recipient.name}\n\nЗАЯВЛЕНИЕ\nо признаках незаконного сброса неочищенных сточных вод\n\n${standardizedDescription}\n\nТочный владелец, источник стоков и правовые основания размещения коммуникации заявителю неизвестны и подлежат установлению уполномоченным органом.\n\nПРОШУ:\n1. Зарегистрировать заявление как содержащее сведения о причинении вреда или угрозе причинения вреда охраняемым законом ценностям.\n2. ${recipient.request.charAt(0).toUpperCase()}${recipient.request.slice(1)}.\n3. Установить источник сточных вод, трассу коммуникации и эксплуатирующее ее лицо.\n4. Принять меры к прекращению сброса, устранению последствий, демонтажу незаконной коммуникации и восстановлению территории за счет виновного лица при наличии оснований.\n5. Сообщить регистрационный номер, результаты обследования и конкретные принятые меры.\n6. При отсутствии компетенции направить материалы по подведомственности и уведомить заявителя.\n\nПриложения: три фотографии — общий вид, точка слива и инженерная коммуникация.`;
  }

  function openSubmission(key: keyof typeof recipientRules) {
    const recipient = recipientRules[key];
    void navigator.clipboard.writeText(shortComplaintFor(key));
    window.open(recipient.portal, '_blank', 'noopener,noreferrer');
  }

  async function prepareSharedPhotos() {
    const selected = photoSlots.map((slot) => ({ slot, photo: photos[slot.id] })).filter((item): item is { slot: (typeof photoSlots)[number]; photo: CapturedPhoto } => Boolean(item.photo));
    if (selected.length !== 3) return;
    setPreparingPhotos(true);
    setPhotoPrepareError('');
    try {
      let photoBlobs = await Promise.all(selected.map(({ slot, photo }, index) => makeWatermarkedPhoto(photo, `${index + 1}. ${slot.title}`, coordinates)));
      if (photoBlobs.reduce((sum, blob) => sum + blob.size, 0) > 4.4 * 1024 * 1024) {
        photoBlobs = await Promise.all(selected.map(({ slot, photo }, index) => makeWatermarkedPhoto(photo, `${index + 1}. ${slot.title}`, coordinates, 1200, 0.62)));
      }
      const totalSize = photoBlobs.reduce((sum, blob) => sum + blob.size, 0);
      if (totalSize > 4.5 * 1024 * 1024) throw new Error('Три фотографии занимают слишком много места. Попробуйте переснять их с меньшим разрешением.');
      preparedPhotos.forEach((item) => URL.revokeObjectURL(item.url));
      const files = [
        { name: '01-obshchiy-vid.jpg', label: '1. Общий вид', url: URL.createObjectURL(photoBlobs[0]), size: photoBlobs[0].size },
        { name: '02-tochka-sliva.jpg', label: '2. Точка слива', url: URL.createObjectURL(photoBlobs[1]), size: photoBlobs[1].size },
        { name: '03-kommunikatsiya.jpg', label: '3. Коммуникация', url: URL.createObjectURL(photoBlobs[2]), size: photoBlobs[2].size },
      ];
      setPreparedPhotos(files);
    } catch (error) {
      setPhotoPrepareError(error instanceof Error ? error.message : 'Не удалось подготовить фотографии');
    } finally {
      setPreparingPhotos(false);
    }
  }

  async function prepareStatement(key: keyof typeof recipientRules) {
    setPreparingStatementFor(key);
    setStatementErrors((current) => ({ ...current, [key]: '' }));
    try {
      const blob = await makeStatementImage(complaintFor(recipientRules[key]));
      const photosSize = preparedPhotos.reduce((sum, file) => sum + file.size, 0);
      if (photosSize + blob.size > 5 * 1024 * 1024) throw new Error('Общий размер фотографий и заявления превышает 5 МБ. Сначала подготовьте фотографии заново.');
      if (preparedStatements[key]) URL.revokeObjectURL(preparedStatements[key].url);
      const statement = { name: `04-polnoe-zayavlenie-${key}.jpg`, label: 'Полное заявление', url: URL.createObjectURL(blob), size: blob.size };
      setPreparedStatements((current) => ({ ...current, [key]: statement }));
    } catch (error) {
      setStatementErrors((current) => ({ ...current, [key]: error instanceof Error ? error.message : 'Не удалось подготовить заявление' }));
    } finally {
      setPreparingStatementFor(null);
    }
  }

  function saveTracking(key: keyof typeof recipientRules, value: string) {
    setTracking((current) => ({ ...current, [key]: value }));
    const sentAt = new Date();
    const record: SubmissionRecord = { id: `${key}-${sentAt.getTime()}`, recipient: key, trackingId: value.trim(), address, sentAt: sentAt.toISOString(), checkAt: futureDate(30).toISOString() };
    setSubmissions((current) => {
      const records = record.trackingId
        ? [...current.filter((item) => !(item.recipient === key && item.trackingId === record.trackingId)), record]
        : [...current, record];
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

  function addTrackingLater(record: SubmissionRecord, value: string) {
    if (!value.trim()) return;
    setSubmissions((current) => {
      const records = current.map((item) => {
        const sameRecord = record.id ? item.id === record.id : item.recipient === record.recipient && item.sentAt === record.sentAt;
        return sameRecord ? { ...item, trackingId: value.trim() } : item;
      });
      localStorage.setItem('eco-fix-submissions-v1', JSON.stringify(records));
      return records;
    });
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
            <p className="mt-2 text-sm leading-6 text-emerald-50/80">Три фотографии подготовьте и сохраните один раз. Для каждого ведомства отдельно сохраните только его заявление JPG; короткий текст скопируется при нажатии «Открыть и подать».</p>
          </section>
          <section className="surface-card">
            <div className="flex gap-3"><span className="step-number"><Images className="size-4" /></span><div><h2 className="font-bold">Общие фотографии</h2><p className="mt-0.5 text-xs text-muted-foreground">Одни и те же три файла для всех ведомств</p></div></div>
            <Button type="button" variant="outline" className="mt-4 h-11 w-full" onClick={prepareSharedPhotos} disabled={preparingPhotos}>{preparingPhotos ? <LoaderCircle className="animate-spin" /> : <Images />}Подготовить 3 фото один раз</Button>
            {photoPrepareError && <p className="mt-2 text-xs font-medium text-red-700">{photoPrepareError}</p>}
            {preparedPhotos.length > 0 && <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Фото с датой, временем и координатами</span><strong>{formatSize(preparedPhotos.reduce((sum, file) => sum + file.size, 0))}</strong></div>
              {preparedPhotos.map((file) => <Button key={file.name} type="button" variant="outline" className="h-10 w-full justify-between bg-white px-3" onClick={() => downloadPreparedFile(file)}><span className="truncate">{file.label}</span><span className="flex items-center gap-1 text-xs text-muted-foreground">{formatSize(file.size)} <Download className="size-4" /></span></Button>)}
              <p className="text-xs leading-5 text-muted-foreground">Сохраните эти три JPG в «Загрузки» один раз и прикладывайте их к каждому обращению.</p>
            </div>}
          </section>
          {recipients.map((key, index) => {
            const recipient = recipientRules[key];
            const shortText = shortComplaintFor(key);
            const statement = preparedStatements[key];
            const packageSize = preparedPhotos.reduce((sum, file) => sum + file.size, statement?.size || 0);
            const isPreparing = preparingStatementFor === key;
            return (
              <section key={key} className="surface-card">
                <div className="flex gap-3"><span className="step-number">{index + 1}</span><div className="min-w-0 flex-1"><h2 className="font-bold">{recipient.shortName}</h2><p className="mt-0.5 text-xs text-muted-foreground">{recipient.category}</p></div></div>
                <div className="mt-4 rounded-xl border border-emerald-900/15 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-emerald-950">Короткий текст для формы</p><Badge variant="secondary">{shortText.length} / 500</Badge></div>
                  <p className="mt-2 text-xs leading-5 text-emerald-950/80">{shortText}</p>
                  <Button type="button" variant="outline" className="mt-3 h-11 w-full bg-white" onClick={() => prepareStatement(key)} disabled={preparingStatementFor !== null}>{isPreparing ? <LoaderCircle className="animate-spin" /> : <FileText />}Подготовить заявление JPG</Button>
                  {statementErrors[key] && <p className="mt-2 text-xs font-medium text-red-700">{statementErrors[key]}</p>}
                  {statement && <div className="mt-3 space-y-2">
                    <Button type="button" variant="outline" className="h-10 w-full justify-between bg-white px-3" onClick={() => downloadPreparedFile(statement)}><span className="truncate">Скачать заявление JPG</span><span className="flex items-center gap-1 text-xs text-muted-foreground">{formatSize(statement.size)} <Download className="size-4" /></span></Button>
                    <div className="flex items-center justify-between text-xs text-emerald-950/75"><span>3 общих фото + это заявление</span><strong>{formatSize(packageSize)} из 5 МБ</strong></div>
                  </div>}
                </div>
                <details className="mt-4 rounded-xl bg-stone-50 p-3 text-sm"><summary className="cursor-pointer font-semibold"><FileText className="mr-1.5 inline size-4" />Полное заявление</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-5 text-stone-700">{complaintFor(recipient)}</pre></details>
                <Button onClick={() => openSubmission(key)} className="mt-3 h-12 w-full rounded-xl bg-emerald-700 text-base hover:bg-emerald-800">Открыть и подать <ExternalLink className="size-4" /></Button>
                <div className="mt-3 rounded-xl border border-border bg-stone-50 p-3">
                  <label className="field-label" htmlFor={`tracking-${key}`}>Номер обращения — если пришёл</label>
                  <p className="mt-1 text-xs text-muted-foreground">Если номера ещё нет, сохраните отправку без него — номер можно добавить позже.</p>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <Input id={`tracking-${key}`} value={tracking[key] || ''} onChange={(event) => setTracking((current) => ({ ...current, [key]: event.target.value }))} placeholder="Например, P001-…" className="h-11 bg-white" />
                    <Button variant="outline" className="h-11" onClick={() => saveTracking(key, tracking[key] || '')}>Сохранить отправку</Button>
                  </div>
                  <Button variant="ghost" className="mt-2 w-full text-emerald-800" onClick={() => downloadReminder(key)}><CalendarClock />Напомнить через 30 дней</Button>
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
            <div className="section-heading"><span className="step-number"><CalendarClock className="size-4" /></span><div><h2>Контроль обращений</h2><p>Данные об отправках хранятся на этом телефоне</p></div></div>
            <div className="space-y-2">
              {submissions.slice().reverse().slice(0, 4).map((record) => {
                const due = isSubmissionDue(record.checkAt);
                const recordKey = record.id || `${record.recipient}-${record.sentAt}`;
                return (
                  <div key={recordKey} className="flex items-start gap-3 rounded-xl border border-border bg-stone-50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{recipientRules[record.recipient].shortName}{record.trackingId ? ` · № ${record.trackingId}` : ' · номер пока не получен'}</p>
                      <p className="text-xs text-muted-foreground">{due ? 'Срок проверки наступил' : `Проверить ${new Date(record.checkAt).toLocaleDateString('ru-RU')}`}</p>
                      {!record.trackingId && <div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><Input aria-label="Добавить номер обращения" value={lateTracking[recordKey] || ''} onChange={(event) => setLateTracking((current) => ({ ...current, [recordKey]: event.target.value }))} placeholder="Добавить номер позже" className="h-9 bg-white text-xs" /><Button type="button" variant="outline" className="h-9 px-3" onClick={() => addTrackingLater(record, lateTracking[recordKey] || '')}>Добавить</Button></div>}
                    </div>
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
            <label className="field-label" htmlFor="address">Предполагаемый адрес источника</label>
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
            {photoSlots.map((slot, index) => {
              const photo = photos[slot.id];
              return <label key={slot.id} className="photo-slot">
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => onPhoto(slot.id, event.target.files?.[0])} />
                {photo ? <><img src={photo.url} alt={slot.title} /><span className="photo-check"><Check /></span></> : <div className="grid aspect-[4/5] place-items-center bg-stone-100"><Camera className="size-6 text-stone-500" /></div>}
                <strong>{index + 1}. {slot.title}</strong><small>{slot.hint}</small>
              </label>;
            })}
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
              <CheckRow checked={outsideParcel} onChange={() => setOutsideParcel(!outsideParcel)} label="Выпуск выведен за границы участка" />
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
