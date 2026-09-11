import { describe, expect, it } from 'vitest';
import { findCandidates, parseQuery, partMatchesQuery } from '../src/shared/matcher';
import { classifyText } from '../src/shared/classify';
import { assignPages } from '../src/shared/assign';
import { partFromFilename } from '../src/shared/filename';
import { normalizeText, tokenize } from '../src/shared/normalize';
import type { PageAnalysis } from '../src/shared/types';

const best = (text: string) => classifyText(text);

describe('normalize', () => {
  it('löst Umlaute und Bindestriche auf und trennt angehängte Ziffern', () => {
    expect(normalizeText('Flöte 2 / Solo-Trompete')).toBe('floete 2 / solo trompete');
    expect(tokenize(normalizeText('Flote2')).map((t) => t.text)).toEqual(['flote', '2']);
    expect(tokenize(normalizeText('1. Stimme (B)')).map((t) => [t.text, t.parenthesized])).toEqual([
      ['1.', false],
      ['stimme', false],
      ['b', true],
    ]);
  });
});

describe('findCandidates / classify – echte OCR-Strings', () => {
  it('Trompete 2 in B (sauber)', () => {
    const c = best('Trompete 2 in B\n"SOUTHBRASS" - Originalnoten\nBrass Mood\nMusik: Markus Oberrauch');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'trompete', numbers: [2], key: 'B' });
  });

  it('Trompete 2 inB ohne Leerzeichen', () => {
    const c = best('Trompete 2 inB "SOUTHBRAS. Rrace');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'trompete', numbers: [2] });
  });

  it('OCR-Fehler "Tromnete 72? inB"', () => {
    const c = best('Tromnete 72? inB SOL');
    expect(c.part?.instrument).toBe('trompete');
    expect(c.kind).not.toBe('sonstiges');
  });

  it('Flote2 zentriert unter dem Titel, Text: ist kein Gesang', () => {
    const c = best('Chianti-Lied\n(Ja~ja-der Chiantiwein)\nTarantella\nText: Ralph Maria Siegel\nMusik:Gerhard Winkler\nFlote2\nArrang: Erich Gutzeit');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'floete', numbers: [2] });
  });

  it('F Horn Melody 1 (ossia Tenorhorn) → Horn 1 in F', () => {
    const c = best('Words and Music:\nlossia Tenorhorn)\nF Horn Melody 1\nHEY JUDE 2°89\nJ. Lannon / P. McCartney');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'horn', numbers: [1], key: 'F' });
  });

  it('Guitar (optional)', () => {
    const c = best('Guitar\n(optional)\nHEY JUDE 983');
    expect(c.part?.instrument).toBe('gitarre');
  });

  it('Schlagzeug', () => {
    const c = best('Schlagzeug "SOUTHBRASS" - Originalnoten Brass Mood');
    expect(c.kind).toBe('stimme');
    expect(c.part?.instrument).toBe('schlagzeug');
  });

  it('Partitur-Seite per Schlüsselwort', () => {
    const c = best('Partitur   Böhmischer Traum   Norbert Gälle\nSolo-Trompete in B');
    expect(c.kind).toBe('partitur');
  });

  it('Partitur-Folgeseite per Instrumentenliste', () => {
    const c = best('2\nSolo-Tromp. (B)\n1. Stimme (B)\n2. Stimme (B)\n3. Stimme (Es)\n4. Stimme (B)\nBegleitung/Akkordeon\nSchlagzeug');
    expect(c.kind).toBe('partitur');
  });

  it('Radetzky Partitur mit Flügelhorn 1, Flügelhorn 2, Trompete', () => {
    const c = best('Partitur  Radetzky-Marsch  Arr.: M. Klostermann\nFlügelhorn 1 &b C\nFlügelhorn 2 & b C\nTrompete &b C');
    expect(c.kind).toBe('partitur');
  });

  it('Generische Stimme "1. Stimme (B)"', () => {
    const c = best('1. Stimme (B)\nBöhmischer Traum');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'stimme', numbers: [1], key: 'B' });
  });

  it('Alias ordnet "1. Stimme (B)" der Trompete 1 zu', () => {
    const c = classifyText('1. Stimme (B)\nBöhmischer Traum', { aliases: [{ pattern: '1. Stimme (B)', target: 'Trompete 1' }] });
    expect(c.part).toMatchObject({ instrument: 'trompete', numbers: [1] });
  });

  it('Titel "Polka für Trompete" mit Kopf Flügelhorn 1 → Flügelhorn 1', () => {
    const c = best('Flügelhorn 1\nPolka für Trompete\nMusik: X');
    expect(c.part).toMatchObject({ instrument: 'fluegelhorn', numbers: [1] });
  });

  it('Tenorhorn/Bariton in Bassschlüssel', () => {
    const c = best('Bariton in C (Bassschlüssel)\nTitel');
    expect(c.part).toMatchObject({ instrument: 'bariton', key: 'C', clef: 'bs' });
  });

  it('Englisch: 1st Bb Trumpet', () => {
    const c = best('1st Bb Trumpet\nSome Title');
    expect(c.part).toMatchObject({ instrument: 'trompete', numbers: [1], key: 'B' });
  });

  it('Italienisch: Tromba II', () => {
    const c = best('Tromba II\nTitolo');
    expect(c.part).toMatchObject({ instrument: 'trompete', numbers: [2] });
  });

  it('Trompete 1/2', () => {
    const c = best('Trompete 1/2 in B');
    expect(c.part).toMatchObject({ instrument: 'trompete', numbers: [1, 2] });
  });

  it('Seite ohne Kopf', () => {
    const c = best('2\nmf   cresc.   ff');
    expect(c.kind).toBe('sonstiges');
  });

  it('Bass Drum ist Schlagzeug, E-Bass ist Bassgitarre, Bass allein ist Tuba', () => {
    expect(best('Bass Drum').part?.instrument).toBe('schlagzeug');
    expect(best('E-Bass').part?.instrument).toBe('bassgitarre');
    expect(best('Bass in B').part?.instrument).toBe('tuba');
  });
});

describe('parseQuery / partMatchesQuery', () => {
  it('parst Anfragen', () => {
    expect(parseQuery('Trompete 1')).toMatchObject({ instrument: 'trompete', numbers: [1] });
    expect(parseQuery('trumpet 1')).toMatchObject({ instrument: 'trompete', numbers: [1] });
    expect(parseQuery('Tenorhorn')).toMatchObject({ instrument: 'tenorhorn', numbers: [] });
    expect(parseQuery('xyz')).toBeUndefined();
  });
  it('vergleicht Stimmen', () => {
    const q = parseQuery('Trompete 1')!;
    expect(partMatchesQuery({ instrument: 'trompete', numbers: [1], key: 'B' }, q)).toBe(true);
    expect(partMatchesQuery({ instrument: 'trompete', numbers: [1, 2] }, q)).toBe(true);
    expect(partMatchesQuery({ instrument: 'trompete', numbers: [2] }, q)).toBe(false);
    expect(partMatchesQuery({ instrument: 'trompete', numbers: [] }, q)).toBe(false);
    expect(partMatchesQuery({ instrument: 'trompete', numbers: [] }, q, { includeUnnumbered: true })).toBe(true);
    expect(partMatchesQuery({ instrument: 'fluegelhorn', numbers: [1] }, q)).toBe(false);
  });
});

describe('partFromFilename', () => {
  it('erkennt Stimmen am Ende des Dateinamens', () => {
    expect(partFromFilename('Kaiserin Sissi Tenor.pdf')).toMatchObject({ instrument: 'tenorhorn' });
    expect(partFromFilename("Don't Stop Believin Posaune 2 in B.pdf")).toMatchObject({ instrument: 'posaune', numbers: [2], key: 'B' });
    expect(partFromFilename('Ein Leben Lang Bariton in B.pdf')).toMatchObject({ instrument: 'bariton', key: 'B' });
    expect(partFromFilename('Einwürfe Tenor.pdf')).toMatchObject({ instrument: 'tenorhorn' });
  });
  it('ignoriert Titel mit Instrumentennamen', () => {
    expect(partFromFilename('Polka für Trompete.pdf')).toBeUndefined();
    expect(partFromFilename('Tuba Wahnsinn.pdf')).toBeUndefined();
    expect(partFromFilename('Farmers Tuba.pdf')).toBeUndefined();
    expect(partFromFilename('Trumpet Dance.pdf')).toBeUndefined();
    expect(partFromFilename('Goldene Trompeten.pdf')).toBeUndefined();
    expect(partFromFilename('Hey Jude.pdf')).toBeUndefined();
  });
});

describe('assignPages', () => {
  const page = (page: number, kind: PageAnalysis['kind'], part?: PageAnalysis['part']): PageAnalysis => ({
    page, kind, part, confidence: kind === 'stimme' ? 0.9 : 0, candidates: [], text: '', source: 'ocr',
  });
  const trp1 = { instrument: 'trompete', numbers: [1] };
  const trp2 = { instrument: 'trompete', numbers: [2] };

  it('Überschrift gilt bis zur nächsten, Partitur unterbricht', () => {
    const a = assignPages([
      page(1, 'partitur'), page(2, 'partitur'),
      page(3, 'stimme', trp1), page(4, 'sonstiges'), page(5, 'unsicher', { instrument: 'horn', numbers: [] }),
      page(6, 'stimme', trp2), page(7, 'sonstiges'),
      page(8, 'partitur'), page(9, 'sonstiges'),
    ]);
    expect(a.map((x) => [x.page, x.kind, x.part?.numbers?.[0]])).toEqual([
      [1, 'partitur', undefined], [2, 'partitur', undefined],
      [3, 'stimme', 1], [4, 'stimme', 1], [5, 'unsicher', 1],
      [6, 'stimme', 2], [7, 'stimme', 2],
      [8, 'partitur', undefined], [9, 'sonstiges', undefined],
    ]);
    expect(a[3].source).toBe('fortsetzung');
    expect(a[3].headerPage).toBe(3);
  });

  it('Dateiname deckt Datei ohne erkannte Überschriften ab', () => {
    const a = assignPages([page(1, 'sonstiges'), page(2, 'sonstiges')], { instrument: 'tenorhorn', numbers: [] });
    expect(a.every((x) => x.kind === 'stimme' && x.part?.instrument === 'tenorhorn' && x.source === 'dateiname')).toBe(true);
  });

  it('Dateiname wird ignoriert, wenn die Seiten mehrere Stimmen zeigen', () => {
    const a = assignPages([page(1, 'stimme', trp1), page(2, 'stimme', trp2)], { instrument: 'tuba', numbers: [] });
    expect(a.map((x) => x.part?.instrument)).toEqual(['trompete', 'trompete']);
  });
});

describe('Rundel "Quintett +": Stimme mit Instrumentenliste ist keine Partitur', () => {
  it('"3. Stimme in Bb … Tenorhorn, Tenorsaxophon 1, Posaune 1" ist Stimme 3 in B mit Zweitbezeichnungen', () => {
    const c = classifyText('Donle& KLEINE BLASMUSIK Quintett + 3. Stimme in Bb Böhmischer Traum Norbert Gälle Tenorhorn, Tenorsaxophon 1, Bearb.: Siegfried Rundel Polka Posaune 1 5| 1.x Soli,2. xtacetbis *, 3. x Tutti');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'stimme', numbers: [3], key: 'B' });
    expect(c.alsoParts?.map((p) => p.instrument)).toEqual(expect.arrayContaining(['tenorhorn', 'tenorsax', 'posaune']));
  });
  it('"1. Stimme in C Flügelhorn 1, Trompete 1, Oboe" ist Stimme 1 in C, Zweitstimmen erben die Stimmung', () => {
    const c = classifyText('Daud& KLEINE BLASMUSIK Quintett + Norbert Gälle Böhmischer Traum 1. Stimme in C Flügelhorn 1, Trompete 1, Bearb.: Siegfried Rundel Polka Oboe 5 1.xtacetbis *');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'stimme', numbers: [1], key: 'C' });
    const trp = c.alsoParts?.find((p) => p.instrument === 'trompete');
    expect(trp).toMatchObject({ numbers: [1], key: 'C' });
  });
  it('"Begleitung 1, 2 in C … Bariton, Posaune" ist Akkordeon 1/2 in C', () => {
    const c = classifyText('Dlslk KLEINE BLASMUSIK Quintett + Begleitung 1, 2 in C Böhmischer Traum Norbert Gälle (ad libitum) Bearb.: Siegfried Rundel Polka Bariton, Posaune mf 13 10 21 20');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'akkordeon', numbers: [1, 2], key: 'C' });
    expect(c.alsoParts?.map((p) => p.instrument)).toEqual(expect.arrayContaining(['bariton', 'posaune']));
  });
  it('Partiturseite mit Solo-Trompete vor "1. Stimme" und weiteren Instrumenten bleibt Partitur', () => {
    const c = classifyText('Solo-Trompete in B (ad libitum) 1. Stimme in B (Flügelhorn 1) Tenorhorn Bariton Schlagzeug');
    expect(c.kind).toBe('partitur');
  });
});

describe('Regeln aus dem Testlauf', () => {
  it('Partitur-Folgeseite mit Solo-Tromp. und 1./2./3. Stimme', () => {
    const c = classifyText('3 1 33 l2. 34 39 38 Fine 36 40 35 Sola Solo-Tromp. (B) nur 1. x ---J f 1. Stimme (B) 2. Stimme (B») 3. Stimme (B)');
    expect(c.kind).toBe('partitur');
  });
  it('zusammengeklebte Tokens "Klarinette 1in B", "Posaune 1in C", "Klarinette 3in.B"', () => {
    expect(classifyText('Musik:Gerhard Winkler Klarinette 1in B Arrang: E').part).toMatchObject({ instrument: 'klarinette', numbers: [1], key: 'B' });
    expect(classifyText('Posaune 1in C Brass Mood').part).toMatchObject({ instrument: 'posaune', numbers: [1], key: 'C' });
    expect(classifyText('Klarinette 3in.B Arrang').part).toMatchObject({ instrument: 'klarinette', numbers: [3], key: 'B' });
  });
  it('römische Ziffer als OCR-Fehler "Posaune IL in B"', () => {
    expect(classifyText('Posaune IL in B 5 Chianti Lied').part).toMatchObject({ instrument: 'posaune', numbers: [2], key: 'B' });
  });
  it('"Tuba1u.2" und "Begleitung 1, 2 in F" und "3.4. Horn in F"', () => {
    expect(classifyText('Musik:Gerhard Winkler Tuba1u.2 Arrang').part).toMatchObject({ instrument: 'tuba', numbers: [1, 2] });
    expect(classifyText('Quintett + Begleitung 1, 2 in F Böhmischer Traum').part).toMatchObject({ instrument: 'akkordeon', numbers: [1, 2], key: 'F' });
    expect(classifyText('3.4. Horn in F Polka').part).toMatchObject({ instrument: 'horn', numbers: [3, 4], key: 'F' });
  });
  it('"Solo-Tromp. (B5" liest keine Nummer 5', () => {
    const c = classifyText('Solo-Tromp. (B5 spielen');
    expect(c.part).toMatchObject({ instrument: 'trompete', numbers: [] });
  });
  it('Doppelbelegung "4. Stimme in C … Bariton, Posaune 2" gilt auch für Bariton und Posaune 2', () => {
    const c = classifyText('KLEINE BLASMUSIK Quintett + 4. Stimme in C Böhmischer Traum Norbert Gälle Bariton, Posaune 2 Bearb.: Siegfried Rundel');
    expect(c.kind).toBe('stimme');
    const all = [c.part!, ...(c.alsoParts ?? [])].map((p) => `${p.instrument}:${p.numbers.join('/')}`);
    expect(all).toContain('stimme:4');
    expect(all).toContain('bariton:');
    expect(all).toContain('posaune:2');
  });
  it('Titelwort: "Polka für Trompete" mit Kopf Schlagzeug → Schlagzeug', () => {
    const c = classifyText('Mit Slowakische Blaskapelle auf CD 73 Adam HUDEC Polka für Trompete Schlagzeug Virtuospolka für Solo Trompete', { title: 'Polka für Trompete' });
    expect(c.part?.instrument).toBe('schlagzeug');
    expect(c.alsoParts ?? []).toEqual([]);
  });
  it('Titelwort: "Solo Trompete in B" bleibt trotz Titel eine Stimme (Stimmung vorhanden)', () => {
    const c = classifyText('Polka für Trompete Solo Trompete in B Adam HUDEC', { title: 'Polka für Trompete' });
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'trompete', key: 'B' });
  });
  it('"Bass in Es" ist Tuba in Es', () => {
    expect(classifyText('Musik: Markus Oberrauch, Bass in Es Brass Mood').part).toMatchObject({ instrument: 'tuba', key: 'Es' });
  });
});

describe('Nummern und Fuzzy-Grenzen', () => {
  it('"Polka für Trompete 1. Posaune in C" gibt Trompete keine Nummer', () => {
    const c = classifyText('Polka für Trompete 1. Posaune in C Adam HUDEC', { title: 'Polka für Trompete' });
    expect(c.part).toMatchObject({ instrument: 'posaune', numbers: [1], key: 'C' });
    expect((c.alsoParts ?? []).map((p) => p.instrument)).not.toContain('trompete');
  });
  it('"Maria" ist kein Marimba', () => {
    expect(findCandidates('Text: Ralph Maria Siegel').map((c) => c.instrument)).toEqual([]);
  });
});

describe('Notengrafik-Müll und Direktionsstimme', () => {
  it('"CL 2, CL a CL" aus Notengrafik macht keine Partitur', () => {
    const c = classifyText("Schlagzeug “SOUTHBRASS” - Originalnoten Musik : Markus Oberrauch, Brass Mood J=80 Shuffle N's 3 _— = == — I) = A = WA [— - fr € nf 6 = CL 2, CL a CL > I= - Ei] = - rr 177", { title: 'Brass Mood' });
    expect(c.kind).toBe('stimme');
    expect(c.part?.instrument).toBe('schlagzeug');
  });
  it('Untertitel "für Solo Trompete und Blasorchester" liefert keine Trompete 2', () => {
    const c = classifyText('Mut Slowakische Blaskapelle auf CD 73 3, Posaune in C Polka fiir Trompete Adam HUDEC Virtuospolka fiir Solo Trompete und Blasorchester 2 = 130 DK', { title: 'Polka für Trompete' });
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'posaune', numbers: [3], key: 'C' });
    expect((c.alsoParts ?? []).map((p) => p.instrument)).not.toContain('trompete');
  });
  it('"Flügelhorn 1 in B (Direktion)" ist die Flügelhorn-1-Stimme', () => {
    const c = classifyText('Chianti-Lied Tarantella Arrang: Erich Gutzeit Tempo di Tarantella Flügelhorn 1in B C Direktion) Li');
    expect(c.kind).toBe('stimme');
    expect(c.part).toMatchObject({ instrument: 'fluegelhorn', numbers: [1] });
  });
  it('"Partitur … Solo-Trompete in B" bleibt Partitur', () => {
    expect(classifyText('Partitur   Böhmischer Traum   Norbert Gälle\nSolo-Trompete in B').kind).toBe('partitur');
  });
});

describe('Partitur-Folgeseiten und vorangestellte Stimmung', () => {
  it('"B Tpt. 1 Lead, B Tpt. 2, B Tpt. 3" ist eine Partiturseite', () => {
    expect(classifyText('2 A 11 B Tpt. 1 Lead B Tpt. 2 B Tpt. 3').kind).toBe('partitur');
  });
  it('"Trp. B. 1 … Trp. B. 2 … Trp. B. 3 … Pos. 1" ist eine Partiturseite', () => {
    expect(classifyText('HEAL THE WORLD 2 A 12 œ œ Trp. B. 1 % œ œ Trp. B. 2 % ο α α ˙ Trp. B. 3 % ˙ Pos. 1 α α').kind).toBe('partitur');
  });
  it('"Bb Trompete" bekommt Stimmung B und schlägt das Stichnoten-Label "Flhn. 1"', () => {
    const c = classifyText('Originalnoten von BLECHVERRÜCKT stutz music Bb Trompete Der Verliebte Musik Lorenz Maierhofer - Jodler - Arr Alexander Stütz Adagio Flhn. 1', { title: 'Der Verliebte' });
    expect(c.part).toMatchObject({ instrument: 'trompete', key: 'B' });
  });
  it('schwacher Kopf nach Partitur wird Partitur-Folgeseite', () => {
    const page = (page: number, kind: PageAnalysis['kind'], part?: PageAnalysis['part'], weak?: boolean): PageAnalysis => ({
      page, kind, part, weak, confidence: 0.8, candidates: [], text: '', source: 'text',
    });
    const a = assignPages([
      page(1, 'partitur'),
      page(2, 'stimme', { instrument: 'trompete', numbers: [1] }, true),
      page(3, 'stimme', { instrument: 'trompete', numbers: [2] }, true),
      page(4, 'stimme', { instrument: 'trompete', numbers: [1] }, false),
    ]);
    expect(a.map((x) => x.kind)).toEqual(['partitur', 'partitur', 'partitur', 'stimme']);
  });
  it('Dateiname "Fidelitas Quartette 1 Stimme in B" liefert Stimme 1 in B, "Direktion.pdf" Partitur', () => {
    expect(partFromFilename('Fidelitas Quartette 1 Stimme in B.pdf')).toMatchObject({ instrument: 'stimme', numbers: [1], key: 'B' });
    expect(partFromFilename('Direktion.pdf')).toMatchObject({ instrument: 'partitur' });
  });
});
