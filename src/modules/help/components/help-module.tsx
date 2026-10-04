"use client";
import { useState } from "react";
import { ArrowUpRight, BookOpen, ChevronRight, Compass, Search } from "lucide-react";
import { Button, Empty, PageHeader } from "@/components/ui";
import { helpArticles, helpFaq } from "../content";
import { helpTutorials, type HelpTutorial } from "../tutorials";
import { FeedbackPanel } from "./feedback-panel";
import { HelpTutorialList, HelpTutorialPlayer } from "./help-tutorials";

export function HelpModule({
  navigate,
  onStartTour,
  initialGuide,
}: {
  navigate: (module: string) => void;
  onStartTour: () => void;
  initialGuide?: string;
}) {
  const [tab, setTab] = useState("guides");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(
    () => helpArticles.find((article) => article.id === initialGuide)?.id ?? helpArticles[0].id,
  );
  const [playing, setPlaying] = useState<HelpTutorial | null>(null);
  const query = search.trim().toLowerCase();
  const articles = helpArticles.filter((article) =>
    `${article.title} ${article.intro} ${article.steps.join(" ")} ${helpTutorials
      .filter((tutorial) => tutorial.guideId === article.id)
      .map((tutorial) => `${tutorial.title} ${tutorial.description} ${tutorial.steps.join(" ")}`)
      .join(" ")}`
      .toLowerCase()
      .includes(query),
  );
  const article = articles.find((article) => article.id === selected) || articles[0];
  const faq = helpFaq.filter(([question, answer]) =>
    `${question} ${answer}`.toLowerCase().includes(query),
  );
  const tutorials = helpTutorials.filter((tutorial) =>
    `${tutorial.title} ${tutorial.description} ${tutorial.steps.join(" ")} ${
      tutorial.platform === "ios"
        ? "iPhone iPad iOS Apple"
        : tutorial.platform === "android"
          ? "Android"
          : "alle Geräte"
    }`
      .toLowerCase()
      .includes(query),
  );
  return (
    <>
      <PageHeader
        eyebrow="SICHER DURCH DEN ARBEITSALLTAG"
        title="Hilfe & Orientierung"
        description="Anleitungen für eure gemeinsame Arbeit, Antworten und Raum für Verbesserungen."
      >
        <Button onClick={onStartTour}>
          <Compass size={17} />
          Einführung neu starten
        </Button>
      </PageHeader>
      <div className="help-welcome">
        <BookOpen size={26} strokeWidth={1.6} />
        <div>
          <h2>Gut zu wissen, schnell zu finden.</h2>
          <p>Wähle eine Anleitung oder suche nach deinem nächsten Arbeitsschritt.</p>
        </div>
      </div>
      <div className="tabs help-tabs" aria-label="Hilfebereiche">
        {[
          ["guides", "Anleitungen"],
          ["videos", "Kurzvideos"],
          ["faq", "Häufige Fragen"],
          ["feedback", "Ideen & Fehler"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setSearch("");
              setPlaying(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab !== "feedback" && (
        <div className="help-search">
          <Search size={18} />
          <input
            aria-label="Hilfe durchsuchen"
            placeholder="Zum Beispiel App installieren, Bilder oder Freiwunsch …"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPlaying(null);
            }}
          />
        </div>
      )}
      {tab === "feedback" ? (
        <FeedbackPanel />
      ) : tab === "videos" ? (
        <HelpTutorialList tutorials={tutorials} onOpen={setPlaying} />
      ) : tab === "faq" ? (
        <section className="faq-list" aria-label="Häufige Fragen">
          {faq.length ? (
            faq.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronRight size={18} />
                </summary>
                <p>{answer}</p>
              </details>
            ))
          ) : (
            <Empty
              title="Keine passende Antwort gefunden."
              description="Versuche einen anderen Begriff oder teile dein Anliegen unter Ideen & Fehler."
            />
          )}
        </section>
      ) : article ? (
        <div className="help-layout">
          <nav className="help-article-nav" aria-label="Anleitungen">
            {articles.map((item) => (
              <button
                key={item.id}
                className={item.id === article.id ? "active" : ""}
                aria-current={item.id === article.id ? "page" : undefined}
                onClick={() => {
                  setSelected(item.id);
                  setPlaying(null);
                }}
              >
                {item.title}
                <ChevronRight size={15} />
              </button>
            ))}
          </nav>
          <label className="help-mobile-select">
            Anleitung auswählen
            <select
              value={article.id}
              onChange={(event) => {
                setSelected(event.target.value);
                setPlaying(null);
              }}
            >
              {articles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <article className="help-article">
            <header>
              <p className="eyebrow">ARBEITSANLEITUNG</p>
              <h2>{article.title}</h2>
              <p className="muted">{article.intro}</p>
            </header>
            <HelpTutorialList
              tutorials={helpTutorials.filter((tutorial) => tutorial.guideId === article.id)}
              onOpen={setPlaying}
              compact
            />
            <ol>
              {article.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {article.note && <p className="help-note">{article.note}</p>}
            <footer>
              <Button onClick={() => navigate(article.module)}>
                Bereich öffnen
                <ArrowUpRight size={16} />
              </Button>
              <button
                className="text-button"
                onClick={() => {
                  setTab("feedback");
                  setPlaying(null);
                }}
              >
                Noch Fragen oder eine Idee?
              </button>
            </footer>
          </article>
        </div>
      ) : (
        <Empty
          title="Keine passende Anleitung gefunden."
          description="Versuche einen anderen Begriff. Unter Ideen & Fehler kannst du dein Anliegen beschreiben."
        />
      )}
      {playing && (
        <HelpTutorialPlayer key={playing.id} tutorial={playing} onClose={() => setPlaying(null)} />
      )}
    </>
  );
}
