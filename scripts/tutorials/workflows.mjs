async function productionSection(page, click, fill, label, value) {
  const selector = page.getByRole("combobox", { name: "Produktionsbereich", exact: true });
  if (await selector.isVisible()) await fill(selector, value);
  else await click(page.getByRole("button", { name: label, exact: true }));
}

export const workflows = [
  {
    id: "calendar-people",
    title: "Kalender und Kolleginnen einblenden",
    guideId: "calendar",
    module: "calendar",
    description: "Eigene Termine, einzelne Personen und den Teammonat anzeigen.",
    async run({ page, click, stage, hold }) {
      stage("Dein Kalender", "Zu Beginn siehst du deinen Kalender in der aktuellen Spielzeit.");
      await hold(2300);
      stage(
        "Tagesdetails öffnen",
        "Tippe einen Tag an. Die Tagesliste zeigt Namen und Zeiten vollständig.",
      );
      await click(page.locator('[data-calendar-day="2026-10-04"]'));
      await hold(1800);
      await click(page.getByRole("button", { name: "Tagesdetails schließen", exact: true }));
      stage("Personen auswählen", "Öffne die Kalenderauswahl und blende eine Kollegin ein.");
      await click(page.getByRole("button", { name: "1 Kalender", exact: true }));
      await click(page.getByRole("checkbox", { name: "Nora Muster", exact: true }));
      await hold(1500);
      await click(page.getByRole("button", { name: "2 Kalender", exact: true }));
      await hold(1800);
      stage("Ansicht wechseln", "Wechsle zwischen Monat, Woche, Tag und Agenda.");
      await click(page.getByRole("button", { name: "Woche", exact: true }));
      await hold(2200);
      stage(
        "Teammonat öffnen",
        "Team zeigt alle. Teammonat gibt dir den Überblick über den ganzen Monat.",
      );
      await click(page.getByRole("button", { name: "Team", exact: true }));
      await click(page.getByRole("button", { name: "Teammonat", exact: true }));
      await hold(3200);
      stage(
        "Zur eigenen Ansicht",
        "Zurück zu Monat und Nur ich zeigt wieder nur deine eigenen Termine.",
      );
      await click(page.getByRole("button", { name: "Monat", exact: true }));
      await click(page.getByRole("button", { name: "2 Kalender", exact: true }));
      await click(page.getByRole("button", { name: "Nur meinen Kalender", exact: true }));
      await click(page.getByRole("button", { name: "1 Kalender", exact: true }));
      await hold(2600);
    },
  },
  {
    id: "casting-photos",
    title: "Besetzung anlegen und Fotos ergänzen",
    guideId: "casting",
    tab: "overview",
    emptyCasting: true,
    description: "Figur und Schauspielperson verbinden und Bilder zur Besetzung hinzufügen.",
    async run({ page, click, fill, stage, hold, image }) {
      stage("Besetzung im Stück", "Öffne die Produktion und wähle Besetzung.");
      await hold(1500);
      await productionSection(page, click, fill, "Besetzung", "casting");
      await click(page.getByRole("button", { name: "Besetzung anlegen", exact: true }).first());
      stage(
        "Figur und Person wählen",
        "Wähle vorhandene Einträge. Neue Namen kannst du direkt anlegen oder frei eintragen.",
      );
      const dialog = page.getByRole("dialog");
      await fill(dialog.getByLabel("Figur auswählen"), "demo-character");
      await fill(dialog.getByLabel("Schauspielperson auswählen"), "demo-actor");
      await hold(1800);
      stage(
        "Zuordnung speichern",
        "Speichere die Besetzung. Die Details mit der Bildergalerie öffnen sich direkt.",
      );
      await click(dialog.getByRole("button", { name: "Speichern", exact: true }));
      await hold(1400);
      stage(
        "Fotos hinzufügen",
        "Tippe auf Bilder hinzufügen und wähle ein Foto. Mehrere Bilder sind möglich.",
      );
      const label = page
        .getByRole("dialog")
        .locator("label")
        .filter({ hasText: "Bilder hinzufügen" });
      const chooser = page.waitForEvent("filechooser");
      await click(label);
      await (await chooser).setFiles(image);
      await page.getByRole("dialog").locator(".gallery img").waitFor();
      await hold(2400);
      stage(
        "Alles an der Besetzung",
        "Die Bilder gehören zu dieser Besetzung. Schauspieler und Figur bleiben verknüpft.",
      );
      await hold(2800);
      const files = await page.evaluate(() => window.__DM_DEMO.workspace.records.files);
      if (!files.some((file) => file.data.recordKind === "casting"))
        throw new Error("Missing fictional casting upload");
    },
  },
  {
    id: "production-tasks",
    title: "Aufgaben im Stück verteilen",
    guideId: "tasks",
    tab: "tasks",
    description: "Aufgabe, Verantwortliche und Checkliste anlegen und den Status ändern.",
    async run({ page, click, fill, stage, hold }) {
      stage("Aufgaben im Stück", "Aufgaben & Sprints enthält das eigene Board dieser Produktion.");
      await hold(2000);
      await click(page.getByRole("button", { name: "Aufgabe", exact: true }));
      stage(
        "Aufgabe beschreiben",
        "Gib der Aufgabe einen klaren Titel und wähle bei Bedarf einen Sprint.",
      );
      const dialog = page.getByRole("dialog");
      await fill(dialog.getByLabel("Titel"), "Maske vorbereiten");
      await fill(dialog.getByLabel("Sprint"), "demo-sprint");
      stage("Verantwortliche auswählen", "Teile die Aufgabe einer oder mehreren Kolleginnen zu.");
      await click(dialog.getByRole("checkbox", { name: "Nora Muster", exact: true }));
      await hold(1300);
      stage("Checkliste ergänzen", "Lege jeden Arbeitsschritt als eigenen Eintrag an.");
      await click(dialog.getByRole("button", { name: "Eintrag hinzufügen", exact: true }));
      await fill(
        dialog.getByLabel("Checkliste · Eintrag 1", { exact: true }),
        "Material bereitlegen",
      );
      await click(dialog.getByRole("button", { name: "Speichern", exact: true }));
      await hold(1700);
      stage(
        "Fortschritt zeigen",
        "Ändere die Spalte auf In Arbeit. Am Handy geht das über die Auswahl auf der Karte.",
      );
      await fill(page.getByLabel("Status von Maske vorbereiten"), "doing");
      await hold(2800);
      const row = await page.evaluate(() =>
        window.__DM_DEMO.workspace.records.tasks.find(
          (row) => row.data.title === "Maske vorbereiten",
        ),
      );
      if (row?.data.status !== "doing" || !row.data.assigneeIds.includes("demo-nora"))
        throw new Error("Incomplete fictional task flow");
    },
  },
  {
    id: "mask-plan-blocks",
    title: "Zeitblock im Maskenplan anlegen",
    guideId: "mask-plans",
    tab: "mask-plan",
    description: "Schauspielperson, Vorlauf und Dauer festlegen und den Plan speichern.",
    async run({ page, click, fill, stage, hold }) {
      stage(
        "Der Plan zählt rückwärts",
        "Hier ist eine Personalspalte vorbereitet. −30 heißt: 30 Minuten vor Beginn.",
      );
      await hold(2200);
      await click(page.getByRole("button", { name: "Plan bearbeiten", exact: true }));
      await click(page.getByRole("button", { name: "Zeitblock", exact: true }));
      stage("Zeit und Dauer festlegen", "Trage 30 Minuten vor Beginn und 20 Minuten Dauer ein.");
      const dialog = page.getByRole("dialog");
      await fill(dialog.getByLabel("Minuten vor Beginn", { exact: true }), "30");
      await fill(dialog.getByLabel("Dauer in Minuten", { exact: true }), "20");
      stage(
        "Schauspielperson zuordnen",
        "Wähle Alex aus der Besetzung. Der Block gehört zur gewählten Personalspalte.",
      );
      await click(dialog.getByRole("checkbox", { name: "Alex Bühne", exact: true }));
      await hold(1500);
      await click(dialog.getByRole("button", { name: "Übernehmen", exact: true }));
      await hold(1500);
      stage("Echte Uhrzeiten anzeigen", "Mit Beginn 19:30 wird aus −30 die Uhrzeit 19:00.");
      await fill(page.getByLabel("Vorstellungsbeginn (optional)", { exact: true }), "19:30");
      await hold(2200);
      stage(
        "Plan speichern",
        "Übernehmen ändert zuerst den Entwurf. Plan speichern übernimmt den ganzen Ablauf.",
      );
      await click(page.getByRole("button", { name: "Plan speichern", exact: true }));
      await hold(1800);
      stage(
        "Gespeichert und kompakt",
        "Nach dem Speichern wird die Tabelle kleiner. Plan bearbeiten öffnet sie wieder größer.",
      );
      await hold(2700);
      const blocks = await page.evaluate(
        () => window.__DM_DEMO.workspace.records.maskPlans[0].data.blocks,
      );
      if (blocks.length !== 1 || blocks[0].startMinutes !== -30 || blocks[0].durationMinutes !== 20)
        throw new Error("Incomplete fictional mask plan flow");
    },
  },
  {
    id: "look-sections",
    title: "Aufschrieb mit mehreren Textfeldern",
    guideId: "looks",
    tab: "looks",
    description: "Aufschrieb zur Besetzung erstellen und Makeup-Schritte getrennt festhalten.",
    async run({ page, click, fill, stage, hold }) {
      stage(
        "Aufschrieb im Stück",
        "Öffne Aufschriebe in der Produktion und lege einen neuen Eintrag an.",
      );
      await hold(2000);
      await click(page.getByRole("button", { name: "Aufschrieb anlegen", exact: true }).first());
      const dialog = page.getByRole("dialog");
      stage(
        "Person und Figur wählen",
        "Der Schauspielername wird zum Titel. Die Zuordnung zum Stück ist schon gesetzt.",
      );
      await fill(dialog.getByLabel("Schauspielperson auswählen"), "demo-actor");
      await fill(dialog.getByLabel("Figur auswählen"), "demo-character");
      stage(
        "Makeup festhalten",
        "Wähle unter Makeup Textfeld anlegen und schreibe die erste Anweisung.",
      );
      await click(
        dialog
          .locator("fieldset.document-section")
          .filter({ has: page.locator("legend", { hasText: /^Makeup$/ }) })
          .getByRole("button", { name: "Textfeld anlegen", exact: true }),
      );
      await fill(
        dialog.getByLabel("Makeup · Text 1", { exact: true }),
        "Grundierung dünn und gleichmäßig auftragen.",
      );
      stage(
        "Weiteres Textfeld",
        "Mit Textfeld hinzufügen legst du einen weiteren Schritt in derselben Kategorie an.",
      );
      await click(
        dialog
          .locator("fieldset.document-section")
          .filter({ has: page.locator("legend", { hasText: /^Makeup$/ }) })
          .getByRole("button", { name: "Textfeld hinzufügen", exact: true }),
      );
      await fill(
        dialog.getByLabel("Makeup · Text 2", { exact: true }),
        "Augenbrauen dezent nachzeichnen.",
      );
      await hold(1700);
      stage(
        "Speichern und wiederfinden",
        "Der gespeicherte Aufschrieb steht im Stück und in der allgemeinen Aufschrieb-Sammlung.",
      );
      await click(dialog.getByRole("button", { name: "Speichern", exact: true }));
      await hold(2700);
      const row = await page.evaluate(() => window.__DM_DEMO.workspace.records.looks[0]);
      if (row?.data.sections.find((section) => section.key === "makeup")?.entries.length !== 2)
        throw new Error("Missing repeatable fictional makeup entries");
    },
  },
  {
    id: "production-time",
    title: "Zeit auf eine Produktion buchen",
    guideId: "time",
    tab: "time",
    description: "Tätigkeit und Dauer einem Stück zuordnen, getrennt von deiner Anwesenheit.",
    async run({ page, click, fill, stage, hold }) {
      stage(
        "Produktionszeit buchen",
        "Öffne Produktionsstunden im Stück. Hier buchst du deine Tätigkeit. Deine gesamte Anwesenheit trägst du separat ein.",
      );
      await hold(2300);
      await click(page.getByRole("button", { name: "Zeit nachtragen", exact: true }).first());
      const dialog = page.getByRole("dialog");
      stage(
        "Tätigkeit beschreiben",
        "Trage ein, was du gemacht hast. Die Produktion ist bereits zugeordnet.",
      );
      await fill(dialog.getByLabel("Tätigkeit", { exact: true }), "Perücke frisieren");
      await hold(1200);
      stage(
        "Dauer oder Zeitraum",
        "Wähle Dauer für eine Minutenbuchung. Beginn & Ende geht ebenfalls.",
      );
      await click(dialog.getByRole("radio", { name: "Dauer", exact: true }));
      await fill(dialog.getByLabel("Datum", { exact: true }), "2026-10-02");
      await fill(dialog.getByLabel("Dauer in Minuten", { exact: true }), "90");
      await hold(2000);
      stage(
        "Buchung speichern",
        "90 Minuten sind 1,5 Stunden Produktionsarbeit. Prüfe die Angaben und speichere.",
      );
      await click(dialog.getByRole("button", { name: "Speichern", exact: true }));
      await hold(2200);
      stage(
        "Später korrigieren",
        "Über Bearbeiten kannst du Fehler ändern. Anwesenheit erfasst du separat unter Zeit.",
      );
      await click(page.getByRole("button", { name: "Bearbeiten", exact: true }).first());
      await hold(2500);
      const row = await page.evaluate(() => window.__DM_DEMO.workspace.records.time[0]);
      if (row?.data.productionId !== "demo-production" || row.data.durationSeconds !== 5400)
        throw new Error("Incomplete fictional time booking");
    },
  },
  {
    id: "time-history",
    title: "Frühere Wochen und Kalenderzeiten prüfen",
    guideId: "time",
    module: "time",
    timeHistory: true,
    description: "Alte Stunden korrigieren, freie Tage sehen und geplante Zeiten bewusst buchen.",
    async run({ page, click, fill, stage, hold }) {
      const history = page.getByRole("region", { name: "Anwesenheit: Wochenverlauf", exact: true });
      stage(
        "Frühere Wochen finden",
        "Öffne Zeit. Im Wochenverlauf siehst du frühere Wochen mit ihren Summen.",
      );
      await hold(1800);
      await click(history.locator("summary").filter({ hasText: "KW 39 · 2026" }));
      stage(
        "Die ganze Woche sehen",
        "ABF und Ruhetag sind Tageskennzeichnungen. Sie erzeugen keine Arbeitsstunden.",
      );
      await hold(2300);
      await click(history.getByRole("button", { name: "Bearbeiten", exact: true }).first());
      stage(
        "Eine alte Buchung ändern",
        "Korrigiere Beginn, Ende oder Pause. Im Beispiel ergänzen wir 30 Minuten Pause.",
      );
      const dialog = page.getByRole("dialog");
      await fill(dialog.getByLabel("Pause in Minuten", { exact: true }), "30");
      await hold(1700);
      await click(dialog.getByRole("button", { name: "Speichern", exact: true }));
      await hold(1400);
      stage(
        "Vergangene Woche auswählen",
        "Die Summe ist aktualisiert. Wähle diese Woche, um ihre Kalenderzeiten zu prüfen.",
      );
      await click(history.getByRole("button", { name: "Diese Woche auswählen", exact: true }));
      const proposals = page.locator("details:visible").filter({
        has: page.locator("summary").filter({ hasText: "Kalenderzeiten prüfen" }),
      });
      await click(proposals.locator("summary"));
      stage(
        "Geplante Zeit prüfen",
        "Ein Kalendertermin ist noch keine Buchung. Öffne den Vorschlag und prüfe die Zeiten.",
      );
      await click(proposals.getByRole("button", { name: "Prüfen", exact: true }).first());
      await hold(1700);
      stage(
        "Tatsächliche Zeit bestätigen",
        "Ergänze deine echte Pause. Erst Geprüfte Zeit buchen speichert die Buchung.",
      );
      await fill(page.getByRole("dialog").getByLabel("Pause in Minuten", { exact: true }), "15");
      await hold(1800);
      await click(
        page.getByRole("dialog").getByRole("button", { name: "Geprüfte Zeit buchen", exact: true }),
      );
      stage(
        "Zeiten bleiben getrennt",
        "Anwesenheit und Produktionsarbeit haben eigene Verläufe und werden getrennt gebucht.",
      );
      await hold(2400);
      const rows = await page.evaluate(() => window.__DM_DEMO.workspace.records.attendance);
      if (
        rows.length !== 2 ||
        rows.reduce((sum, row) => sum + row.data.durationSeconds, 0) !== 22500
      )
        throw new Error("Incomplete fictional historical correction and reviewed calendar booking");
    },
  },
  {
    id: "private-chat",
    title: "Privaten Chat starten",
    guideId: "chat",
    module: "chat",
    description: "Eine Kollegin auswählen und eine Nachricht direkt an sie senden.",
    async run({ page, click, fill, stage, hold }) {
      stage(
        "Direkt miteinander schreiben",
        "Öffne Kommunikation und Chataktionen. Wähle dann Privater Chat.",
      );
      await hold(2200);
      const actions = page.getByRole("button", { name: "Chataktionen", exact: true });
      if (await actions.isVisible()) await click(actions);
      await click(page.getByRole("button", { name: "Privater Chat", exact: true }));
      stage(
        "Eine Kollegin auswählen",
        "Direktchat verbindet zwei Personen. Für mehrere wählst du Gruppe.",
      );
      const dialog = page.getByRole("dialog");
      await click(dialog.getByRole("radio", { name: "Nora Muster", exact: true }));
      await hold(1400);
      await click(dialog.getByRole("button", { name: "Chat starten", exact: true }));
      await hold(1800);
      stage("Nachricht schreiben", "Prüfe den Chatnamen und schreibe deine Nachricht.");
      await fill(
        page.getByLabel("Nachricht an Nora Muster", { exact: true }),
        "Können wir die Perücke morgen gemeinsam prüfen?",
      );
      await hold(1600);
      stage(
        "Nachricht senden",
        "Tippe auf Senden. Die Nachricht erscheint im gemeinsamen Verlauf.",
      );
      await click(page.getByRole("button", { name: "Senden", exact: true }));
      await page
        .getByText("Können wir die Perücke morgen gemeinsam prüfen?", { exact: true })
        .waitFor();
      await hold(2700);
      const rows = await page.evaluate(() => window.__DM_DEMO.workspace.records.messages);
      if (!rows[0]?.data.conversationId) throw new Error("Missing fictional direct chat message");
    },
  },
];
