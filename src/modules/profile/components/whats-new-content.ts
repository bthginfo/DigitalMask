import {
  CalendarClock,
  ClipboardList,
  Clock3,
  LayoutGrid,
  MessageCircle,
  Palette,
  Repeat2,
  ShieldCheck,
  Theater,
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
    text: "Klarere Schrift, ruhigere Flächen und eine schwebende Leiste unten. Hell und dunkel.",
  },
  {
    icon: CalendarClock,
    title: "Heute ist dein Tag",
    text: "Anwesenheit mit einem Tipp starten, deine Dienste von heute mit Maskenplan, Umzügen und Chat, ungelesene Chats und deine Aufgaben.",
  },
  {
    icon: ShieldCheck,
    title: "Zu erledigen für Admins",
    text: "Freiwünsche, Diensttausch, neue Registrierungen und knappes Material stehen gesammelt auf Heute. Dazu kommt jeweils eine Mitteilung.",
    adminOnly: true,
  },
  {
    icon: LayoutGrid,
    title: "Gleiche Namen überall",
    text: "Stücke, Aufgaben, Zeit und Chat heißen jetzt überall gleich. Unter „Mehr“ findest du Nachschlagen, Team und dein Konto.",
  },
  {
    icon: ClipboardList,
    title: "Meine Aufgaben aus allen Stücken",
    text: "Unter Aufgaben siehst du alles, was dir zugeteilt ist, nach Stück sortiert. Abhaken geht mit einem Tipp. Sprints sind nur noch dabei, wenn ihr sie nutzt.",
  },
  {
    icon: Repeat2,
    title: "Stücke über mehrere Spielzeiten",
    text: "Läuft ein Stück weiter, fügst du es zur aktuellen Spielzeit hinzu. Aufschriebe und Maskenpläne bleiben beim selben Stück.",
  },
  {
    icon: Theater,
    title: "Maskenplan zur Vorstellung",
    text: "Jedes Stück zeigt oben die nächste Vorstellung. Vom Termin öffnet sich der passende Maskenplan mit deiner Spalte und einer Linie für die aktuelle Uhrzeit.",
  },
  {
    icon: Clock3,
    title: "Zeit einfacher erfassen",
    text: "Startest du Produktionszeit, läuft die Anwesenheit mit. Dauern trägst du als 1:30 ein. Läuft ein Timer sehr lange, erinnert dich die App.",
  },
  {
    icon: MessageCircle,
    title: "Chat mit Sprechblasen",
    text: "Der Chat öffnet dort, wo neue Nachrichten warten. Neue Nachrichten zählt das Chat-Symbol; die Glocke bleibt für wichtige Mitteilungen.",
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
    text: "Läuft ein Stück weiter, füge es unter „Stück verwalten“ zur aktuellen Spielzeit hinzu. Aufschriebe und Maskenpläne bleiben dabei erhalten.",
  },
  {
    module: "today",
    target: ".sidebar nav",
    mobileTarget: ".bottom-nav",
    title: "Alles an seinem Platz",
    text: "Unten erreichst du die wichtigsten Bereiche. Unter „Mehr“ findest du Nachschlagen, Team und dein Konto.",
  },
];
