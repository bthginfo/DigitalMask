import {
  CalendarClock,
  ClipboardList,
  Clock3,
  LayoutGrid,
  MessageCircle,
  Palette,
  Repeat2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/**
 * Release notes for existing team members. Only things they will notice in the interface;
 * technical improvements are deliberately not mentioned.
 */
export const whatsNewHighlights: readonly {
  icon: LucideIcon;
  title: string;
  text: string;
  adminOnly?: boolean;
}[] = [
  {
    icon: Palette,
    title: "Frischer Look",
    text: "Klarere Schrift, ruhigere Flächen und eine schwebende Leiste unten. Funktioniert hell und dunkel.",
  },
  {
    icon: CalendarClock,
    title: "Heute ist dein Tag",
    text: "Anwesenheit mit einem Tipp starten, deine Dienste von heute, die Vorstellung am Abend und ungelesene Chats auf einen Blick.",
  },
  {
    icon: ShieldCheck,
    title: "Zu erledigen für Admins",
    text: "Freiwünsche, Diensttausch, neue Registrierungen und knappes Material stehen jetzt gesammelt auf Heute.",
    adminOnly: true,
  },
  {
    icon: ClipboardList,
    title: "Meine Aufgaben aus allen Stücken",
    text: "Im Bereich Aufgaben siehst du alles, was dir zugeteilt ist, nach Stück sortiert. Erledigen geht mit einem Tipp.",
  },
  {
    icon: Repeat2,
    title: "Stücke über mehrere Spielzeiten",
    text: "Ein Stück im Repertoire kann jetzt in mehreren Spielzeiten laufen. Kopieren für die Wiederaufnahme ist nicht mehr nötig.",
  },
  {
    icon: MessageCircle,
    title: "Chat wie gewohnt vom Handy",
    text: "Sprechblasen, und der Chat öffnet direkt dort, wo neue Nachrichten auf dich warten.",
  },
  {
    icon: Clock3,
    title: "Zeit einfacher erfassen",
    text: "Wenn du an einem Stück arbeitest, läuft die Anwesenheit automatisch mit. Dauern trägst du als Stunden und Minuten ein.",
  },
  {
    icon: LayoutGrid,
    title: "Aufgeräumtes Menü",
    text: "Jeder Bereich hat überall denselben Namen. Unter „Mehr“ findest du Nachschlagen, Team und Konto getrennt.",
  },
];

export type WhatsNewStep = {
  module: string;
  /** CSS selector of the element to highlight; falls back to a centred card. */
  target: string;
  mobileTarget?: string;
  title: string;
  text: string;
  adminOnly?: boolean;
};

export const whatsNewTour: readonly WhatsNewStep[] = [
  {
    module: "today",
    target: "[data-whats-new='attendance']",
    title: "Anwesenheit direkt hier",
    text: "Wenn du ins Theater kommst, starte hier deine Anwesenheit. Beim Gehen stoppst du sie an derselben Stelle.",
  },
  {
    module: "today",
    target: "[data-whats-new='today-plan']",
    title: "Dein Tag auf einen Blick",
    text: "Deine Dienste von heute und die Vorstellung am Abend. Von dort kommst du mit einem Tipp zu Maskenplan und Umzügen.",
  },
  {
    module: "today",
    target: "[data-whats-new='admin-inbox']",
    title: "Zu erledigen",
    text: "Alles, was auf eine Entscheidung von dir wartet. Tippe einen Eintrag an, um ihn direkt zu bearbeiten.",
    adminOnly: true,
  },
  {
    module: "tasks",
    target: "[data-whats-new='my-tasks']",
    title: "Meine Aufgaben",
    text: "Hier stehen alle Aufgaben, die dir zugeteilt sind, aus allen Stücken. Hake sie direkt ab.",
  },
  {
    module: "productions",
    target: "[data-whats-new='seasons']",
    title: "Repertoire über Spielzeiten",
    text: "Läuft ein Stück weiter, füge es im Menü der Produktion zur aktuellen Spielzeit hinzu. Aufschriebe und Maskenpläne bleiben dabei erhalten.",
  },
  {
    module: "today",
    target: ".sidebar nav",
    mobileTarget: ".bottom-nav",
    title: "Alles an seinem Platz",
    text: "Unten erreichst du die wichtigsten Bereiche. Unter „Mehr“ findest du Nachschlagen, Team und dein Konto.",
  },
];
